"""Human revisions of collected policies, sharing the public catalog and publication lock."""

from copy import deepcopy
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import String, case, cast, func, select, union

from app.contracts.categories import POLICY_DISPLAY_CATEGORIES, PolicyDisplayCategory
from app.contracts.parsing import PolicyExtraction, PolicyOverview, SourcePolicy
from app.modules.ingestion.models import records
from app.modules.normalization.public import normalize_conditions
from app.modules.pipeline.batching import _code_result
from app.modules.storage.catalog import card
from app.modules.storage.categories import effective_category, effective_category_expression
from app.modules.storage.publication import (
    PublicationConflict,
    change_publication,
    events_table,
    publication_transaction,
    revision_query,
)
from app.modules.storage.repository import digest, validate_draft
from app.modules.validation.public import validate_extraction

CATEGORIES = list(POLICY_DISPLAY_CATEGORIES)
DISPLAY_FIELDS = ("summary", "benefits", "region", "age", "gender", "other",
                  "application_period", "application_method", "application_url", "contact",
                  "published_date", "modified_date")


class DisplayInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    summary: str = Field(default="", max_length=5000)
    benefits: str = Field(default="", max_length=5000)
    region: str = Field(default="", max_length=5000)
    age: str = Field(default="", max_length=5000)
    gender: str = Field(default="", max_length=5000)
    other: str = Field(default="", max_length=5000)
    application_period: str = Field(default="", max_length=500)
    application_method: str = Field(default="", max_length=500)
    application_url: str = Field(default="", max_length=500)
    contact: str = Field(default="", max_length=500)
    published_date: str = Field(default="", max_length=500)
    modified_date: str = Field(default="", max_length=500)
    region_status: Literal["specified", "unrestricted", "unclear", "not_stated"] = "specified"
    age_status: Literal["specified", "unrestricted", "unclear", "not_stated"] = "specified"
    gender_status: Literal["specified", "unrestricted", "unclear", "not_stated"] = "specified"

    @field_validator("other")
    @classmethod
    def other_lines(cls, value):
        lines = [line for line in value.splitlines() if line.strip()]
        if len(lines) > 24 or any(len(line) > 300 for line in lines):
            raise ValueError("기타 조건은 최대 24줄, 한 줄 300글자입니다")
        return value


class PolicyEditInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: str = Field(pattern=r"^[a-f0-9]{64}$")
    title: str = Field(min_length=1, max_length=300)
    organization: str = Field(max_length=2000)
    source_url: str | None = Field(default=None, max_length=4000)
    fields: dict[str, str] = Field(max_length=64)
    category: PolicyDisplayCategory
    display: DisplayInput
    analysis: dict | None = None
    published: bool
    note: str = Field(min_length=1, max_length=1000)

    @field_validator("title", "note")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("빈 제목 또는 수정 사유")
        return value.strip()

    @field_validator("source_url")
    @classmethod
    def url(cls, value):
        from urllib.parse import urlsplit
        if not value:
            return None
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username \
                or parsed.password or any(ord(c) < 32 for c in value):
            raise ValueError("공식 링크는 HTTP 또는 HTTPS 주소여야 합니다")
        return value

    @field_validator("fields")
    @classmethod
    def bounded_fields(cls, value):
        if any(not k or len(k) > 80 or len(v) > 200000 or k.startswith("_editor_")
               or any(ord(c) < 32 for c in k) for k, v in value.items()):
            raise ValueError("원문 항목 이름 또는 길이를 확인하세요")
        return value


def current_record(repository, connection, key):
    docs = repository.tables["condition_documents"]
    details = repository.tables["policy_revision_details"]
    row = connection.execute(revision_query(repository).where(docs.c.policy_key == key).order_by(
        case((docs.c.review_status == "published", 2),
             (details.c.processing_json["origin"].as_string() == "server_admin_edit", 1),
             else_=0).desc(),
        docs.c.created_at.desc(), docs.c.revision_id.desc())).mappings().first()
    raw = connection.execute(select(records.c.source_json, records.c.content_hash).where(
        records.c.policy_key == key)).mappings().first()
    if row is None and (raw is None or raw["source_json"] is None):
        return None
    return dict(row) if row else {"source_json": raw["source_json"], "draft_json": {},
        "revision_id": None, "review_status": "raw", "fingerprint": raw["content_hash"]}


def edit_version(record):
    return digest({k: record.get(k) for k in (
        "revision_id", "review_status", "source_json", "draft_json", "fingerprint")})


def read_policy_edit(repository, key):
    with repository.engine.connect() as connection:
        row = current_record(repository, connection, key)
        if row is None:
            return None
        source, draft = row["source_json"], row["draft_json"]
        overview = draft.get("overview") or {}
        display = {name: "" for name in DISPLAY_FIELDS}
        if row["revision_id"]:
            display["summary"] = card(row)["summary"]
        for name, field in {"benefits": "benefits", "region": "region_conditions",
                            "age": "age_conditions", "gender": "gender_conditions",
                            **{n: n for n in DISPLAY_FIELDS[6:]}}.items():
            display[name] = (overview.get(field) or {}).get("text") or ""
        display["other"] = "\n".join(x["text"] for x in overview.get("other_conditions", []))
        for name in DISPLAY_FIELDS:
            display[name] = (draft.get("editorial") or {}).get(name, display[name])
        for name in ("region", "age", "gender"):
            display[name + "_status"] = (overview.get(name + "_conditions") or {}).get(
                "status", "specified")
        if not draft:
            for name in DISPLAY_FIELDS:
                display[name] = source["fields"].get(
                    "purpose_summary" if name == "summary" else name, "")
        docs = repository.tables["condition_documents"]
        details = repository.tables["policy_revision_details"]
        history = connection.execute(select(docs.c.revision_id, docs.c.review_status,
            docs.c.created_at, details.c.processing_json).join(
                details, docs.c.revision_id == details.c.revision_id).where(
                docs.c.policy_key == key).order_by(docs.c.created_at.desc(),
                    docs.c.revision_id.desc()).limit(20)).mappings().all()
        return {"policyKey": key, "revisionId": row["revision_id"], "version": edit_version(row),
            "title": source["title"], "organization": source["organization"],
            "source_url": source["source_url"], "fields": {k: v for k, v in source["fields"].items()
                if not k.startswith("_editor_")}, "category": effective_category(row),
            "display": display, "analysis": draft.get("analysis"),
            "canonical": draft.get("canonical"), "published": row["review_status"] == "published",
            "reviewStatus": row["review_status"], "categories": CATEGORIES,
            "history": [{"revisionId": h["revision_id"], "status": h["review_status"],
                "createdAt": h["created_at"], "note": h["processing_json"].get("note", ""),
                "manual": h["processing_json"].get("origin") == "server_admin_edit"}
                for h in history]}


def list_editable_policies(repository, *, q="", status="all", limit=20, offset=0):
    docs = repository.tables["condition_documents"]
    details = repository.tables["policy_revision_details"]
    ranked = select(docs.c.policy_key, docs.c.review_status, details.c.title,
        details.c.organization, details.c.category, docs.c.source_json, details.c.draft_json,
        func.row_number().over(
            partition_by=docs.c.policy_key, order_by=(
                case((docs.c.review_status == "published", 2),
                     (details.c.processing_json["origin"].as_string() == "server_admin_edit", 1),
                     else_=0).desc(),
                docs.c.created_at.desc(), docs.c.revision_id.desc())).label("position")).join(
                    details, details.c.revision_id == docs.c.revision_id).subquery()
    latest = select(ranked.c.policy_key, ranked.c.title, ranked.c.organization,
                    effective_category_expression(ranked).label("category"),
                    cast(ranked.c.review_status, String(20)).label(
                        "review_status")).where(ranked.c.position == 1)
    raw = select(records.c.policy_key,
        records.c.source_json["title"].as_string().label("title"),
        records.c.source_json["organization"].as_string().label("organization"),
        records.c.provider.label("category"),
        case((records.c.source_json.is_not(None), "raw"), else_="listing").label("review_status")
        ).where(~records.c.policy_key.in_(select(docs.c.policy_key)))
    catalog = union(latest, raw).subquery()
    query = select(catalog)
    if q:
        query = query.where(catalog.c.title.contains(q, autoescape=True)
            | catalog.c.policy_key.contains(q, autoescape=True)
            | catalog.c.organization.contains(q, autoescape=True))
    if status != "all":
        query = query.where(catalog.c.review_status == status)
    with repository.engine.connect() as connection:
        total = connection.scalar(select(func.count()).select_from(query.subquery()))
        items = [dict(r) for r in connection.execute(query.order_by(
            catalog.c.title, catalog.c.policy_key).limit(limit).offset(offset)).mappings()]
    return {"items": items, "total": total,
            "nextCursor": str(offset + limit) if offset + limit < total else None}


def build_manual_draft(key, data, previous):
    display = data.display.model_dump()
    fields = {**data.fields, **{"_editor_" + k: v for k, v in display.items() if v},
              "_editor_category": data.category}
    fields.setdefault("eligibility", "")
    source = SourcePolicy(policy_key=key, title=data.title, organization=data.organization,
        source_url=data.source_url, fields=fields, source_hash=digest({
            "title": data.title, "organization": data.organization, "source_url": data.source_url,
            "fields": fields}))
    extraction, logic = None, None
    analysis = data.analysis if data.analysis is not None else previous.get("analysis")
    if analysis is not None:
        try:
            extraction = PolicyExtraction.model_validate(analysis)
            validate_extraction(extraction, source)
            if data.analysis is None and previous.get("canonical"):
                from app.contracts.conditions import LogicNode
                logic = LogicNode.model_validate(previous["canonical"]["logic"])
        except ValueError:
            if data.analysis is not None:
                raise
            extraction = None
    if extraction is None:
        extraction, _, logic, _, code = _code_result(source)
        if extraction is None:
            from app.modules.pipeline.public import _missing_conditions
            extraction = _missing_conditions(source)
        elif code:
            logic = code.logic
    canonical = normalize_conditions(extraction, logic=logic)

    def evidence(name, value):
        return [{"source_field": "_editor_" + name, "quote": value[:500]}] if value else []

    def section(name):
        value = display[name]
        status = display.get(name + "_status", "specified") if value else "not_stated"
        return {"status": status, "text": value if status != "not_stated" else None,
                "evidence": evidence(name, value) if status != "not_stated" else [],
                "unresolved_reason": "관리자 미확정 조건" if status == "unclear" else None}

    overview = {"title": data.title, "source_url": data.source_url,
        "category": None if data.category == "기타" else data.category,
        "category_reason": "관리자 분류 수정",
        "category_evidence": evidence("category", data.category),
        "unresolved": ["관리자 기타 분류"] if data.category == "기타" else [],
        "region_conditions": section("region"), "age_conditions": section("age"),
        "gender_conditions": section("gender"), "benefits": section("benefits"),
        "other_conditions": [{"text": line, "evidence": evidence("other", line)}
                             for line in display["other"].splitlines() if line.strip()],
        "policy_requirements": [{"condition_type": "other", "information_state": "not_stated",
                                 "evidence_text": "지원 대상 및 선정 기준 원문 미기재"}],
        **{name: section(name) for name in DISPLAY_FIELDS[6:]}}
    requirements = []
    for name, kind in (("region", "residence_region"), ("age", "age"), ("gender", "gender")):
        status = section(name)["status"]
        if status != "not_stated":
            requirements.append({"condition_type": kind,
                "information_state": "unknown" if status == "unclear" else status,
                "evidence_text": display[name]})
    for line in display["other"].splitlines():
        if line.strip():
            requirements.append({"condition_type": "other", "information_state": "specified",
                                 "evidence_text": line})
    if requirements:
        overview["policy_requirements"] = requirements
    PolicyOverview.model_validate(overview)
    return validate_draft({"schema_version": "welfare-parsing-v2", "source": source.model_dump(),
        "review_status": "draft", "matching_enabled": False, "status": "needs_review",
        "analysis": extraction.model_dump(), "canonical": canonical.model_dump(),
        "overview": overview, "overview_status": "validated", "editorial": display,
        "method": "manual_admin_edit", "attempts": []})


def save_policy_edit(repository, key, data, actor_id):
    events = events_table(repository)
    with publication_transaction(repository, key) as connection:
        prior = current_record(repository, connection, key)
        if prior is None:
            raise LookupError("공고를 찾을 수 없습니다")
        if edit_version(prior) != data.version:
            raise PublicationConflict("공고가 변경됐습니다. 최신 내용을 불러온 뒤 다시 저장하세요.")
        draft = build_manual_draft(key, data, deepcopy(prior["draft_json"]))
        revision_id, _ = repository._save_revision(connection, draft, {
            "origin": "server_admin_edit", "actor_id": actor_id, "note": data.note,
            "parent_revision_id": prior["revision_id"]})
        repository._save_legacy_policy(connection, draft)
        if data.published:
            change_publication(repository, connection, events, revision_id, policy_key=key,
                action="publish", expected_status="draft", actor_id=actor_id, note=data.note)
        else:
            docs = repository.tables["condition_documents"]
            published = list(connection.scalars(select(docs.c.revision_id).where(
                docs.c.policy_key == key, docs.c.review_status == "published")))
            for old_id in published:
                change_publication(repository, connection, events, old_id, policy_key=key,
                    action="unpublish", expected_status="published", actor_id=actor_id,
                    note=data.note)
    return read_policy_edit(repository, key)
