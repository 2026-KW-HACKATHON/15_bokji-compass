"""Explicit, repeatable installation of official university and local reference data."""

import json
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import select, text

from app.contracts.parsing import PolicyExtraction, SourcePolicy
from app.core.config import BACKEND_ROOT
from app.modules.local_services.public import load_catalog
from app.modules.normalization.public import normalize_conditions
from app.modules.normalization.raw import load_raw_policies
from app.modules.storage.application_dates import application_reference_date
from app.modules.storage.catalog import list_policies
from app.modules.storage.repository import digest, validate_draft

FOCUS_QUERIES = (
    "광운대에서 올린 장학금을 찾아줘",
    "광운대학교 화도 장학금",
    "광운대학교 동해 장학금",
    "월계동 지원",
    "월계1동 복지 상담",
    "노원구 돌봄",
)
SOURCE_ONLY_NOTE = "원문 검색용 안내입니다. 신청 자격 조건은 별도 검토가 필요합니다."
CATEGORIES = {"transport": "생활·금융", "health": "건강·돌봄",
              "care": "건강·돌봄", "culture": "문화"}


def _section(source, field, *, text_value=None):
    value = source.fields.get(field)
    if not value:
        return {"status": "not_stated", "text": None, "evidence": [],
                "unresolved_reason": None}
    return {"status": "specified", "text": text_value or value,
            "evidence": [{"source_field": field, "quote": (text_value or value)[:500]}],
            "unresolved_reason": None}


def source_only_draft(source, *, category, category_field="title", region_field=None,
                      region_text=None):
    """Keep actual source content and explicitly unknown qualification logic."""
    analysis = PolicyExtraction.model_validate({
        "policy_key": source.policy_key, "coverage": "partial", "groups": [],
        "unresolved": [SOURCE_ONLY_NOTE], "conditions": [{
            "condition_id": "source-review", "field_key": "unmapped", "subject": "unknown",
            "state_code": 9, "operator": None, "value": None, "unit": None,
            "reference_basis": None, "role": "reference", "group_id": None,
            "source_field": "text", "evidence_quote": source.fields["text"][:250],
            "unknown_reason": "SOURCE_INCOMPLETE", "review_note": SOURCE_ONLY_NOTE,
        }],
    })
    evidence = source.title if category_field == "title" else source.fields[category_field]
    overview = {
        "title": source.title, "source_url": source.source_url, "category": category,
        "category_reason": "공식 공고 분류 또는 검증된 지역 서비스 분류",
        "category_evidence": [{"source_field": category_field, "quote": evidence[:500]}],
        "region_conditions": _section(source, region_field or "_unknown_region",
                                      text_value=region_text),
        "gender_conditions": _section(source, "_unknown_gender"),
        "age_conditions": _section(source, "_unknown_age"),
        "other_conditions": [], "benefits": _section(source, "benefits"),
        "unresolved": [SOURCE_ONLY_NOTE],
    }
    return validate_draft({
        "schema_version": "welfare-parsing-v2", "status": "needs_review",
        "review_status": "draft", "matching_enabled": False, "method": "official-reference",
        "source": source.model_dump(), "analysis": analysis.model_dump(),
        "canonical": normalize_conditions(analysis).model_dump(),
        "overview": overview, "overview_status": "validated",
    })


def _service_draft(service):
    areas = [" ".join(filter(None, (area.region, area.district, *area.neighborhoods)))
             for area in service.coverage]
    service_area = " / ".join(areas)
    fields = {
        "purpose_summary": service.summary, "benefits": service.summary + "\n" + service.cost,
        "eligibility": service.audience,
        "application_method": service.usage, "reference_checked_at": service.checkedAt,
        "provider_category": CATEGORIES[service.category],
        "text": "\n".join((service.title, service.summary, service.area,
                            "서비스 제공 지역: " + service_area,
                            service.audience, service.cost, service.usage)),
    }
    if service.availableUntil:
        fields["application_period"] = "이용 기한: " + service.availableUntil
    if service.sourcePublishedAt:
        fields["published_date"] = service.sourcePublishedAt
    source = SourcePolicy(
        policy_key="local:" + service.id, title=service.title,
        organization=service.sourceName.split(" · ")[0], source_url=service.sourceUrl,
        fields=fields, source_hash=digest(service.model_dump()),
    )
    return source_only_draft(source, category=CATEGORIES[service.category],
                             category_field="provider_category", region_field="text",
                             region_text=service_area)


def focus_drafts(*, as_of=None):
    """Validate the complete bounded reference bundle before any database writes."""
    root = BACKEND_ROOT / "database/seeds"
    analyzed = [validate_draft(json.loads(path.read_text(encoding="utf-8-sig")))
                for path in sorted((root / "kwangwoon_published_policies").glob("*.json"))]
    by_key = {draft["source"]["policy_key"]: draft for draft in analyzed}
    drafts = [by_key.get(source.policy_key) or source_only_draft(source, category="교육")
              for source in load_raw_policies(root / "kwangwoon_notices.json")]
    today = as_of or application_reference_date()
    drafts.extend(_service_draft(service) for service in load_catalog()
                  if service.availableUntil is None or service.availableUntil >= today.isoformat())
    if len({draft["source"]["policy_key"] for draft in drafts}) != len(drafts):
        raise ValueError("Duplicate focus reference identity")
    return drafts


def _source_identity(source):
    url = urlsplit(source.get("source_url") or "")
    duid = parse_qs(url.query).get("DUID")
    if (url.hostname in {"www.kw.ac.kr", "m.kw.ac.kr"}
            and url.path == "/ko/life/notice.jsp" and duid):
        return "kwangwoon:" + duid[0]
    return source["policy_key"]


def focus_coverage(repository):
    """Check the actual public search path, including mandatory scholarship names."""
    checks = [{"query": query, "count": list_policies(repository, q=query, limit=1)["total"]}
              for query in FOCUS_QUERIES]
    return {"ready": all(check["count"] > 0 for check in checks), "checks": checks}


def ensure_focus_data(repository):
    """Add absent references only; preserve all existing revisions and manual hiding."""
    if not repository.auto_publish:
        raise ValueError("Focus installation requires an explicitly publishing repository")
    drafts = focus_drafts()
    documents = repository.tables["condition_documents"]
    added = skipped = 0
    # Separate from request/startup paths; concurrent installations share one lock.
    with repository.engine.connect() as guard:
        lock = "bokji-focus-data-v1"
        if guard.scalar(text("SELECT GET_LOCK(:name, 10)"), {"name": lock}) != 1:
            raise RuntimeError("Focus data installation is busy")
        guard.commit()
        try:
            with repository.engine.connect() as connection:
                existing = list(connection.scalars(select(documents.c.source_json)))
            identities = {_source_identity(source) for source in existing}
            keys = {source["policy_key"] for source in existing}
            for draft in drafts:
                source = draft["source"]
                identity = _source_identity(source)
                if source["policy_key"] in keys or identity in identities:
                    skipped += 1
                    continue
                repository.import_draft(draft)
                identities.add(identity)
                keys.add(source["policy_key"])
                added += 1
        finally:
            guard.rollback()
            guard.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": lock})
            guard.commit()
    return {"added": added, "skipped": skipped, "coverage": focus_coverage(repository)}
