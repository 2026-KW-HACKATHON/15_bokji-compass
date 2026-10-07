"""Model allowances defer analysis while bounded raw collection can continue."""

import time

import pytest
from sqlalchemy import create_engine, select, update

from app.core.config import Settings
from app.modules.collectors.pages import CollectionPage
from app.modules.ingestion import models as m
from app.modules.ingestion import public as worker
from app.modules.ingestion.repository import IngestionRepository
from app.modules.normalization.raw import normalize_record
from app.modules.pipeline.budget import BudgetExhausted

URL = "https://youth.seoul.go.kr/notice?id=budget-test"
SIGNATURE = {"hash": "budget-regression"}
CHECKPOINT = {"overview": {"cached": True}}


def forbidden(*args, **kwargs):
    raise AssertionError("No live model, network or policy write is allowed")


class NoPolicyWrites:
    start_run = save_result = finish_run = staticmethod(forbidden)


@pytest.fixture
def store(monkeypatch):
    engine = create_engine("sqlite://")
    m.metadata.create_all(engine)
    monkeypatch.setattr(worker, "processing_signature", lambda _: SIGNATURE)
    monkeypatch.setattr(worker, "discover", forbidden)
    monkeypatch.setattr(worker, "fetch_notice", forbidden)
    repo = IngestionRepository(engine, allow_sqlite_for_tests=True)
    yield repo
    engine.dispose()


def settings(**changes):
    return Settings(_env_file=None, **{
        "data_go_kr_api_key": "fake",
        "ingestion_http_interval_seconds": 0,
        "ingestion_min_available_memory_mb": 0,
        "ingestion_min_free_disk_mb": 0,
        "ingestion_page_size": 1,
        "ingestion_max_pages": 1,
        "ingestion_max_jobs": 4,
        **changes,
    })


def queue_analysis(store, identity="existing"):
    source = normalize_record({"serviceId": identity, "serviceNm": "Existing notice"})
    store.observe_source(source, {}, SIGNATURE, time.time() - 10, 86400)
    with store.engine.begin() as connection:
        connection.execute(update(m.jobs).where(
            m.jobs.c.policy_key == source.policy_key).values(checkpoint=CHECKPOINT))
    return source.policy_key


def queue_notice(store):
    store.save_candidates([{"url": URL, "title": "Candidate", "organization": "Agency"}],
                          time.time())
    candidate = store.list_candidates()[0]
    return store.queue_candidate(candidate["candidate_id"], time.time())


def gov24(**kwargs):
    return CollectionPage([{"serviceId": "new", "serviceNm": "New notice"}],
                          kwargs["page"], kwargs["per_page"], 1, b"listing")


def notice(url, domains, budget):
    assert url == URL
    budget.before("notice")
    return {"title": "Fetched notice", "text": "Agency has an official welfare notice.",
            "source_url": url, "attachments": "[]", "attachment_status": "none_detected"}, b"html"


@pytest.mark.parametrize("reason,changes", [
    ("model_calls", {"ingestion_max_model_calls": 0}),
    ("daily_model_calls", {"ingestion_daily_model_calls": 0}),
    ("tokens", {"ingestion_max_tokens": 0}),
])
def test_custom_model_limit_preserves_analysis_and_collects_raw(
        store, tmp_path, reason, changes):
    key = queue_analysis(store)
    notice_id = queue_notice(store)
    parse_calls = []

    def parse(record, conf, output, *, budget, checkpoint, **kwargs):
        parse_calls.append(record.policy_key)
        assert checkpoint == CHECKPOINT
        budget.before_model(conf)
        forbidden()

    report = worker.run_tick(settings(**changes), store, NoPolicyWrites(),
        adapters={"gov24": gov24}, parser=parse, notice_fetcher=notice, raw_root=tmp_path)
    assert report["status"] == "budget_reached" and report["reason"] == reason
    assert report["pages"] == 1 and report["http_calls"] == 2
    assert report["jobs_completed"] == 1 and report["model_calls"] == 0
    assert parse_calls == [key]
    with store.engine.connect() as connection:
        analysis = connection.execute(select(m.jobs).where(
            m.jobs.c.policy_key == key)).mappings().one()
        fetched = connection.execute(select(m.jobs).where(
            m.jobs.c.job_id == notice_id)).mappings().one()
        assert analysis["status"] == "pending" and analysis["attempts"] == 0
        assert analysis["checkpoint"] == CHECKPOINT and analysis["error_code"] == reason
        assert fetched["status"] == "done"
        assert connection.execute(select(m.records).where(
            m.records.c.policy_key == "gov24:new")).mappings().one()["source_json"]
    assert store.get_state("scan:gov24:serviceDetail")["scan_complete"]
    assert {path.read_bytes() for path in tmp_path.rglob("*.bin")} == {b"html", b"listing"}


def test_batch_model_limit_also_continues_raw_collection(store, tmp_path, monkeypatch):
    queue_analysis(store, "first")
    queue_analysis(store, "second")
    notice_id = queue_notice(store)
    batches = []

    def batch(sources, conf, output, *, budget, **kwargs):
        batches.append([source.policy_key for source in sources])
        budget.before_model(conf)
        forbidden()
        yield

    monkeypatch.setattr(worker, "parse_policy_batch", batch)
    report = worker.run_tick(settings(ingestion_ai_batch_size=2, ingestion_max_model_calls=0),
        store, NoPolicyWrites(), adapters={"gov24": gov24}, notice_fetcher=notice,
        raw_root=tmp_path)
    assert report["reason"] == "model_calls" and report["pages"] == 1
    assert report["http_calls"] == 2 and report["jobs_completed"] == 1
    assert batches == [["gov24:first", "gov24:second"]]
    with store.engine.connect() as connection:
        assert connection.scalar(select(m.jobs.c.status).where(
            m.jobs.c.job_id == notice_id)) == "done"


@pytest.mark.parametrize("reason", ["http_calls", "deadline"])
def test_collection_limits_still_stop_raw_work(store, tmp_path, reason):
    queue_analysis(store)
    notice_id = queue_notice(store)

    def parse(record, conf, output, *, budget, **kwargs):
        if reason == "deadline":
            raise BudgetExhausted("deadline")
        budget.before_model(conf)
        forbidden()

    report = worker.run_tick(settings(ingestion_max_model_calls=0, ingestion_max_http_calls=0),
        store, NoPolicyWrites(), adapters={"gov24": forbidden}, parser=parse,
        notice_fetcher=notice, raw_root=tmp_path)
    assert report["status"] == "budget_reached" and report["reason"] == reason
    assert report["pages"] == report["http_calls"] == report["jobs_completed"] == 0
    with store.engine.connect() as connection:
        assert connection.scalar(select(m.jobs.c.status).where(
            m.jobs.c.job_id == notice_id)) == "pending"
    assert not list(tmp_path.iterdir())
