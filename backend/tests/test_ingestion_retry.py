"""Explicit model restart uses only an isolated in-memory SQLite test database."""

import json
from copy import deepcopy
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, insert, select

from app.core.config import Settings
from app.modules.ingestion import __main__ as cli
from app.modules.ingestion import models as m
from app.modules.ingestion.repository import IngestionRepository


@pytest.fixture
def store():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    m.metadata.create_all(engine)
    repository = IngestionRepository(engine, allow_sqlite_for_tests=True)
    yield repository
    engine.dispose()


def failed_checkpoint():
    return {
        "status": "failed", "source": {"policy_key": "gov24:synthetic"},
        "processing_signature": {"hash": "synthetic-signature"},
        "review_status": "draft", "matching_enabled": False,
        "overview": {"title": "합성 검증 결과"}, "overview_status": "validated",
        "overview_attempts": [
            {"model": "primary", "status": "validation_failed"},
            {"model": "fallback", "status": "validated", "usage": [{"input_tokens": 10}]}],
        "attempts": [
            {"model": "primary", "status": "validation_failed"},
            {"model": "fallback", "status": "failed", "error": "codex_timeout"}],
    }


def add_job(store, checkpoint, *, status="dead", kind="parse"):
    with store.engine.begin() as c:
        c.execute(insert(m.jobs).values(job_id="synthetic-job", work_key="synthetic-work",
            kind=kind, policy_key="gov24:synthetic", payload={"source": "synthetic"},
            status=status, attempts=3, next_attempt_at=100, lease_until=0,
            checkpoint=checkpoint, error_code="extraction_failed", created_at=0, updated_at=100))


def read_job(store):
    with store.engine.connect() as c:
        return dict(c.execute(select(m.jobs)).mappings().one())


def test_retry_preserves_checkpoint_by_default(store):
    original = failed_checkpoint()
    add_job(store, original)
    store.retry_job("synthetic-job", 200)
    result = read_job(store)
    assert result["checkpoint"] == original
    assert result["status"] == "pending" and result["attempts"] == 0
    assert result["next_attempt_at"] == 200 and result["error_code"] is None


def test_explicit_restart_clears_only_failed_attempts(store):
    original = failed_checkpoint()
    add_job(store, original)
    store.retry_job("synthetic-job", 200, restart_failed_models=True)
    result = read_job(store)["checkpoint"]
    assert result["attempts"] == []
    assert result["overview_attempts"] == [original["overview_attempts"][1]]
    for key in ("source", "overview", "overview_status", "processing_signature",
                "review_status", "matching_enabled", "status"):
        assert result[key] == original[key]


def test_explicit_restart_clears_overview_errors_without_inventing_success(store):
    checkpoint = failed_checkpoint()
    checkpoint.update(overview=None, overview_status="failed", overview_attempts=[
        {"model": "primary", "status": "failed", "error": "codex_timeout"}])
    add_job(store, checkpoint)
    store.retry_job("synthetic-job", 200, restart_failed_models=True)
    result = read_job(store)["checkpoint"]
    assert result["overview_attempts"] == [] and result["overview"] is None
    assert result["overview_status"] == "failed"


def test_complete_checkpoint_rejects_model_restart_but_allows_storage_retry(store):
    checkpoint = {**failed_checkpoint(), "status": "needs_review"}
    add_job(store, checkpoint)
    before = read_job(store)
    with pytest.raises(ValueError, match="completed validated"):
        store.retry_job("synthetic-job", 200, restart_failed_models=True)
    assert read_job(store) == before
    store.retry_job("synthetic-job", 200)
    assert read_job(store)["checkpoint"] == checkpoint


@pytest.mark.parametrize("status", ["running", "done"])
def test_active_or_completed_job_is_not_restarted(store, status):
    add_job(store, failed_checkpoint(), status=status)
    before = read_job(store)
    with pytest.raises(ValueError, match="Only pending or dead"):
        store.retry_job("synthetic-job", 200, restart_failed_models=True)
    assert read_job(store) == before


def test_non_model_jobs_reject_model_restart(store):
    add_job(store, None, kind="detail")
    with pytest.raises(ValueError, match="parsing job"):
        store.retry_job("synthetic-job", 200, restart_failed_models=True)


def test_malformed_history_does_not_partially_reset_job(store):
    checkpoint = failed_checkpoint()
    checkpoint["attempts"] = "invalid"
    add_job(store, checkpoint)
    before = deepcopy(read_job(store))
    with pytest.raises(ValueError, match="attempt history"):
        store.retry_job("synthetic-job", 200, restart_failed_models=True)
    assert read_job(store) == before


@pytest.mark.parametrize("restart", [False, True])
def test_cli_passes_explicit_flag_and_reports_it(monkeypatch, capsys, restart):
    engine, repository = Mock(), Mock()
    monkeypatch.setattr(cli, "load_settings", lambda: Settings(
        _env_file=None, db_enabled=True, db_password="synthetic-only"))
    monkeypatch.setattr(cli, "create_database_engine", lambda settings: engine)
    monkeypatch.setattr(cli, "IngestionRepository", lambda value: repository)
    args = ["retry-job", "synthetic-job"]
    if restart:
        args.append("--restart-failed-models")
    assert cli.main(args) == 0
    assert repository.retry_job.call_args.args[0] == "synthetic-job"
    assert repository.retry_job.call_args.kwargs == {"restart_failed_models": restart}
    result = json.loads(capsys.readouterr().out)
    assert result == {"status": "queued", "restart_failed_models": restart}
    engine.dispose.assert_called_once()
