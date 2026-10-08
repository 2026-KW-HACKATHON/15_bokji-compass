"""Automatic Kwangwoon listing, durable raw jobs and resumption without live services."""

import time

import pytest
from sqlalchemy import create_engine, func, select

from app.core.config import Settings
from app.modules.collectors.kwangwoon_notices import build_kwangwoon_notice_url
from app.modules.collectors.pages import CollectionPage
from app.modules.ingestion import models as m
from app.modules.ingestion import public as worker
from app.modules.ingestion.repository import IngestionRepository
from app.modules.normalization.raw import normalize_record


def forbidden(*args, **kwargs):
    raise AssertionError("No live API, model or policy publication is allowed")


class NoPolicyWrites:
    start_run = save_result = finish_run = staticmethod(forbidden)


@pytest.fixture
def store(monkeypatch):
    engine = create_engine("sqlite://")
    m.metadata.create_all(engine)
    monkeypatch.setattr(worker, "processing_signature", lambda _: {"hash": "kw-test"})
    monkeypatch.setattr(worker, "parse_policy", forbidden)
    monkeypatch.setattr(worker, "discover", forbidden)
    monkeypatch.setattr(worker, "fetch_notice", forbidden)
    monkeypatch.setattr(worker, "fetch_gov24_page", forbidden)
    monkeypatch.setattr(worker, "fetch_bokjiro_page", forbidden)
    repository = IngestionRepository(engine, allow_sqlite_for_tests=True)
    yield repository
    engine.dispose()


def settings(**changes):
    return Settings(_env_file=None, **{
        "ingestion_profile": "steady", "ingestion_page_size": 100,
        "ingestion_max_pages": 1, "ingestion_max_jobs": 2,
        "ingestion_max_model_calls": 0, "ingestion_http_interval_seconds": 0,
        "ingestion_min_available_memory_mb": 0, "ingestion_min_free_disk_mb": 0,
        **changes,
    })


def listing(duid, modified="2026-10-06"):
    return {"url": build_kwangwoon_notice_url(duid), "title": "[등록/장학] 장학금 안내",
            "organization": "광운대학교", "published_date": "2026-10-05",
            "modified_date": modified}


def detail(url, domains, budget):
    assert "www.kw.ac.kr" not in domains
    budget.before("notice")
    return {"title": "[등록/장학] 장학금 안내", "text": "작성일 2026.10.05\n신청 안내",
            "source_url": url, "published_date": "2026-10-05", "modified_date": "2026-10-06",
            "attachments": '["https://www.kw.ac.kr/include/Download.jsp?fuid=1&ano=53017"]',
            "attachment_status": "not_parsed", "image_urls": '["https://www.kw.ac.kr/poster.png"]',
            "image_status": "not_parsed"}, b"original-detail-html"


def test_default_worker_collects_kwangwoon_without_api_keys_or_discovery(
        store, tmp_path, monkeypatch):
    calls = []

    def page(**kwargs):
        calls.append(kwargs)
        return CollectionPage([listing(53017), listing(53018)], kwargs["page"], 10, 100,
                              b"original-list-html")

    monkeypatch.setattr(worker, "fetch_kwangwoon_page", page)
    monkeypatch.setattr(worker, "fetch_kwangwoon_notice_detail", detail)
    report = worker.run_tick(settings(), store, NoPolicyWrites(), raw_root=tmp_path)
    assert report["pages"] == 1 and report["jobs_completed"] == 2
    assert report["http_calls"] == 3 and report["model_calls"] == 0
    assert report["new"] == 2 and report["errors"] == []
    assert calls[0]["per_page"] == 10 and "api_key" not in calls[0]
    assert store.get_state("scan:kwangwoon:list")["page"] == 2
    with store.engine.connect() as connection:
        records = connection.execute(select(m.records)).mappings().all()
        assert len(records) == 2
        for record in records:
            source = record["source_json"]
            assert source["organization"] == "광운대학교"
            assert source["title"] == "[등록/장학] 장학금 안내"
            assert source["fields"]["published_date"] == "2026-10-05"
            assert source["fields"]["attachment_status"] == "not_parsed"
            assert "Download.jsp" in source["fields"]["attachment_urls"]
            assert source["fields"]["image_status"] == "not_parsed"
        assert connection.scalar(select(func.count()).select_from(m.jobs).where(
            m.jobs.c.kind == "parse", m.jobs.c.status == "pending")) == 2
    assert {path.read_bytes() for path in tmp_path.rglob("*.bin")} == {
        b"original-detail-html", b"original-list-html"}


def test_repeated_pin_reuses_record_and_modified_listing_queues_new_fetch(store):
    now = time.time()
    first = listing(53017)
    with store.engine.begin() as connection:
        assert store.observe_notice_listing(connection, first, now, 86400) == 1
        assert store.observe_notice_listing(connection, first, now + 1, 86400) == 0
        assert store.observe_notice_listing(connection, listing(53017, "2026-10-07"),
                                           now + 2, 86400) == 1
    with store.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(m.records)) == 1
        assert connection.scalar(select(func.count()).select_from(m.jobs)) == 2


def test_listing_failure_keeps_cursor_and_rolls_back_partial_queue(store, tmp_path):
    def invalid(**kwargs):
        return CollectionPage([listing(53017), {"title": "broken"}], kwargs["page"], 10, 100,
                              b"invalid-list")

    report = worker.run_tick(settings(ingestion_max_jobs=0), store, NoPolicyWrites(),
        adapters={"kwangwoon": invalid}, raw_root=tmp_path)
    assert report["pages"] == 0 and report["errors"]
    assert store.get_state("scan:kwangwoon:list").get("page", 1) == 1
    with store.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(m.records)) == 0
        assert connection.scalar(select(func.count()).select_from(m.jobs)) == 0


def test_listing_reuses_imported_notice_identity_for_same_source_url(store):
    row = listing(53017)
    legacy = normalize_record({"document_id": "legacy-source-id", "title": row["title"],
        "organization": row["organization"], "source_url": row["url"], "text": "원문"})
    now = time.time()
    store.observe_source(legacy, {}, {"hash": "kw-test"}, now, 86400)
    with store.engine.begin() as connection:
        store.observe_notice_listing(connection, row, now + 1, 86400)
    with store.engine.connect() as connection:
        records = connection.execute(select(m.records)).mappings().all()
        assert len(records) == 1 and records[0]["policy_key"] == legacy.policy_key
        assert connection.scalar(select(m.jobs.c.policy_key).where(
            m.jobs.c.kind == "notice")) == legacy.policy_key


def test_small_kwangwoon_page_uses_remaining_queue_space(store, tmp_path):
    now = time.time()
    for index in range(90):
        source = normalize_record({"document_id": f"backlog-{index}", "title": "대기 공고",
                                   "text": "분석할 원문"})
        store.observe_source(source, {}, {"hash": "kw-test"}, now, 86400)

    def page(**kwargs):
        return CollectionPage([listing(53017)], kwargs["page"], 10, 100, b"new-list")

    report = worker.run_tick(settings(ingestion_max_jobs=0, ingestion_queue_limit=100),
        store, NoPolicyWrites(), adapters={"kwangwoon": page}, raw_root=tmp_path)
    assert report["pages"] == 1 and report["errors"] == []
    assert store.pending_count() == 91


@pytest.mark.parametrize("changes,expected", [
    ({"ingestion_kwangwoon_enabled": False}, None),
    ({"ingestion_daily_notice_calls": 0}, "daily_calls_notice"),
    ({"ingestion_max_http_calls": 0}, "http_calls"),
])
def test_disabled_or_exhausted_allowance_never_requests_kwangwoon(
        store, tmp_path, changes, expected):
    report = worker.run_tick(settings(ingestion_max_jobs=0, **changes), store, NoPolicyWrites(),
        adapters={"kwangwoon": forbidden}, raw_root=tmp_path)
    assert report["pages"] == report["http_calls"] == 0
    if expected == "daily_calls_notice":
        assert report["deferrals"][0]["code"] == expected
    elif expected:
        assert report["reason"] == expected
