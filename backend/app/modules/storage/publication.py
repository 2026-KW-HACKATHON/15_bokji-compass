"""Explicit publication, separate from qualification matching and immutable ingestion."""

import hashlib
from contextlib import contextmanager
from uuid import uuid4

from sqlalchemy import MetaData, Table, bindparam, func, insert, select, text, update

from app.modules.storage.application_dates import resolved_application_period
from app.modules.storage.catalog import card
from app.modules.storage.repository import validate_draft


class PublicationConflict(ValueError):
    pass


def events_table(repository):
    return Table("policy_publication_events", MetaData(), autoload_with=repository.engine)


def revision_query(repository):
    documents = repository.tables["condition_documents"]
    details = repository.tables["policy_revision_details"]
    return select(documents, details.c.title, details.c.category, details.c.draft_json).join(
        details, details.c.revision_id == documents.c.revision_id)


def review_summary(record):
    draft = record["draft_json"]
    warnings = []
    for part in ("analysis", "canonical", "overview"):
        warnings.extend((draft.get(part) or {}).get("unresolved") or [])
    source = record["source_json"]
    if not source.get("source_url"):
        warnings.append("공식 원문 링크가 저장되지 않았습니다.")
    fields = source.get("fields") or {}
    if not resolved_application_period(fields, draft.get("overview")):
        warnings.append("신청 기간을 공식 공고에서 확인해야 합니다.")
    if not draft.get("overview"):
        warnings.append("화면용 요약이 없어 원문과 기본 안내로 표시됩니다.")
    try:
        validate_draft(draft)
        valid = (draft.get("status") == "needs_review"
                 and draft.get("source") == record["source_json"]
                 and draft.get("canonical") == record["canonical_json"])
    except (ValueError, KeyError, TypeError):
        valid = False
    if not valid:
        warnings.append("저장 결과 검증에 실패하여 공개할 수 없습니다.")
    return {
        "revisionId": record["revision_id"], "policyKey": record["policy_key"],
        "title": record["title"], "category": record["category"] or "기타",
        "reviewStatus": record["review_status"], "createdAt": record["created_at"].isoformat(),
        "matchingEnabled": bool(record["matching_enabled"]),
        "canPublish": valid and record["review_status"] in {"draft", "reviewed", "published"},
        "warnings": list(dict.fromkeys(warnings)),
    }


def list_publication_revisions(repository, *, limit=20, offset=0):
    documents = repository.tables["condition_documents"]
    query = revision_query(repository)
    with repository.engine.connect() as connection:
        total = connection.scalar(select(func.count()).select_from(query.subquery()))
        rows = connection.execute(query.order_by(
            documents.c.created_at.desc(), documents.c.revision_id.desc()
        ).limit(limit).offset(offset)).mappings()
        items = [review_summary(record) for record in rows]
    return {"items": items, "total": total,
            "nextCursor": str(offset + limit) if offset + limit < total else None}


def review_publication_revision(repository, revision_id):
    documents = repository.tables["condition_documents"]
    events = events_table(repository)
    with repository.engine.connect() as connection:
        record = connection.execute(revision_query(repository).where(
            documents.c.revision_id == revision_id)).mappings().first()
        if record is None:
            return None
        history = connection.execute(select(
            events.c.previous_status, events.c.review_status, events.c.note, events.c.created_at
        ).where(events.c.revision_id == revision_id).order_by(
            events.c.created_at.desc(), events.c.event_id).limit(20)).mappings().all()
        return {**review_summary(record), "preview": card(record),
                "sourceFields": record["source_json"]["fields"],
                "history": [dict(row) for row in history]}


@contextmanager
def publication_transaction(repository, policy_key):
    # Serialize insertion + automatic publication and manual changes for the same policy.
    name = "bokji-publish:" + hashlib.sha256(policy_key.encode()).hexdigest()[:48]
    with repository.engine.connect() as connection:
        acquired = connection.scalar(text("SELECT GET_LOCK(:name, 2)"), {"name": name})
        connection.commit()
        if acquired != 1:
            raise PublicationConflict("공고 공개 처리가 진행 중입니다. 잠시 후 다시 시도해 주세요.")
        try:
            with connection.begin():
                yield connection
        finally:
            connection.rollback()
            connection.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": name})
            connection.commit()


def prune_superseded_revisions(repository, connection, siblings, target):
    """Overwrite semantics: publishing a revision replaces every older revision of the policy."""
    age = (target["created_at"], target["revision_id"])
    stale = [row["revision_id"] for row in siblings
             if (row["created_at"], row["revision_id"]) < age]
    if not stale:
        return
    arguments = {"keep": target["revision_id"], "stale": tuple(stale)}
    # Work-queue references move to the surviving revision; the publication events cascade.
    for table in ("policy_ingestion_items", "collection_records", "collection_jobs"):
        connection.execute(text(
            f"UPDATE `{table}` SET revision_id = :keep WHERE revision_id IN :stale"
        ).bindparams(bindparam("stale", expanding=True)), arguments)
    for table in ("condition_entries", "policy_revision_details", "condition_documents"):
        connection.execute(text(
            f"DELETE FROM `{table}` WHERE revision_id IN :stale"
        ).bindparams(bindparam("stale", expanding=True)), arguments)


def change_publication(repository, connection, events, revision_id, *, policy_key, action,
                       expected_status, actor_id, note, require_latest=False):
    if action not in {"publish", "unpublish"} or not note.strip() or len(note) > 1000:
        raise ValueError("Invalid publication request")
    documents = repository.tables["condition_documents"]
    siblings = connection.execute(select(documents).where(
        documents.c.policy_key == policy_key).order_by(
        documents.c.revision_id).with_for_update()).mappings().all()
    target = next((row for row in siblings if row["revision_id"] == revision_id), None)
    if target is None:
        raise LookupError("Revision not found")
    if require_latest and max(siblings, key=lambda row: (
            row["created_at"], row["revision_id"]))["revision_id"] != revision_id:
        raise PublicationConflict("새 개정이 저장되어 이전 초안의 자동 공개를 건너뜁니다.")
    if target["review_status"] != expected_status:
        raise PublicationConflict("공개 상태가 변경되었습니다. 다시 불러와 주세요.")
    if action == "publish":
        record = connection.execute(revision_query(repository).where(
            documents.c.revision_id == revision_id)).mappings().one()
        if not review_summary(record)["canPublish"]:
            raise ValueError("검증된 검토용 공고만 공개할 수 있습니다.")
        changes = [(row, "reviewed") for row in siblings
                   if row["review_status"] == "published" and row["revision_id"] != revision_id]
        if target["review_status"] != "published" or target["matching_enabled"]:
            changes.append((target, "published"))
        final = "published"
    else:
        if target["review_status"] != "published":
            raise PublicationConflict("공개 중인 공고만 비공개로 전환할 수 있습니다.")
        changes = [(target, "reviewed")]
        final = "reviewed"
    for row, status in changes:
        connection.execute(update(documents).where(
            documents.c.revision_id == row["revision_id"]
        ).values(review_status=status, matching_enabled=False))
        connection.execute(insert(events).values(
            event_id=str(uuid4()), revision_id=row["revision_id"], actor_id=actor_id,
            previous_status=row["review_status"], review_status=status, note=note.strip()))
    if action == "publish":
        prune_superseded_revisions(repository, connection, siblings, target)
    return {"revisionId": revision_id, "reviewStatus": final, "matchingEnabled": False}


def set_publication_status(repository, revision_id, *, action, expected_status, actor_id, note,
                           require_latest=False):
    documents = repository.tables["condition_documents"]
    events = events_table(repository)
    with repository.engine.connect() as connection:
        policy_key = connection.scalar(select(documents.c.policy_key).where(
            documents.c.revision_id == revision_id))
    if policy_key is None:
        raise LookupError("Revision not found")
    with publication_transaction(repository, policy_key) as connection:
        return change_publication(repository, connection, events, revision_id,
                                  policy_key=policy_key, action=action,
                                  expected_status=expected_status,
                                  actor_id=actor_id, note=note, require_latest=require_latest)


def auto_publish_pending(repository):
    """Explicit catch-up: only latest untouched drafts, never a manually hidden revision."""
    if not repository.auto_publish:
        return {"published": 0, "skipped": 0, "enabled": False}
    documents = repository.tables["condition_documents"]
    ranked = select(documents.c.revision_id, documents.c.review_status,
                    func.row_number().over(partition_by=documents.c.policy_key, order_by=(
                        documents.c.created_at.desc(), documents.c.revision_id.desc()
                    )).label("position")).subquery()
    with repository.engine.connect() as connection:
        revisions = list(connection.scalars(select(ranked.c.revision_id).where(
            ranked.c.position == 1, ranked.c.review_status == "draft")))
    published = skipped = 0
    for revision_id in revisions:
        review = review_publication_revision(repository, revision_id)
        if review is None or not review["canPublish"]:
            skipped += 1
            continue
        try:
            set_publication_status(repository, revision_id, action="publish",
                                   expected_status="draft", actor_id="system:auto-publish",
                                   note="기존 초안 검증 후 자동 승인 적용",
                                   require_latest=True)
        except (ValueError, LookupError):
            skipped += 1
        else:
            published += 1
    return {"published": published, "skipped": skipped, "enabled": True}
