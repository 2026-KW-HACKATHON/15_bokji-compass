"""Opt-in real MySQL tests. Only this project's isolated test DB is writable."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import delete, event, func, select, text

from app.core.config import BACKEND_ROOT, Settings
from app.core.database import create_database_engine
from app.modules.normalization.raw import normalize_record
from app.modules.pipeline import public as pipeline
from app.modules.storage.public import PolicyRepository, initialize_policy_schema, validate_draft


def source():
    return normalize_record(
        {
            "document_id": "db-test-" + uuid4().hex,
            "title": "DB 검증용",
            "text": "신청자 만 19세 이상",
        }
    )


def draft(record):
    from app.modules.normalization.public import normalize_conditions
    from app.modules.parsers.public import extract_conditions

    code = extract_conditions(record)
    canonical = normalize_conditions(code.extraction, logic=code.logic)
    return {
        "schema_version": "welfare-parsing-v2",
        "source": record.model_dump(),
        "review_status": "draft",
        "matching_enabled": False,
        "status": "needs_review",
        "analysis": code.extraction.model_dump(),
        "canonical": canonical.model_dump(),
        "overview": None,
        "overview_status": "not_run",
        "attempts": [],
    }


def test_unpublished_import_contract_and_explicit_legacy_upgrade():
    value = draft(source())
    bad = deepcopy(value)
    bad["matching_enabled"] = True
    with pytest.raises(ValueError):
        validate_draft(bad)
    bad = deepcopy(value)
    bad["canonical"]["conditions"][0]["evidence_quote"] = "invented"
    with pytest.raises(ValueError):
        validate_draft(bad)
    legacy = deepcopy(value)
    legacy["schema_version"] = "welfare-parsing-v1"
    legacy.pop("canonical")
    upgraded = validate_draft(legacy)
    assert upgraded["schema_version"] == "welfare-parsing-v2"
    assert upgraded["canonical"]["logic"]["op"] == "unknown"
    assert "canonical" not in legacy


def test_auto_publication_default_new_revision_audit_and_manual_withdrawal(repository):
    from app.modules.storage import catalog
    from app.modules.storage.publication import (
        auto_publish_pending,
        events_table,
        set_publication_status,
    )

    assert PolicyRepository(repository.engine).auto_publish is True
    assert auto_publish_pending(repository)["enabled"] is False
    repository.auto_publish = True
    original = draft(source())
    first = repository.import_draft(original)["records"][0]["revision_id"]
    key = original["source"]["policy_key"]
    assert catalog.get_policy(repository, key)["revisionId"] == first
    assert repository.get_revision(first)["draft_json"] == original
    assert not repository.get_revision(first)["matching_enabled"]
    newer = {**original, "method": "auto-second-revision"}
    second = repository.import_draft(newer)["records"][0]["revision_id"]
    assert catalog.get_policy(repository, key)["revisionId"] == second
    assert repository.get_revision(first, published_only=False)["review_status"] == "reviewed"
    events = events_table(repository)
    with repository.engine.connect() as connection:
        history = connection.execute(select(events).where(
            events.c.revision_id.in_([first, second]))).mappings().all()
        assert len(history) == 3
        assert all(row["actor_id"] == "system:auto-publish" for row in history)
    set_publication_status(repository, second, action="unpublish", expected_status="published",
                           actor_id="test-admin", note="관리자 비공개")
    again = repository.import_draft(newer)
    assert again["records"][0]["revision_id"] == second
    assert catalog.get_policy(repository, key) is None
    auto_publish_pending(repository)
    assert catalog.get_policy(repository, key) is None


def test_auto_publication_failure_rolls_back_save_and_can_resume(repository):
    repository.auto_publish = True
    record = source()
    value = draft(record)
    run = repository.start_run([record], {})

    def fail_audit(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO policy_publication_events"):
            raise RuntimeError("simulated audit failure")

    event.listen(repository.engine, "before_cursor_execute", fail_audit)
    try:
        with pytest.raises(RuntimeError):
            repository.save_result(run, value)
    finally:
        event.remove(repository.engine, "before_cursor_execute", fail_audit)
    assert repository.list_revisions(published_only=False, policy_key=record.policy_key) == []
    assert repository.pending_items(run)[0]["status"] == "pending"
    result = repository.save_result(run, value)
    assert repository.get_revision(result["revision_id"])["review_status"] == "published"


def test_concurrent_automatic_saves_publish_one_revision_and_pending_catchup(repository):
    from app.modules.storage.publication import auto_publish_pending

    record = source()
    value = draft(record)
    pending = repository.import_draft(value)["records"][0]["revision_id"]
    repository.auto_publish = True
    assert auto_publish_pending(repository)["published"] >= 1
    assert repository.get_revision(pending) is not None
    runs = [repository.start_run([record], {}) for _ in range(2)]

    def save(index):
        return repository.save_result(runs[index], {**value, "method": f"auto-parallel-{index}"})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, range(2)))
    states = [repository.get_revision(result["revision_id"], published_only=False)["review_status"]
              for result in results]
    assert sorted(states) == ["published", "reviewed"]


def test_publication_publish_switch_unpublish_and_atomic_audit(repository):
    from app.modules.storage import catalog
    from app.modules.storage.publication import (
        PublicationConflict,
        events_table,
        review_publication_revision,
        set_publication_status,
    )

    original = draft(source())
    first = repository.import_draft(original)["records"][0]["revision_id"]
    # Same validated source, a different processing method creates a second revision.
    newer = {**original, "method": "second-test-revision"}
    second = repository.import_draft(newer)["records"][0]["revision_id"]
    assert first != second
    key = original["source"]["policy_key"]
    assert catalog.get_policy(repository, key) is None
    assert review_publication_revision(repository, first)["canPublish"]
    arguments = {"actor_id": "test-admin", "note": "테스트 원문 검토"}
    set_publication_status(repository, first, action="publish",
                           expected_status="draft", **arguments)
    assert catalog.get_policy(repository, key)["revisionId"] == first
    set_publication_status(repository, second, action="publish",
                           expected_status="draft", **arguments)
    assert catalog.get_policy(repository, key)["revisionId"] == second
    assert repository.get_revision(first, published_only=False)["review_status"] == "reviewed"
    with pytest.raises(PublicationConflict):
        set_publication_status(repository, second, action="unpublish",
                               expected_status="draft", **arguments)
    assert catalog.get_policy(repository, key)["revisionId"] == second
    # A duplicate request does not create a duplicate audit event.
    set_publication_status(repository, second, action="publish",
                           expected_status="published", **arguments)
    review = review_publication_revision(repository, second)
    assert len(review["history"]) == 1
    set_publication_status(repository, second, action="unpublish",
                           expected_status="published", **arguments)
    assert catalog.get_policy(repository, key) is None
    assert repository.get_revision(second) is None
    assert repository.get_revision(first, published_only=False)["draft_json"] == original
    assert not repository.get_revision(second, published_only=False)["matching_enabled"]
    events = events_table(repository)
    with repository.engine.connect() as connection:
        history = connection.execute(select(events).where(
            events.c.revision_id.in_([first, second]))).mappings().all()
        assert len(history) == 4
        assert all(row["actor_id"] == "test-admin" for row in history)


def test_publication_audit_failure_rolls_back_and_invalid_draft_is_blocked(repository):
    from sqlalchemy import update

    from app.modules.storage.publication import set_publication_status

    original = draft(source())
    revision = repository.import_draft(original)["records"][0]["revision_id"]
    arguments = {"actor_id": "test-admin", "note": "검토", "action": "publish",
                 "expected_status": "draft"}

    def fail_audit(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO policy_publication_events"):
            raise RuntimeError("simulated audit write failure")

    event.listen(repository.engine, "before_cursor_execute", fail_audit)
    try:
        with pytest.raises(RuntimeError):
            set_publication_status(repository, revision, **arguments)
    finally:
        event.remove(repository.engine, "before_cursor_execute", fail_audit)
    assert repository.get_revision(revision) is None
    corrupt = {**original, "analysis": None}
    table = repository.tables["policy_revision_details"]
    with repository.engine.begin() as connection:
        connection.execute(update(table).where(table.c.revision_id == revision).values(
            draft_json=corrupt))
    with pytest.raises(ValueError):
        set_publication_status(repository, revision, **arguments)
    assert repository.get_revision(revision) is None


def test_concurrent_publication_keeps_one_visible_revision(repository):
    from app.modules.storage.publication import set_publication_status

    original = draft(source())
    revisions = [repository.import_draft({**original, "method": str(index)})[
        "records"][0]["revision_id"] for index in range(2)]

    def publish(revision):
        return set_publication_status(repository, revision, action="publish",
                                      expected_status="draft", actor_id="test-admin",
                                      note="동시 검토")

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(publish, revisions))
    assert len(results) == 2
    states = [repository.get_revision(revision, published_only=False)["review_status"]
              for revision in revisions]
    assert sorted(states) == ["published", "reviewed"]


def test_pipeline_requires_database_by_default(tmp_path):
    path = tmp_path / "raw.json"
    path.write_text(json.dumps({"document_id": "test", "title": "test", "text": ""}))
    with pytest.raises(ValueError, match="DB_ENABLED"):
        pipeline.parse_raw_files([path], settings=Settings(_env_file=None, db_enabled=False))
    assert not (tmp_path / "out").exists()


def test_legacy_overview_stays_importable_without_weakening_new_model_contract():
    from pydantic import ValidationError

    from app.contracts.parsing import PeriodPolicyOverview, PolicyOverview

    record = source()
    value = draft(record)
    absent = {"status": "not_stated", "text": None, "evidence": [], "unresolved_reason": None}
    legacy = {
        "title": record.title,
        "source_url": record.source_url,
        "category": "교육",
        "category_reason": "기존 분류",
        "category_evidence": [{"source_field": "text", "quote": "만 19세 이상"}],
        "region_conditions": absent,
        "gender_conditions": absent,
        "age_conditions": absent,
        "other_conditions": [],
        "benefits": absent,
        "unresolved": [],
    }
    value.update(overview=legacy, overview_status="validated")
    assert validate_draft(value)["overview"] == legacy
    assert "policy_requirements" not in legacy
    with pytest.raises(ValidationError):
        PolicyOverview.model_validate(legacy)
    value["overview"] = {
        **legacy,
        "policy_requirements": [
            {
                "condition_type": "age",
                "information_state": "specified",
                "evidence_text": "만 19세 이상",
            }
        ],
    }
    validate_draft(value)
    value["overview"] = {
        **value["overview"],
        "application_period": {
            "status": "not_stated", "text": None, "evidence": [],
            "unresolved_reason": None,
        },
    }
    assert PeriodPolicyOverview.model_validate(value["overview"])
    validate_draft(value)
    with pytest.raises(ValidationError):
        PolicyOverview.model_validate(value["overview"])
    value["overview"]["policy_requirements"][0]["evidence_text"] = "없는 원문"
    with pytest.raises(ValueError, match="evidence"):
        validate_draft(value)


def test_server_collection_mysql_identity_history_and_quota_lock(engine):
    """Opt-in 007 migration/JSON/locking check; never calls an API or a model."""
    import time

    from app.modules.ingestion import models as collection
    from app.modules.ingestion.repository import IngestionRepository

    store = IngestionRepository(engine)
    store.check_schema()
    original = source()
    changed = original.model_copy(update={"fields": {"text": "신청자 만 20세 이상"}})
    provider = "test-" + uuid4().hex
    observed = time.time()
    try:
        store.observe_source(original, {"revision": "a"}, {"hash": "test"}, observed, 86400)
        repeated = store.observe_source(original, {}, {"hash": "test"}, observed + 1, 86400)
        assert repeated["unchanged"] and not repeated["queued"]
        store.observe_source(changed, {"revision": "b"}, {"hash": "test"}, observed + 2, 86400)
        store.observe_source(original, {}, {"hash": "test"}, observed + 3, 86400)
        with engine.connect() as connection:
            assert connection.scalar(select(func.count()).select_from(collection.snapshots).where(
                collection.snapshots.c.policy_key == original.policy_key)) == 3
            assert connection.scalar(select(func.count()).select_from(collection.jobs).where(
                collection.jobs.c.policy_key == original.policy_key)) == 2
        assert store.reserve_call(provider, observed, 2)
        with ThreadPoolExecutor(max_workers=2) as executor:
            accepted = list(executor.map(lambda _: store.reserve_call(provider, observed, 2),
                                         range(2)))
        assert sorted(accepted) == [False, True]
        assert not store.reserve_call(provider, observed, 2)
    finally:
        with engine.begin() as connection:
            for table in (collection.jobs, collection.snapshots, collection.records):
                connection.execute(delete(table).where(table.c.policy_key == original.policy_key))
            connection.execute(delete(collection.usage).where(
                collection.usage.c.provider == provider))


@pytest.fixture(scope="module")
def engine():
    if os.environ.get("BOKJI_TEST_MYSQL") != "1":
        pytest.skip("Set BOKJI_TEST_MYSQL=1 to use the isolated local MySQL test database")
    state = json.loads((BACKEND_ROOT / "data/mysql-dev/credentials.json").read_text())
    settings = Settings(
        _env_file=None,
        db_enabled=True,
        db_host="127.0.0.1",
        db_port=state["port"],
        db_name="bokji_compass_test",
        db_user="bokji_test",
        db_password=state["app_password"],
    )
    result = create_database_engine(settings)
    with result.connect() as connection:
        assert connection.scalar(text("SELECT DATABASE()")) == "bokji_compass_test"
        actual = connection.scalar(text("SELECT @@datadir"))
        from pathlib import Path

        assert Path(actual).resolve() == (BACKEND_ROOT / "data/mysql-dev/data").resolve()
    initialize_policy_schema(result)
    yield result
    result.dispose()


@pytest.fixture
def repository(engine):
    runs = []

    class TrackedRepository(PolicyRepository):
        def start_run(self, sources, processing):
            result = super().start_run(sources, processing)
            runs.append(result)
            return result

    repo = TrackedRepository(engine, auto_publish=False)
    yield repo
    # Delete only IDs created by this test. No truncate, schema drop or real-data cleanup.
    tables = repo.tables
    items = tables["policy_ingestion_items"]
    policies = tables["policies"]
    requirements = tables["policy_requirements"]
    with engine.begin() as connection:
        policy_keys = list(connection.execute(select(items.c.policy_key).where(
            items.c.run_id.in_(runs))).scalars())
        revisions = list(connection.scalars(select(
            tables["condition_documents"].c.revision_id).where(
                tables["condition_documents"].c.policy_key.in_(policy_keys))))
        policy_ids = select(policies.c.id).where(policies.c.source_key.in_(policy_keys))
        connection.execute(delete(requirements).where(requirements.c.policy_id.in_(policy_ids)))
        connection.execute(delete(policies).where(policies.c.source_key.in_(policy_keys)))
        connection.execute(delete(items).where(items.c.run_id.in_(runs)))
        connection.execute(
            delete(tables["policy_ingestion_runs"]).where(
                tables["policy_ingestion_runs"].c.run_id.in_(runs)
            )
        )
        for name in ("condition_entries", "policy_revision_details", "condition_documents"):
            table = tables[name]
            connection.execute(delete(table).where(table.c.revision_id.in_(revisions)))


def test_roundtrip_deduplication_revisions_and_publication_boundary(repository):
    original = draft(source())
    first = repository.import_draft(original)
    revision = first["records"][0]["revision_id"]
    again = repository.import_draft(original)
    assert again["records"][0]["revision_id"] == revision
    assert repository.get_revision(revision) is None
    stored = repository.get_revision(revision, published_only=False)
    assert stored["source_json"] == original["source"]
    assert stored["canonical_json"] == original["canonical"]
    assert stored["draft_json"] == original
    assert stored["review_status"] == "draft" and not stored["matching_enabled"]
    policies = repository.tables["policies"]
    requirements = repository.tables["policy_requirements"]
    with repository.engine.connect() as connection:
        legacy_policy = connection.execute(select(policies).where(
            policies.c.source_key == original["source"]["policy_key"]
        )).mappings().one()
        legacy_requirements = connection.execute(select(requirements).where(
            requirements.c.policy_id == legacy_policy["id"]
        )).mappings().all()
    assert legacy_policy["title"] == original["source"]["title"]
    assert "신청자 만 19세 이상" in legacy_policy["source_text"]
    assert len(legacy_requirements) == 1
    assert legacy_requirements[0]["condition_type"] == "other"
    assert legacy_requirements[0]["information_state"] == "not_stated"
    changed = deepcopy(original)
    changed["source"]["title"] += " 개정"
    changed["source"]["source_hash"] = "f" * 64
    newer = repository.import_draft(changed)["records"][0]["revision_id"]
    assert newer != revision
    assert repository.get_revision(revision, published_only=False)["draft_json"] == original
    assert (
        len(
            repository.list_revisions(
                published_only=False, policy_key=original["source"]["policy_key"]
            )
        )
        == 2
    )
    with repository.engine.connect() as connection:
        updated_policy = connection.execute(select(policies).where(
            policies.c.source_key == original["source"]["policy_key"]
        )).mappings().one()
        updated_requirements = connection.execute(select(requirements).where(
            requirements.c.policy_id == updated_policy["id"]
        )).mappings().all()
    assert updated_policy["id"] == legacy_policy["id"]
    assert updated_policy["title"].endswith("개정")
    assert len(updated_requirements) == 1
    assert repository.backfill_legacy_policies([original["source"]["policy_key"]]) == 1
    with repository.engine.connect() as connection:
        backfilled_policy = connection.execute(select(policies).where(
            policies.c.source_key == original["source"]["policy_key"]
        )).mappings().one()
    assert backfilled_policy["title"].endswith("개정")


@pytest.mark.parametrize("review_status", ["reviewed", "published"])
def test_legacy_review_survives_identical_source_and_resets_for_case_change(
    repository, review_status,
):
    from sqlalchemy import update

    original = draft(source().model_copy(update={"title": "Source CASE"}))
    repository.import_draft(original)
    policies = repository.tables["policies"]
    key = original["source"]["policy_key"]
    with repository.engine.begin() as connection:
        connection.execute(update(policies).where(policies.c.source_key == key).values(
            review_status=review_status))
    repository.import_draft(original)
    with repository.engine.connect() as connection:
        assert connection.scalar(select(policies.c.review_status).where(
            policies.c.source_key == key)) == review_status

    changed = deepcopy(original)
    changed["source"]["title"] = "Source case"
    repository.import_draft(changed)
    with repository.engine.connect() as connection:
        row = connection.execute(select(policies).where(
            policies.c.source_key == key)).mappings().one()
        assert row["review_status"] == "draft"
        assert row["title"] == "Source case"
        assert json.loads(row["source_text"]) == changed["source"]


def test_legacy_projection_preserves_large_validated_source_and_requirements(repository):
    record = normalize_record({
        "document_id": "db-test-" + uuid4().hex,
        "title": "제" * 260,
        "organization": "기" * 300,
        "source_url": "https://example.test/" + "a" * 2100,
        "text": "신청자 만 19세 이상. " + "가" * 22000,
    })
    # Reuse grounded conditions while retaining the full source a model may have extracted.
    value = draft(record.model_copy(update={"fields": {"text": "신청자 만 19세 이상"}}))
    value["source"] = record.model_dump()
    not_stated = {"status": "not_stated", "text": None, "evidence": [],
                  "unresolved_reason": None}
    value.update(overview={
        "title": record.title, "source_url": record.source_url, "category": None,
        "category_reason": "분류 근거 부족",
        "category_evidence": [{"source_field": "text", "quote": "신청자 만 19세 이상"}],
        "region_conditions": not_stated, "gender_conditions": not_stated,
        "age_conditions": not_stated, "benefits": not_stated,
        "other_conditions": [], "unresolved": ["분류 검토 필요"],
        "policy_requirements": [{"condition_type": "other", "information_state": "specified",
                                 "evidence_text": record.fields["text"]}],
    }, overview_status="validated")
    assert len(json.dumps(record.model_dump(), ensure_ascii=False).encode()) > 65535
    assert len(record.fields["text"].encode()) > 65535
    assert validate_draft(value)["status"] == "needs_review"
    revision = repository.import_draft(value)["records"][0]["revision_id"]
    assert repository.get_revision(revision, published_only=False)["draft_json"] == value
    policies = repository.tables["policies"]
    requirements = repository.tables["policy_requirements"]
    with repository.engine.connect() as connection:
        row = connection.execute(select(policies).where(
            policies.c.source_key == record.policy_key)).mappings().one()
        evidence = connection.scalar(select(requirements.c.evidence_text).where(
            requirements.c.policy_id == row["id"]))
    assert row["title"] == record.title
    assert row["organization"] == record.organization
    assert row["source_url"] == record.source_url
    assert json.loads(row["source_text"]) == record.model_dump()
    assert evidence == record.fields["text"]


def test_mid_transaction_failure_rolls_back_entire_revision(repository):
    record = source()
    value = draft(record)
    run_id = repository.start_run([record], {})

    def fail(connection, cursor, statement, parameters, context, many):
        if statement.startswith("INSERT INTO condition_entries"):
            raise RuntimeError("simulated insert failure")

    event.listen(repository.engine, "before_cursor_execute", fail)
    try:
        with pytest.raises(RuntimeError, match="simulated"):
            repository.save_result(run_id, value)
    finally:
        event.remove(repository.engine, "before_cursor_execute", fail)
    assert repository.list_revisions(published_only=False, policy_key=record.policy_key) == []
    assert repository.finish_run(run_id)["records"][0]["status"] == "pending"
    repository.save_result(run_id, value)
    assert repository.finish_run(run_id)["status"] == "needs_review"


def test_concurrent_same_result_has_one_revision(repository):
    record = source()
    value = draft(record)
    runs = [repository.start_run([record], {}) for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda run: repository.save_result(run, value), runs))
    assert len({result["revision_id"] for result in results}) == 1
    assert sum(result["reused"] for result in results) == 1
    documents = repository.tables["condition_documents"]
    with repository.engine.connect() as connection:
        assert (
            connection.scalar(
                select(func.count())
                .select_from(documents)
                .where(documents.c.policy_key == record.policy_key)
            )
            == 1
        )


def test_pipeline_stores_partial_failures_without_draft_files(repository, monkeypatch):
    good, bad = source(), source()

    def parse(record, settings, output):
        if record.policy_key == bad.policy_key:
            raise ValueError("bad extraction")
        return draft(record)

    monkeypatch.setattr(pipeline, "parse_policy", parse)
    result = pipeline.persist_sources([good, bad], Settings(_env_file=None), repository)
    assert result["status"] == "failed"
    states = {item["policy_key"]: item for item in result["records"]}
    assert states[good.policy_key]["revision_id"]
    assert states[bad.policy_key]["error_code"] == "ValueError"


def test_unknown_values_are_sql_null_and_failure_has_no_revision(repository):
    record = normalize_record(
        {"document_id": "db-test-" + uuid4().hex, "title": "정보 없는 공고", "text": ""}
    )
    extraction = pipeline._missing_conditions(record)
    from app.modules.normalization.public import normalize_conditions

    value = {
        "schema_version": "welfare-parsing-v2",
        "source": record.model_dump(),
        "review_status": "draft",
        "matching_enabled": False,
        "status": "needs_review",
        "analysis": extraction.model_dump(),
        "canonical": normalize_conditions(extraction).model_dump(),
    }
    result = repository.import_draft(value)
    revision_id = result["records"][0]["revision_id"]
    entries = repository.tables["condition_entries"]
    with repository.engine.connect() as connection:
        assert (
            connection.scalar(
                select(func.count())
                .select_from(entries)
                .where(entries.c.revision_id == revision_id, entries.c.value_json.is_(None))
            )
            == 1
        )
    failed = {**value, "status": "failed", "analysis": None}
    failed.pop("canonical")
    result = repository.import_draft(failed)
    assert result["status"] == "failed" and result["records"][0]["revision_id"] is None


def test_migration_is_repeatable(engine):
    assert initialize_policy_schema(engine) == {"applied": [], "region_rows": 0}


def test_resume_reuses_validated_checkpoint_without_another_llm_call(repository, monkeypatch):
    record = source()
    value = draft(record)
    run = repository.start_run([record], {})
    repository.mark_failed(run, record.policy_key, "transient_save_failure", value)
    monkeypatch.setattr(pipeline, "parse_policy", lambda *args: pytest.fail("Unexpected LLM retry"))
    result = pipeline.resume_run(run, Settings(_env_file=None), repository)
    assert result["status"] == "needs_review"
    assert pipeline.resume_run(run, Settings(_env_file=None), repository) == result


def test_published_calendar_dates_month_overlap_filters_and_drafts(repository):
    from sqlalchemy import update

    from app.modules.storage import catalog

    periods = ["2026-10-01 ~ 2026-10-31", "상시", "2026-09-01 ~ 2026-11-30", "2026-10-15까지"]
    published = []
    for index, period in enumerate(periods):
        record = normalize_record(
            {
                "서비스ID": "db-test-" + uuid4().hex,
                "서비스명": f"달력 검증 {index}",
                "신청기한": period,
                "지원대상": "신청자 만 19세 이상",
            }
        )
        value = draft(record)
        revision = repository.import_draft(value)["records"][0]["revision_id"]
        published.append((record, revision))
        with repository.engine.begin() as connection:
            documents = repository.tables["condition_documents"]
            details = repository.tables["policy_revision_details"]
            connection.execute(
                update(documents)
                .where(documents.c.revision_id == revision)
                .values(review_status="published")
            )
            connection.execute(
                update(details).where(details.c.revision_id == revision).values(category="주거")
            )
    # A newer unpublished period must not replace the visible published dates.
    changed = normalize_record(
        {
            "서비스ID": published[0][0].policy_key.split(":", 1)[1],
            "서비스명": "비공개 달력",
            "신청기한": "2026-11-01 ~ 2026-11-30",
            "지원대상": "신청자 만 19세 이상",
        }
    )
    hidden = repository.import_draft(draft(changed))["records"][0]["revision_id"]
    result = catalog.list_calendar(repository, month="2026-10", q="달력 검증")
    assert result["total"] == 3 and result["undatedTotal"] == 1
    assert result["undatedItems"][0]["scheduleStatus"] == "ongoing"
    assert {item["revisionId"] for item in result["items"]} == {
        published[index][1] for index in (0, 2, 3)
    }
    assert hidden not in {item["revisionId"] for item in result["items"]}
    assert not result["truncated"]
    assert catalog.list_calendar(repository, month="2026-12", q="달력 검증")["total"] == 0
    assert (
        catalog.list_calendar(repository, month="2026-10", q="달력 검증", category="주거")["total"]
        == 3
    )
    assert (
        catalog.list_calendar(repository, month="2026-10", q="달력 검증", category="교육")["total"]
        == 0
    )
    assert (
        catalog.list_calendar(repository, month="2026-10", q="달력 검증", region="서울")["total"]
        == 0
    )


def test_published_catalog_latest_revision_pagination_and_filters(repository):
    from datetime import datetime

    from fastapi.testclient import TestClient
    from sqlalchemy import update

    from app.api.policies import get_repository
    from app.main import create_app
    from app.modules.storage import catalog

    documents = repository.tables["condition_documents"]
    sources = [source(), source()]
    ids = []
    for index, record in enumerate(sources):
        value = draft(record)
        ids.append(repository.import_draft(value)["records"][0]["revision_id"])
        with repository.engine.begin() as connection:
            connection.execute(
                update(documents)
                .where(documents.c.revision_id == ids[-1])
                .values(review_status="published", created_at=datetime(2026, 1, index + 1))
            )
    newer = draft(sources[0].model_copy(update={"title": "개정 공고 % 문자"}))
    newest = repository.import_draft(newer)["records"][0]["revision_id"]
    # A new draft does not replace the last published revision.
    assert catalog.get_policy(repository, sources[0].policy_key)["revisionId"] == ids[0]
    with repository.engine.begin() as connection:
        connection.execute(
            update(documents)
            .where(documents.c.revision_id == newest)
            .values(review_status="published", created_at=datetime(2026, 1, 3))
        )
    first = catalog.list_policies(repository, limit=1)
    assert first["total"] == 2 and first["nextCursor"] == "1"
    assert first["items"][0]["revisionId"] == newest
    second = catalog.list_policies(repository, limit=1, offset=1)
    assert second["items"][0]["id"] == sources[1].policy_key and second["nextCursor"] is None
    assert catalog.list_policies(repository, q="% 개정")["total"] == 1
    assert catalog.list_policies(repository, q="없는 검색어")["total"] == 0
    assert catalog.list_policies(repository, category="주거")["total"] == 0
    assert catalog.list_policies(repository, region="서울")["total"] == 0
    app = create_app(Settings(_env_file=None, db_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get("/v1/policies?limit=1")
        assert response.status_code == 200 and response.json() == first
        detail = client.get("/v1/policies/" + sources[0].policy_key)
        assert detail.status_code == 200 and detail.json()["revisionId"] == newest
        assert client.get("/v1/policies/nonexistent").status_code == 404
        assert "source_json" not in detail.json()


def catalog_fixture(repository, *, title, region=None, age=None, other=None,
                    region_status="specified", age_status="specified", published=True):
    """Cited synthetic overview; only the isolated test DB receives these rows."""
    from sqlalchemy import update

    content = "\n".join(filter(None, [region, age, other, "신청자 만 19세 이상",
                                    "신청기간: 2026-10-01 ~ 2026-10-31"]))
    record = normalize_record({"document_id": "db-test-" + uuid4().hex,
                               "title": title, "text": content})
    value = draft(record.model_copy(update={"fields": {"text": "신청자 만 19세 이상"}}))
    value["source"] = record.model_dump()

    def section(text, status):
        if text is None:
            return {"status": "not_stated", "text": None, "evidence": [],
                    "unresolved_reason": None}
        return {"status": status, "text": text,
                "evidence": [{"source_field": "text", "quote": text}],
                "unresolved_reason": "검토 필요" if status == "unclear" else None}

    value.update(overview={
        "title": record.title, "source_url": None, "category": "주거",
        "category_reason": "테스트 분류",
        "category_evidence": [{"source_field": "text", "quote": content}],
        "region_conditions": section(region, region_status),
        "age_conditions": section(age, age_status),
        "gender_conditions": section(None, "not_stated"),
        "benefits": section(None, "not_stated"),
        "other_conditions": [{"text": other, "evidence": [
            {"source_field": "text", "quote": other}]}] if other else [],
        "unresolved": [],
        "policy_requirements": [{"condition_type": "other",
                                 "information_state": "specified", "evidence_text": content}],
    }, overview_status="validated")
    revision = repository.import_draft(value)["records"][0]["revision_id"]
    if published:
        documents = repository.tables["condition_documents"]
        with repository.engine.begin() as connection:
            connection.execute(update(documents).where(documents.c.revision_id == revision)
                               .values(review_status="published"))
    return record.policy_key


@pytest.mark.parametrize("selected,stored", [
    ("서울", "서울특별시"), ("경기", "경기도"), ("인천", "인천광역시"),
    ("부산", "부산광역시"), ("대구", "대구광역시"), ("광주", "광주광역시"),
    ("대전", "대전광역시"), ("울산", "울산광역시"), ("세종", "세종특별자치시"),
    ("강원", "강원특별자치도"), ("충북", "충청북도"), ("충남", "충청남도"),
    ("전북", "전북특별자치도"), ("전남", "전라남도"), ("경북", "경상북도"),
    ("경남", "경상남도"), ("제주", "제주특별자치도"),
    ("강원", "강원도"), ("전북", "전라북도"),
])
def test_catalog_region_labels_match_official_and_legacy_names(repository, selected, stored):
    from app.modules.storage import catalog

    title = "지역 필터 회귀 " + uuid4().hex
    key = catalog_fixture(repository, title=title, region=stored + " 거주", age="청년")
    result = catalog.list_policies(repository, q=title, region=selected, audience="청년")
    assert result["total"] == 1 and result["items"][0]["id"] == key


@pytest.mark.parametrize("selected,age,other", [
    ("어르신", "노인", None), ("어르신", "고령자", None), ("어르신", "시니어", None),
    ("어르신", None, "노인 가구"), ("청년", None, "취업 준비 중인 청년"),
    ("가족", None, "한부모 가구"), ("가족", None, "미성년 자녀 양육"),
    ("가족", None, "신혼부부"), ("가족", None, "영유아 부모"),
])
def test_catalog_audience_uses_age_and_other_conditions(repository, selected, age, other):
    from app.modules.storage import catalog

    title = "대상 필터 회귀 " + uuid4().hex
    key = catalog_fixture(repository, title=title, region="충청북도 거주", age=age, other=other)
    result = catalog.list_policies(repository, q=title, region="충북", audience=selected)
    assert result["total"] == 1 and result["items"][0]["id"] == key
    assert catalog.list_policies(repository, q=title, audience="없는 대상")["total"] == 0


def test_catalog_combined_filters_count_pages_calendar_and_publication(repository):
    from fastapi.testclient import TestClient

    from app.api.policies import get_repository
    from app.main import create_app
    from app.modules.storage import catalog

    prefix = "조합 필터 회귀 " + uuid4().hex
    expected = [catalog_fixture(repository, title=prefix + str(index),
                                region=region, region_status=status, other="한부모 가구")
                for index, (region, status) in enumerate([
                    ("충청북도 거주", "specified"), ("충북 거주", "specified"),
                    ("지역 제한 없음", "unrestricted")])]
    for kwargs in [
        {"region": "충청남도 거주", "other": "한부모 가구"},
        {"region": "충청북도 거주", "age": "청년"},
        {"region": "충청북도 거주", "other": "한부모 가구", "published": False},
        {"region": None, "other": "한부모 가구"},
        {"region": "충청북도 거주", "region_status": "unclear", "other": "한부모 가구"},
    ]:
        catalog_fixture(repository, title=prefix, **kwargs)
    filters = {"q": prefix, "category": "주거", "region": "충북", "audience": "가족"}
    first = catalog.list_policies(repository, limit=2, sort="name", **filters)
    second = catalog.list_policies(repository, limit=2, offset=2, sort="name", **filters)
    assert first["total"] == second["total"] == 3
    assert first["nextCursor"] == "2" and second["nextCursor"] is None
    assert [item["id"] for item in first["items"] + second["items"]] == expected
    assert catalog.list_policies(repository, **{**filters, "q": prefix + " 불일치"})["total"] == 0
    calendar = catalog.list_calendar(repository, month="2026-10", **filters)
    assert calendar["total"] == 3 and calendar["undatedTotal"] == 0
    assert {item["id"] for item in calendar["items"]} == set(expected)
    app = create_app(Settings(_env_file=None, db_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get("/v1/policies", params={**filters, "limit": 2, "sort": "name"})
        assert response.status_code == 200 and response.json() == first


def test_catalog_does_not_confuse_gwangju_city_or_shared_districts(repository):
    from app.modules.storage import catalog

    prefix = "지역 혼동 회귀 " + uuid4().hex
    seoul = catalog_fixture(repository, title=prefix, region="서울특별시 강서구 거주")
    busan = catalog_fixture(repository, title=prefix, region="부산광역시 강서구 거주")
    catalog_fixture(repository, title=prefix, region="경기도 광주시 거주")
    metropolitan = catalog_fixture(repository, title=prefix, region="광주광역시 거주")
    short = catalog_fixture(repository, title=prefix, region="광주 거주")
    catalog_fixture(repository, title=prefix, region="강서구 거주")
    for selected, keys in [("서울", {seoul}), ("부산", {busan}),
                            ("광주", {metropolitan, short})]:
        result = catalog.list_policies(repository, q=prefix, region=selected)
        assert {item["id"] for item in result["items"]} == keys


def test_catalog_unclear_audience_and_search_wildcards_are_not_matches(repository):
    from app.modules.storage import catalog

    prefix = "미확정 필터 회귀 " + uuid4().hex
    catalog_fixture(repository, title=prefix, region="서울 거주", age="청년",
                    age_status="unclear")
    catalog_fixture(repository, title=prefix, region="서울 거주", age=None)
    assert catalog.list_policies(repository, q=prefix, audience="청년")["total"] == 0
    assert catalog.list_policies(repository, q=prefix, region="%")["total"] == 0
    assert catalog.list_policies(repository, q=prefix, audience="_")["total"] == 0
