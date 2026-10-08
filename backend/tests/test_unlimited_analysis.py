"""AI-only draining uses fake model results and isolated durable SQLite storage."""

import time
from threading import Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select

from app.core.config import Settings
from app.modules.ingestion import models as m
from app.modules.ingestion.analysis import analysis_settings, run_analysis
from app.modules.ingestion.repository import IngestionRepository
from app.modules.llm.public import CodexRunError
from app.modules.normalization.raw import normalize_record
from app.modules.pipeline.public import processing_signature
from app.modules.server_admin import operations


@pytest.fixture
def setup():
    engine = create_engine("sqlite://")
    m.metadata.create_all(engine)
    store = IngestionRepository(engine, allow_sqlite_for_tests=True)
    settings = Settings(_env_file=None, ingestion_enabled=False, ingestion_max_jobs=0,
        ingestion_max_model_calls=0, ingestion_max_tokens=0, ingestion_daily_model_calls=0)
    signature = processing_signature(settings)
    for index in range(9):
        source = normalize_record({"서비스ID": str(index), "서비스명": f"공고 {index}",
                                   "지원대상": "신청자 만 19세 이상"})
        store.observe_source(source, {}, signature, time.time(), 86400)
    with engine.begin() as connection:
        store.observe_listing(connection, "bokjiro", {"servId": "detail", "servNm": "미확보"},
                              time.time(), 86400)
    yield settings, store
    engine.dispose()


class Policies:
    def __init__(self):
        self.saved = []

    def start_run(self, sources, metadata):
        return str(uuid4())

    def save_result(self, run_id, draft):
        self.saved.append(draft["source"]["policy_key"])
        return {"revision_id": str(uuid4())}

    def finish_run(self, run_id):
        pass


def fake_parser(sources, settings, output, *, budget, checkpoints, save_checkpoint,
                stop_on_transport_error):
    assert stop_on_transport_error
    budget.before_model(settings)
    budget.record({"usage": {"input_tokens": 100, "output_tokens": 50}})
    for source in sources:
        draft = {"status": "needs_review", "source": source.model_dump()}
        save_checkpoint(source.policy_key, draft)
        yield source.policy_key, draft


def test_ai_only_drains_beyond_zero_app_caps_without_claiming_detail_jobs(setup):
    settings, store = setup
    policies, progress = Policies(), []
    result = run_analysis(settings, store, policies, batch_parser=fake_parser,
                          progress=lambda report: progress.append(report["jobs_completed"]))
    assert result["status"] == "completed" and result["jobs_completed"] == 9
    assert result["model_calls"] == 3 and result["tokens"] == 450
    assert result["http_calls"] == result["jobs_remaining"] == 0
    assert len(set(policies.saved)) == 9 and progress[-1] == 9
    with store.engine.connect() as connection:
        detail = connection.execute(select(m.jobs).where(
            m.jobs.c.kind == "detail")).mappings().one()
        calls = connection.scalar(select(m.usage.c.calls).where(m.usage.c.provider == "model"))
    assert detail["status"] == "pending" and detail["attempts"] == 0
    assert calls == 3 and store.get_state("analysis_run")["status"] == "finished"


def test_bulk_drains_more_than_one_large_batch_once_and_keeps_normal_settings(setup):
    settings, store = setup
    original = settings.model_dump()
    for index in range(9, 33):
        source = normalize_record({"서비스ID": str(index), "서비스명": f"공고 {index}",
                                   "지원대상": "신청자 만 19세 이상"})
        store.observe_source(source, {}, processing_signature(settings), time.time(), 86400)
    sizes, policies = [], Policies()
    def parser(sources, run_settings, *args, **kwargs):
        sizes.append(len(sources))
        assert run_settings.ingestion_ai_batch_input_chars == 100000
        assert run_settings.codex_timeout_seconds == 900
        yield from fake_parser(sources, run_settings, *args, **kwargs)
    result = run_analysis(settings, store, policies, mode="bulk", batch_parser=parser)
    assert sizes == [16, 16, 1]
    assert result["jobs_completed"] == 33 and result["model_calls"] == 3
    assert result["analysis_mode"] == "bulk" and result["http_calls"] == 0
    assert store.get_state("analysis_run")["analysis_mode"] == "bulk"
    second = run_analysis(settings, store, policies, mode="bulk", batch_parser=parser)
    assert second["jobs_completed"] == second["model_calls"] == 0
    assert len(policies.saved) == len(set(policies.saved)) == 33
    assert settings.model_dump() == original
    assert analysis_settings(settings).ingestion_ai_batch_size == 4


def test_bulk_splits_long_sources_without_truncation(setup):
    from app.modules.llm.public import batch_input_chars
    from app.modules.pipeline.batching import requests_for
    settings, store = setup
    full_text = "대상자 별도 확인 필요. " * 3500
    for index in range(3):
        source = normalize_record({"서비스ID": f"long-{index}", "서비스명": "긴 공고",
                                   "지원대상": full_text})
        store.observe_source(source, {}, processing_signature(settings), time.time(), 86400)
    seen = []
    def parser(sources, run_settings, *args, **kwargs):
        assert batch_input_chars(requests_for(sources, kwargs["checkpoints"])) <= 100000
        seen.extend(s.fields["eligibility"] for s in sources if ":long-" in s.policy_key)
        yield from fake_parser(sources, run_settings, *args, **kwargs)
    result = run_analysis(settings, store, Policies(), mode="bulk", batch_parser=parser)
    assert result["jobs_completed"] == 12 and result["model_calls"] > 1
    assert seen == [full_text.strip()] * 3


def test_cancel_preserves_current_batch_and_resumes_remaining_jobs(setup):
    settings, store = setup
    policies, stop = Policies(), Event()
    def parser(*args, **kwargs):
        yield from fake_parser(*args, **kwargs)
        stop.set()
    first = run_analysis(settings, store, policies, stop=stop, batch_parser=parser)
    assert first["status"] == "cancelled" and first["jobs_completed"] == 4
    assert first["jobs_remaining"] == 5
    second = run_analysis(settings, store, policies, batch_parser=fake_parser)
    assert second["status"] == "completed" and second["jobs_completed"] == 5
    assert len(policies.saved) == len(set(policies.saved)) == 9


def test_codex_failure_pauses_without_consuming_job_retries_or_spinning(setup):
    settings, store = setup
    policies = Policies()
    def failed(sources, settings, output, *, budget, **kwargs):
        budget.before_model(settings)
        raise CodexRunError("private-provider-details")
    first = run_analysis(settings, store, policies, batch_parser=failed)
    assert first["status"] == "paused" and first["reason"] == "codex_unavailable"
    assert first["model_calls"] == 1 and first["jobs_remaining"] == 9
    assert policies.saved == [] and "private" not in str(first)
    with store.engine.connect() as connection:
        jobs = connection.execute(select(m.jobs).where(m.jobs.c.kind == "parse")).mappings().all()
    assert all(job["status"] == "pending" and job["attempts"] == 0 for job in jobs)
    second = run_analysis(settings, store, policies, batch_parser=fake_parser)
    assert second["jobs_completed"] == 9


def test_processing_version_upgrade_does_not_spend_model_calls_on_old_jobs(setup):
    settings, store = setup
    from sqlalchemy import update
    with store.engine.begin() as connection:
        for job in connection.execute(select(m.jobs).where(m.jobs.c.kind == "parse")).mappings():
            connection.execute(update(m.jobs).where(m.jobs.c.job_id == job["job_id"]).values(
                payload={**job["payload"], "signature": {"hash": "old"}},
                work_key="old-" + job["job_id"]))
    result = run_analysis(settings, store, Policies(), batch_parser=fake_parser)
    assert result["jobs_completed"] == 9 and result["model_calls"] == 3


def test_command_worker_is_visible_and_stoppable_from_admin_manager(setup, monkeypatch):
    settings, store = setup
    token = str(uuid4())
    assert store.acquire_worker(token, time.time(), 100)
    store.set_state("analysis_run", {"id": token, "action": "analyze-all", "status": "running",
        "started_at": time.time(), "finished_at": None,
        "result": {"status": "running", "jobs_completed": 2, "errors": []}})
    monkeypatch.setattr(operations, "IngestionRepository", lambda _: store)
    state = SimpleNamespace(database_engine=store.engine)
    manager = operations.Operations()
    assert manager.snapshot(state)["operation"]["id"] == token
    assert manager.stop(state, token)["operation"]["stop_requested"] is True
    assert store.get_state("analysis_stop:" + token) == {"requested": True}
    store.release_worker(token)
    assert manager.snapshot(state)["operation"]["result"]["reason"] == "worker_interrupted"
