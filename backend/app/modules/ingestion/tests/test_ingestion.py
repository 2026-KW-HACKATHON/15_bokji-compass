"""Offline server simulations: no public API, CLI model or real MySQL is used."""

import time
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import (
    JSON,
    Column,
    Float,
    MetaData,
    String,
    Table,
    create_engine,
    func,
    insert,
    select,
)

from app.core.config import Settings
from app.modules.collectors.pages import CollectionPage
from app.modules.ingestion import models as m
from app.modules.ingestion import public as worker
from app.modules.ingestion.identity import content_hash
from app.modules.ingestion.repository import IngestionRepository, LeaseLost
from app.modules.normalization.public import normalize_conditions
from app.modules.normalization.raw import normalize_record
from app.modules.parsers.public import extract_conditions
from app.modules.pipeline.budget import BudgetExhausted
from app.modules.pipeline.public import processing_signature


@pytest.fixture
def store():
    engine = create_engine("sqlite://")
    m.metadata.create_all(engine)
    repo = IngestionRepository(engine, allow_sqlite_for_tests=True)
    yield repo
    engine.dispose()


def source(text="신청자 만 19세 이상", **extra):
    return normalize_record({"document_id": "same", "title": "검증용 복지 공고",
                             "text": text, **extra})


def draft(record):
    extracted = extract_conditions(record)
    return {"schema_version": "welfare-parsing-v2", "source": record.model_dump(),
            "review_status": "draft", "matching_enabled": False, "status": "needs_review",
            "analysis": extracted.extraction.model_dump(),
            "canonical": normalize_conditions(
                extracted.extraction, logic=extracted.logic).model_dump(),
            "overview": None, "overview_status": "not_run", "attempts": []}


class PolicyStore:
    def __init__(self):
        self.runs = {}
        self.results = []

    def start_run(self, sources, processing):
        run = str(uuid4())
        self.runs[run] = (sources, processing)
        return run

    def save_result(self, run, value):
        self.results.append(value)
        return {"revision_id": str(uuid4())}

    def finish_run(self, run):
        return {"run_id": run, "status": "needs_review"}


def settings(**overrides):
    return Settings(_env_file=None, ingestion_http_interval_seconds=0,
                    ingestion_min_available_memory_mb=0, **overrides)


def counts(store, table):
    with store.engine.connect() as c:
        return c.scalar(select(func.count()).select_from(table))


def test_content_ignores_observation_metadata_but_preserves_policy_changes():
    first = source(collected_at="yesterday", viewCount=1)
    second = source(collected_at="today", viewCount=999)
    assert first.source_hash != second.source_hash
    assert content_hash(first) == content_hash(second)
    second.fields["application_method"] = ""
    assert content_hash(first) == content_hash(second)
    second.fields["application_period"] = "2026-10-05까지"
    assert content_hash(first) != content_hash(second)


def test_observe_reuses_work_and_preserves_changes_and_reverted_content(store):
    a, b = source(), source("신청자 만 20세 이상")
    first = store.observe_source(a, {"text": "a"}, {"hash": "v1"}, 0, 100)
    same = store.observe_source(source(collected_at="now"), {}, {"hash": "v1"}, 1, 100)
    changed = store.observe_source(b, {"text": "b"}, {"hash": "v1"}, 2, 100)
    reverted = store.observe_source(a, {"text": "a"}, {"hash": "v1"}, 3, 100)
    assert first["queued"] and same["unchanged"] and not same["queued"]
    assert changed["changed"] and reverted["changed"] and not reverted["queued"]
    assert counts(store, m.snapshots) == 3
    assert counts(store, m.jobs) == 2
    assert store.changes()[0]["changed_fields"] == ["fields.text"]
    store.observe_source(a, {}, {"hash": "v2"}, 4, 100)
    assert counts(store, m.jobs) == 3


def test_daily_quota_survives_new_repository_and_resets_on_korean_date(store):
    before = datetime(2026, 10, 2, 14, 59, tzinfo=UTC).timestamp()
    after = datetime(2026, 10, 2, 15, 1, tzinfo=UTC).timestamp()
    assert store.reserve_call("bokjiro", before, 1)
    restarted = IngestionRepository(store.engine, allow_sqlite_for_tests=True)
    assert not restarted.reserve_call("bokjiro", before, 1)
    assert restarted.reserve_call("bokjiro", after, 1)
    assert not restarted.reserve_call("gov24", after, 0)


def test_page_cursor_and_jobs_roll_back_together(store):
    assert store.acquire_worker("worker-a", 0, 100)
    page = CollectionPage([{"servId": "01", "servNm": "복지"}], 1, 1, 2, b"xml")
    def failing(c, rows):
        store.observe_listing(c, "bokjiro", rows[0], 1, 100)
        raise ValueError("simulate partial page failure")
    with pytest.raises(ValueError):
        store.save_page("scan:bokjiro:list", page, 1, 100, failing, worker_token="worker-a")
    assert store.get_state("scan:bokjiro:list") == {}
    assert counts(store, m.jobs) == counts(store, m.records) == 0
    store.save_page("scan:bokjiro:list", page, 1, 100,
        lambda c, rows: store.observe_listing(c, "bokjiro", rows[0], 1, 100),
        worker_token="worker-a")
    assert store.get_state("scan:bokjiro:list")["page"] == 2
    with pytest.raises(ValueError, match="repeated"):
        store.save_page("scan:bokjiro:list", CollectionPage(page.rows, 2, 1, 2, b"xml"),
            2, 100, lambda c, rows: None, worker_token="worker-a")


def test_expired_worker_cannot_write_source_or_finish_newer_tick(store):
    store.observe_source(source(), {}, {}, 0, 100)
    assert store.acquire_worker("old", 0, 10)
    assert not store.acquire_worker("new", 1, 100)
    job = store.claim("old", 1, 10)
    assert store.acquire_worker("new", 11, 100)
    with pytest.raises(LeaseLost):
        store.complete_observation(job, source("신청자 만 30세 이상"), {}, {}, 12, 100)
    with pytest.raises(LeaseLost):
        store.finish_worker("old", {"status": "incorrect"}, 12)
    assert counts(store, m.snapshots) == 1
    newjob = store.claim("new", 12, 50)
    assert newjob["job_id"] == job["job_id"]
    with pytest.raises(LeaseLost):
        store.complete(job, 13)
    store.complete(newjob, 13, revision_id="revision")


def test_budget_defer_preserves_checkpoint_and_does_not_use_error_attempt(store):
    store.observe_source(source(), {}, {}, 0, 100)
    store.acquire_worker("w", 0, 100)
    job = store.claim("w", 1, 50)
    store.checkpoint(job, {"overview": "already extracted"}, 2)
    store.defer(job, 3, 10, "model_calls", exhausted=True)
    assert store.claim("w", 5, 50) is None
    resumed = store.claim("w", 14, 50)
    assert resumed["attempts"] == 1
    assert resumed["checkpoint"]["overview"] == "already extracted"


def test_notice_url_reuses_legacy_identity_and_schedules_refresh(store):
    url = "https://youth.seoul.go.kr/notice?id=1"
    old = normalize_record({"document_id": "legacy-url-hash", "title": "복지",
                            "text": "신청자 만 19세 이상", "source_url": url})
    store.observe_source(old, {}, {}, 0, 100)
    candidate = {"url": url, "title": "복지", "organization": "기관"}
    store.save_candidates([candidate], 1)
    cid = store.list_candidates()[0]["candidate_id"]
    store.queue_candidate(cid, 2)
    with store.engine.begin() as c:
        notice = c.execute(select(m.jobs).where(m.jobs.c.kind == "notice")).mappings().one()
        assert notice["policy_key"] == old.policy_key
        c.execute(m.jobs.update().values(status="done"))
    store.schedule_notice_rechecks(101, 100, 1)
    assert store.pending_count() == 1


def test_worker_two_ticks_skip_same_content_before_model(store, tmp_path, monkeypatch):
    current = {"서비스ID": "0001", "서비스명": "복지", "지원대상": "신청자 만 19세 이상"}
    def gov(**kwargs):
        rows = [dict(current)] if kwargs["endpoint"] == "serviceDetail" else []
        return CollectionPage(rows, kwargs["page"], kwargs["per_page"], len(rows), b"raw")
    calls = []
    def parse(record, conf, output, *, budget, **kwargs):
        budget.before_model(conf)
        budget.record({"usage": [{"input_tokens": 10, "output_tokens": 5}]})
        calls.append(record.policy_key)
        return {"status": "needs_review", "source": record.model_dump()}
    conf = settings(data_go_kr_api_key="fake", ingestion_max_pages=1)
    policy = PolicyStore()
    report = worker.run_tick(conf, store, policy, adapters={"gov24": gov}, parser=parse,
                             raw_root=tmp_path)
    assert report["new"] == 1 and report["model_calls"] == 1 and report["tokens"] == 15
    store.set_state("scan_turn", {"offset": 0})
    store.set_state("scan:gov24:serviceDetail", {"page": 1, "next_due_at": 0})
    report = worker.run_tick(conf, store, policy, adapters={"gov24": gov}, parser=parse,
                             raw_root=tmp_path)
    assert report["unchanged"] == 1 and report["model_calls"] == 0
    assert len(calls) == len(policy.results) == 1
    current["지원대상"] = "신청자 만 20세 이상"
    store.set_state("scan_turn", {"offset": 0})
    store.set_state("scan:gov24:serviceDetail", {"page": 1})
    report = worker.run_tick(conf, store, policy, adapters={"gov24": gov}, parser=parse,
                             raw_root=tmp_path)
    assert report["changed"] == 1 and len(policy.results) == 2
    assert all(value["source"]["policy_key"] == "gov24:0001" for value in policy.results)


def test_queue_capacity_prevents_page_fetch(store, tmp_path):
    for identity in ("a", "b", "c"):
        record = normalize_record({"document_id": identity, "title": "공고", "text": "조건"})
        store.observe_source(record, {}, {}, time.time(), 100)
    def forbidden(**kwargs):
        raise AssertionError("page must not be fetched when capacity is insufficient")
    report = worker.run_tick(settings(data_go_kr_api_key="fake", ingestion_max_jobs=0,
        ingestion_queue_limit=4, ingestion_page_size=2), store, PolicyStore(),
        adapters={"gov24": forbidden}, raw_root=tmp_path)
    assert report["pages"] == report["http_calls"] == 0
    assert store.pending_count() == 3


def test_bootstrap_finishes_raw_scan_before_analysis_and_then_switches_to_steady(store, tmp_path):
    calls = []
    def gov(**kwargs):
        rows = [{"서비스ID": "first", "서비스명": "공고", "지원대상": "별도 심사"}]
        if kwargs["endpoint"] != "serviceDetail" or kwargs["page"] != 1:
            rows = []
        return CollectionPage(rows, kwargs["page"], kwargs["per_page"],
                             200 if kwargs["endpoint"] == "serviceDetail" else 0, b"raw")
    def parse(record, conf, output, *, budget, **kwargs):
        budget.before_model(conf)
        calls.append(record.policy_key)
        return {"status": "needs_review", "source": record.model_dump()}
    conf = settings(ingestion_profile="bootstrap", data_go_kr_api_key="fake",
                    ingestion_page_size=100, ingestion_max_pages=1)
    report = worker.run_tick(conf, store, PolicyStore(), adapters={"gov24": gov},
                             parser=parse, raw_root=tmp_path)
    assert report["phase"] == "collect" and report["model_calls"] == 0 and not calls
    report = worker.run_tick(conf.model_copy(update={"ingestion_max_pages": 10}), store,
                             PolicyStore(), adapters={"gov24": gov}, parser=parse,
                             raw_root=tmp_path)
    assert report["phase"] == "complete" and report["model_calls"] == 1
    assert store.get_state("bootstrap")["complete"] is True
    report = worker.run_tick(conf, store, PolicyStore(), adapters={"gov24": gov},
                             parser=parse, raw_root=tmp_path)
    assert report["profile"] == "steady" and report["model_calls"] == 0


def test_steady_ai_exhaustion_does_not_prevent_api_collection(store, tmp_path):
    def gov(**kwargs):
        rows = [{"서비스ID": "first", "서비스명": "공고", "지원대상": "별도 심사"}]
        if kwargs["endpoint"] != "serviceDetail":
            rows = []
        return CollectionPage(rows, kwargs["page"], kwargs["per_page"], len(rows), b"raw")
    def parse(record, conf, output, *, budget, **kwargs):
        budget.before_model(conf)
        raise AssertionError("No AI allowance")
    report = worker.run_tick(settings(ingestion_profile="steady", data_go_kr_api_key="fake",
        ingestion_max_model_calls=0), store, PolicyStore(), adapters={"gov24": gov},
        parser=parse, raw_root=tmp_path)
    assert report["pages"] == 3 and report["new"] == 1
    assert report["status"] == "budget_reached" and report["reason"] == "model_calls"


def test_worker_fetches_multiple_pages_fairly_in_one_tick(store, tmp_path):
    seen = []
    def gov(**kwargs):
        seen.append((kwargs["endpoint"], kwargs["page"]))
        if kwargs["endpoint"] == "serviceDetail":
            row = {"서비스ID": str(kwargs["page"]), "서비스명": "공고", "지원대상": "별도 심사"}
        else:
            row = {"서비스ID": str(kwargs["page"])}
        return CollectionPage([row], kwargs["page"], kwargs["per_page"], 300,
                             str(seen[-1]).encode())
    report = worker.run_tick(settings(ingestion_profile="steady", data_go_kr_api_key="fake",
        ingestion_page_size=100, ingestion_max_pages=8, ingestion_max_jobs=0,
        ingestion_queue_limit=1000), store, PolicyStore(), adapters={"gov24": gov},
        raw_root=tmp_path)
    assert report["pages"] == 8
    assert seen[:3] == [("serviceDetail", 1), ("serviceList", 1), ("supportConditions", 1)]
    assert sum(endpoint == "serviceDetail" for endpoint, _ in seen) == 3


def test_worker_bundles_four_durable_parse_jobs_in_one_cli_call(store, tmp_path, monkeypatch):
    from app.modules.pipeline import batching
    from tests.test_policy_batching import records, response
    conf = settings(ingestion_profile="steady", ingestion_max_pages=0,
                    ingestion_max_jobs=4, ingestion_ai_batch_size=4)
    for record in records():
        store.observe_source(record, {}, processing_signature(conf), time.time(), 100)
    calls = []
    def model(requests, *_):
        calls.append(len(requests))
        return [response(s) for s, *_ in requests], {"usage": [{"total_tokens": 500}]}
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    policies = PolicyStore()
    report = worker.run_tick(conf, store, policies, raw_root=tmp_path)
    assert calls == [4] and report["jobs_completed"] == 4
    assert report["model_calls"] == report["batch_calls"] == 1 and report["tokens"] == 500
    assert len(policies.results) == 4 and store.pending_count() == 0


def test_model_configuration_upgrade_requeues_without_losing_source(store, tmp_path):
    conf = settings(ingestion_max_pages=0)
    store.observe_source(source(), {}, {"hash": "old"}, time.time(), 100)
    parsed = []
    def parse(record, *_args, **_kwargs):
        parsed.append(record.policy_key)
        return {"status": "needs_review", "source": record.model_dump()}
    report = worker.run_tick(conf, store, PolicyStore(), parser=parse, raw_root=tmp_path)
    assert parsed == [source().policy_key] and report["jobs_completed"] == 1
    assert store.pending_count() == 0 and counts(store, m.jobs) == 2


def test_worker_saves_complete_result_before_database_retry(store, tmp_path):
    conf = settings(ingestion_max_attempts=3)
    store.observe_source(source(), {}, processing_signature(conf), time.time(), 100)
    class Unavailable(PolicyStore):
        def save_result(self, *args):
            raise RuntimeError("simulated DB result rejection")
    calls = []
    def parse(record, *args, **kwargs):
        calls.append(record.policy_key)
        return {"status": "needs_review", "source": record.model_dump()}
    first = worker.run_tick(conf, store, Unavailable(), parser=parse, raw_root=tmp_path)
    assert first["errors"] and len(calls) == 1
    failed = store.status()["failures"][0]
    store.retry_job(failed["job_id"], time.time())
    second = worker.run_tick(conf, store, PolicyStore(), parser=parse, raw_root=tmp_path)
    assert not second["errors"] and len(calls) == 1


def test_disabled_tick_and_configuration_doctor_never_connect(monkeypatch, capsys):
    from app.modules.ingestion import __main__ as cli
    monkeypatch.setattr(cli, "load_settings", lambda: settings())
    def forbidden(*args):
        raise AssertionError("No connection permitted")
    monkeypatch.setattr(cli, "create_database_engine", forbidden)
    assert cli.main(["tick"]) == 0
    assert "disabled" in capsys.readouterr().out
    assert cli.main(["doctor"]) == 0
    assert "configuration_only" in capsys.readouterr().out
    assert cli.main(["tick", "--max-jobs", "-1"]) == 1


def test_seed_indexes_latest_revision_instead_of_uuid_order(store):
    meta = MetaData()
    docs = Table("condition_documents", meta, Column("revision_id", String, primary_key=True),
        Column("policy_key", String), Column("created_at", Float))
    details = Table("policy_revision_details", meta,
        Column("revision_id", String, primary_key=True),
        Column("draft_json", JSON), Column("processing_json", JSON))
    meta.create_all(store.engine)
    old, new = source(), source("신청자 만 20세 이상")
    with store.engine.begin() as c:
        for revision, timestamp, record in (("zzz", 1, old), ("aaa", 2, new)):
            c.execute(insert(docs).values(revision_id=revision, policy_key=record.policy_key,
                                         created_at=timestamp))
            c.execute(insert(details).values(revision_id=revision, draft_json=draft(record),
                                              processing_json={"processing_signature": {"v": 1}}))
    class Existing:
        engine = store.engine
        tables = {"condition_documents": docs, "policy_revision_details": details}
    indexed = store.seed_existing(Existing(), {"v": 1}, 1)
    assert indexed["indexed"] == indexed["reused"] == 1
    with store.engine.connect() as c:
        row = c.execute(select(m.records)).mappings().one()
        assert row["source_json"]["fields"]["text"] == new.fields["text"]
        assert row["revision_id"] == "aaa"
    assert store.pending_count() == 0


def test_notice_dns_rejects_mixed_public_private_addresses(monkeypatch):
    from app.modules.ingestion import web
    monkeypatch.setattr(web.socket, "getaddrinfo", lambda *args, **kwargs: [
        (2, 1, 6, "", ("8.8.8.8", 443)), (2, 1, 6, "", ("127.0.0.1", 443))])
    with pytest.raises(RuntimeError, match="private_address"):
        web.resolve_public("youth.seoul.go.kr", 443)


def test_server_model_daily_budget_is_reserved_before_call(store):
    conf = settings(ingestion_daily_model_calls=1)
    budget = worker.ServerModelBudget(conf, store, time.monotonic() + 60)
    budget.before_model(conf)
    with pytest.raises(BudgetExhausted, match="daily_model_calls"):
        budget.before_model(conf)
