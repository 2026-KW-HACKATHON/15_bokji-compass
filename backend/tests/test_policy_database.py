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
    return normalize_record({"document_id": "db-test-" + uuid4().hex,
                             "title": "DB 검증용", "text": "신청자 만 19세 이상"})


def draft(record):
    from app.modules.normalization.public import normalize_conditions
    from app.modules.parsers.public import extract_conditions
    code = extract_conditions(record)
    canonical = normalize_conditions(code.extraction, logic=code.logic)
    return {"schema_version": "welfare-parsing-v2", "source": record.model_dump(),
            "review_status": "draft", "matching_enabled": False, "status": "needs_review",
            "analysis": code.extraction.model_dump(), "canonical": canonical.model_dump(),
            "overview": None, "overview_status": "not_run", "attempts": []}


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


def test_pipeline_requires_database_by_default(tmp_path):
    path = tmp_path / "raw.json"
    path.write_text(json.dumps({"document_id": "test", "title": "test", "text": ""}))
    with pytest.raises(ValueError, match="DB_ENABLED"):
        pipeline.parse_raw_files([path], settings=Settings(_env_file=None, db_enabled=False))
    assert not (tmp_path / "out").exists()


@pytest.fixture(scope="module")
def engine():
    if os.environ.get("BOKJI_TEST_MYSQL") != "1":
        pytest.skip("Set BOKJI_TEST_MYSQL=1 to use the isolated local MySQL test database")
    state = json.loads((BACKEND_ROOT / "data/mysql-dev/credentials.json").read_text())
    settings = Settings(_env_file=None, db_enabled=True, db_host="127.0.0.1",
                        db_port=state["port"], db_name="bokji_compass_test",
                        db_user="bokji_test", db_password=state["app_password"])
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

    repo = TrackedRepository(engine)
    yield repo
    # Delete only IDs created by this test. No truncate, schema drop or real-data cleanup.
    tables = repo.tables
    items = tables["policy_ingestion_items"]
    with engine.begin() as connection:
        revisions = list(connection.execute(select(items.c.revision_id).where(
            items.c.run_id.in_(runs), items.c.revision_id.is_not(None))).scalars())
        connection.execute(delete(items).where(items.c.run_id.in_(runs)))
        connection.execute(delete(tables["policy_ingestion_runs"]).where(
            tables["policy_ingestion_runs"].c.run_id.in_(runs)))
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
    changed = deepcopy(original)
    changed["source"]["title"] += " 개정"
    changed["source"]["source_hash"] = "f" * 64
    newer = repository.import_draft(changed)["records"][0]["revision_id"]
    assert newer != revision
    assert repository.get_revision(revision, published_only=False)["draft_json"] == original
    assert len(repository.list_revisions(published_only=False,
               policy_key=original["source"]["policy_key"])) == 2


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
        assert connection.scalar(select(func.count()).select_from(documents).where(
            documents.c.policy_key == record.policy_key)) == 1


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
    record = normalize_record({"document_id": "db-test-" + uuid4().hex,
                               "title": "정보 없는 공고", "text": ""})
    extraction = pipeline._missing_conditions(record)
    from app.modules.normalization.public import normalize_conditions
    value = {"schema_version": "welfare-parsing-v2", "source": record.model_dump(),
             "review_status": "draft", "matching_enabled": False, "status": "needs_review",
             "analysis": extraction.model_dump(),
             "canonical": normalize_conditions(extraction).model_dump()}
    result = repository.import_draft(value)
    revision_id = result["records"][0]["revision_id"]
    entries = repository.tables["condition_entries"]
    with repository.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(entries).where(
            entries.c.revision_id == revision_id, entries.c.value_json.is_(None))) == 1
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
