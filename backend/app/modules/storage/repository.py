"""MySQL ingestion and immutable policy revisions. Model calls never hold a transaction."""

import hashlib
import json
import re
from copy import deepcopy
from uuid import uuid4

from sqlalchemy import MetaData, Table, insert, null, select, update
from sqlalchemy.exc import IntegrityError

from app.contracts.conditions import CanonicalPolicy
from app.contracts.parsing import (
    LegacyPolicyOverview,
    PolicyExtraction,
    PolicyOverview,
    SourcePolicy,
)
from app.modules.normalization.public import normalize_conditions
from app.modules.validation.public import validate_canonical, validate_extraction, validate_overview

TABLES = (
    "condition_documents", "condition_entries", "policy_revision_details",
    "policy_ingestion_runs", "policy_ingestion_items",
)
STORAGE_VERSION = "policy-storage-v1"


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def validate_draft(payload: dict) -> dict:
    """Validate persisted/imported results again, explicitly upgrade v1 without an LLM call."""
    draft = deepcopy(payload)
    if draft.get("schema_version") not in {"welfare-parsing-v1", "welfare-parsing-v2"}:
        raise ValueError("Unsupported draft schema")
    if draft.get("review_status") != "draft" or draft.get("matching_enabled") is not False:
        raise ValueError("Ingestion accepts unpublished drafts only")
    source = SourcePolicy.model_validate(draft["source"])
    if (not source.policy_key or len(source.policy_key) > 255
            or not re.fullmatch(r"[a-f0-9]{64}", source.source_hash)):
        raise ValueError("Invalid source identity/hash")
    status = draft.get("status")
    if status not in {"needs_review", "failed", "pending"}:
        raise ValueError("Invalid draft status")
    if status == "needs_review":
        analysis = PolicyExtraction.model_validate(draft["analysis"])
        validate_extraction(analysis, source)
        if draft["schema_version"] == "welfare-parsing-v1":
            draft["canonical"] = normalize_conditions(analysis).model_dump()
            draft["imported_schema_version"] = draft["schema_version"]
            draft["schema_version"] = "welfare-parsing-v2"
        canonical = CanonicalPolicy.model_validate(draft["canonical"])
        validate_canonical(canonical, source)
        if {c.condition_id for c in analysis.conditions} != {
                c.condition_id for c in canonical.conditions}:
            raise ValueError("Extraction/canonical condition identities differ")
    if draft.get("overview") is not None:
        overview_model = (PolicyOverview if "policy_requirements" in draft["overview"]
                          else LegacyPolicyOverview)
        validate_overview(overview_model.model_validate(draft["overview"]), source)
        if draft.get("overview_status") != "validated":
            raise ValueError("Overview status mismatch")
    elif draft.get("overview_status") == "validated":
        raise ValueError("Validated overview is missing")
    if draft.get("code_analysis"):
        validate_extraction(PolicyExtraction.model_validate(draft["code_analysis"]), source)
    if draft.get("code_canonical"):
        validate_canonical(CanonicalPolicy.model_validate(draft["code_canonical"]), source)
    return draft


class PolicyRepository:
    def __init__(self, engine):
        if engine.dialect.name != "mysql":
            raise ValueError("Policy storage requires MySQL")
        self.engine = engine
        metadata = MetaData()
        self.tables = {name: Table(name, metadata, autoload_with=engine) for name in TABLES}

    def start_run(self, sources: list[SourcePolicy], processing: dict) -> str:
        if not sources or len({s.policy_key for s in sources}) != len(sources):
            raise ValueError("A run requires unique source identities")
        run_id = str(uuid4())
        with self.engine.begin() as connection:
            connection.execute(insert(self.tables["policy_ingestion_runs"]).values(
                run_id=run_id, status="running", source_count=len(sources),
                processing_json={"storage_version": STORAGE_VERSION, **processing}))
            connection.execute(insert(self.tables["policy_ingestion_items"]), [dict(
                item_id=str(uuid4()), run_id=run_id, policy_key=s.policy_key,
                status="pending", source_json=s.model_dump(),
            ) for s in sources])
        return run_id

    def save_result(self, run_id: str, payload: dict) -> dict:
        draft = validate_draft(payload)
        source = draft["source"]
        items = self.tables["policy_ingestion_items"]
        runs = self.tables["policy_ingestion_runs"]
        with self.engine.begin() as connection:
            item = connection.execute(select(items).where(
                items.c.run_id == run_id, items.c.policy_key == source["policy_key"]
            ).with_for_update()).mappings().one()
            if item["source_json"] != source:
                raise ValueError("Result source differs from the queued source")
            processing = connection.execute(select(runs.c.processing_json).where(
                runs.c.run_id == run_id)).scalar_one()
            revision_id = None
            reused = False
            if draft["status"] == "needs_review":
                revision_id, reused = self._save_revision(connection, draft, processing)
            connection.execute(update(items).where(items.c.item_id == item["item_id"]).values(
                status=draft["status"], result_json=draft, revision_id=revision_id,
                error_code=None if draft["status"] != "failed" else "extraction_failed"))
        # The context manager committed successfully before a saved result is returned.
        return {"policy_key": source["policy_key"], "status": draft["status"],
                "revision_id": revision_id, "reused": reused, "saved": True}

    def _save_revision(self, connection, draft, processing):
        details = self.tables["policy_revision_details"]
        documents = self.tables["condition_documents"]
        entries = self.tables["condition_entries"]
        stable = {key: draft.get(key) for key in (
            "schema_version", "source", "analysis", "canonical", "overview",
            "overview_status", "method", "rule_version", "imported_schema_version",
        )}
        fingerprint = digest({"draft": stable, "processing": processing})
        existing = connection.execute(select(details.c.revision_id).where(
            details.c.fingerprint == fingerprint)).scalar_one_or_none()
        if existing:
            return existing, True
        revision_id = str(uuid4())
        canonical = draft["canonical"]
        try:
            # SAVEPOINT avoids orphan documents when concurrent identical results race.
            with connection.begin_nested():
                connection.execute(insert(documents).values(
                    revision_id=revision_id, policy_key=draft["source"]["policy_key"],
                    source_hash=draft["source"]["source_hash"],
                    schema_version=canonical["schema_version"],
                    region_snapshot_version=canonical["region_snapshot_version"],
                    source_json=draft["source"], extraction_json=draft["analysis"],
                    canonical_json=canonical, review_status="draft", matching_enabled=False))
                connection.execute(insert(details).values(
                    revision_id=revision_id, fingerprint=fingerprint,
                    title=draft["source"]["title"], organization=draft["source"]["organization"],
                    category=(draft.get("overview") or {}).get("category"),
                    draft_json=draft, processing_json=processing))
                for condition in canonical["conditions"]:
                    row = {**condition, "revision_id": revision_id}
                    value = row.pop("value")
                    # JSON null must be SQL NULL for the existing CHECK constraint.
                    connection.execute(insert(entries).values(
                        **row, value_json=value if value is not None else null()))
        except IntegrityError:
            existing = connection.execute(select(details.c.revision_id).where(
                details.c.fingerprint == fingerprint).with_for_update()).scalar_one_or_none()
            if existing is None:
                raise
            return existing, True
        return revision_id, False

    def mark_failed(self, run_id: str, policy_key: str, error_code: str,
                    draft: dict | None = None) -> None:
        items = self.tables["policy_ingestion_items"]
        with self.engine.begin() as connection:
            connection.execute(update(items).where(
                items.c.run_id == run_id, items.c.policy_key == policy_key,
                items.c.status.in_(("pending", "failed")),
            ).values(status="failed", error_code=error_code,
                     result_json=draft if draft is not None else null()))

    def pending_items(self, run_id: str) -> list[dict]:
        items = self.tables["policy_ingestion_items"]
        with self.engine.connect() as connection:
            return [dict(r) for r in connection.execute(select(items).where(
                items.c.run_id == run_id, items.c.status.in_(("pending", "failed"))
            ).order_by(items.c.policy_key)).mappings()]

    def run_processing(self, run_id: str) -> dict:
        runs = self.tables["policy_ingestion_runs"]
        with self.engine.connect() as connection:
            result = connection.scalar(
                select(runs.c.processing_json).where(runs.c.run_id == run_id))
            if result is None:
                raise ValueError("Run not found")
            return result

    def finish_run(self, run_id: str, *, prepare_only=False) -> dict:
        runs, items = self.tables["policy_ingestion_runs"], self.tables["policy_ingestion_items"]
        with self.engine.begin() as connection:
            records = connection.execute(select(items.c.policy_key, items.c.status,
                items.c.revision_id, items.c.error_code).where(items.c.run_id == run_id)
                .order_by(items.c.policy_key)).mappings().all()
            if not records:
                raise ValueError("Run not found")
            status = ("failed" if any(r["status"] == "failed" for r in records)
                      else "prepared" if prepare_only else "running"
                      if any(r["status"] == "pending" for r in records) else "needs_review")
            connection.execute(update(runs).where(runs.c.run_id == run_id).values(status=status))
        return {"run_id": run_id, "storage": "mysql", "status": status,
                "records": [dict(r) for r in records]}

    def get_revision(self, revision_id: str, *, published_only: bool = True) -> dict | None:
        documents = self.tables["condition_documents"]
        details = self.tables["policy_revision_details"]
        query = select(documents, details.c.draft_json, details.c.processing_json).join(
            details, details.c.revision_id == documents.c.revision_id
        ).where(documents.c.revision_id == revision_id)
        if published_only:
            query = query.where(documents.c.review_status == "published")
        with self.engine.connect() as connection:
            record = connection.execute(query).mappings().first()
            return dict(record) if record else None

    def list_revisions(self, *, published_only: bool = True, limit: int = 20,
                       offset: int = 0, policy_key: str | None = None) -> list[dict]:
        if not 1 <= limit <= 100 or offset < 0:
            raise ValueError("Invalid pagination")
        documents = self.tables["condition_documents"]
        details = self.tables["policy_revision_details"]
        query = select(documents.c.revision_id, documents.c.policy_key,
            documents.c.review_status, documents.c.matching_enabled, documents.c.created_at,
            details.c.title, details.c.category).join(
                details, details.c.revision_id == documents.c.revision_id)
        if published_only:
            query = query.where(documents.c.review_status == "published")
        if policy_key is not None:
            query = query.where(documents.c.policy_key == policy_key)
        query = query.order_by(documents.c.created_at.desc(), documents.c.revision_id)
        with self.engine.connect() as connection:
            rows = connection.execute(query.limit(limit).offset(offset)).mappings()
            return [dict(r) for r in rows]

    def import_draft(self, payload: dict) -> dict:
        draft = validate_draft(payload)
        source = SourcePolicy.model_validate(draft["source"])
        run_id = self.start_run([source], {"origin": "draft_import"})
        try:
            self.save_result(run_id, draft)
        except Exception:
            self.mark_failed(run_id, source.policy_key, "import_failed", draft)
            raise
        return self.finish_run(run_id, prepare_only=draft["status"] == "pending")
