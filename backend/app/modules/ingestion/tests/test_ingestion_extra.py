"""Offline ingestion boundaries: in-memory storage and fake HTTP/model transports only."""

import io
import json
import time
from email.message import Message
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, func, select

from app.core.config import Settings
from app.modules.collectors.data_go_kr import CollectionAPIError, CollectionTransportError
from app.modules.collectors.pages import CollectionPage
from app.modules.ingestion import models as m
from app.modules.ingestion import public as worker
from app.modules.ingestion import web
from app.modules.ingestion.repository import IngestionRepository
from app.modules.llm import public as llm
from app.modules.normalization.raw import normalize_record
from app.modules.pipeline.budget import BudgetExhausted
from app.modules.pipeline.public import processing_signature

DOMAINS = ["youth.seoul.go.kr", "www.nowon.kr"]
NOTICE_URL = "https://youth.seoul.go.kr/notice?id=123"
BODY = ("서울시가 청년의 생활 안정을 위해 주거 지원사업 참여자를 모집합니다. "
        "신청자는 만 19세 이상입니다.")
HTML = ("<html><head><meta property='article:published_time' "
        "content='2026-09-01'><meta property='article:modified_time' "
        "content='2026-09-12'></head><title>공식 주거 지원 공고</title>"
        "<nav>navigation</nav><main>" + BODY
        + "</main><footer>footer</footer><a href='/apply'>온라인 신청</a>"
        "<a href='/forms/application.pdf'>서식</a></html>").encode()


def forbidden(*args, **kwargs):
    raise AssertionError("An actual network, model or CLI call is forbidden in offline tests")


@pytest.fixture(autouse=True)
def offline_boundaries(monkeypatch):
    # Guards also catch an unintended call through the worker's default dependencies.
    for name in ("discover", "parse_policy", "fetch_notice", "fetch_gov24_page",
                 "fetch_bokjiro_page", "fetch_bokjiro_detail_page"):
        monkeypatch.setattr(worker, name, forbidden)
    monkeypatch.setattr(llm.subprocess, "Popen", forbidden)
    monkeypatch.setattr(web.socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(web.socket, "create_connection", forbidden)
    monkeypatch.setattr(worker, "available_memory_mb", lambda: 8192)
    monkeypatch.setattr(worker.shutil, "disk_usage", lambda _: SimpleNamespace(free=10 * 1024**3))


@pytest.fixture
def extra_store():
    engine = create_engine("sqlite://")
    m.metadata.create_all(engine)
    store = IngestionRepository(engine, allow_sqlite_for_tests=True)
    yield store
    engine.dispose()


def settings(**changes):
    return Settings(_env_file=None, **{
        "ingestion_http_interval_seconds": 0,
        "ingestion_min_available_memory_mb": 0,
        "ingestion_min_free_disk_mb": 0,
        **changes,
    })


def candidate(**changes):
    return {"url": NOTICE_URL, "title": "검색 후보 제목", "organization": "서울시",
            "reason": "지원사업 검색 후보", "evidence": "원문 확인이 필요한 검색 결과",
            "evidence_status": "uncertain", "region": None, "application_period": None,
            "source_kind": "official_notice", **changes}


def count(store, table):
    with store.engine.connect() as connection:
        return connection.scalar(select(func.count()).select_from(table))


class NoPolicyWrites:
    start_run = save_result = finish_run = staticmethod(forbidden)


def test_discovery_saves_only_candidates_and_does_not_fetch_notices(extra_store, tmp_path):
    calls = []

    def discover(conf, **kwargs):
        calls.append(kwargs)
        assert conf.codex_model == "gpt-5.6-luna"
        assert kwargs["domains"] == DOMAINS and kwargs["max_candidates"] == 10
        assert 10 <= kwargs["timeout"] <= 300
        return [candidate()], {"usage": [{"input_tokens": 10, "output_tokens": 5}],
                               "verified": False}

    conf = settings(ingestion_discovery_enabled=True, codex_timeout_seconds=900)
    first = worker.run_tick(conf, extra_store, NoPolicyWrites(), discovery_fn=discover,
                            notice_fetcher=forbidden, raw_root=tmp_path)
    saved = extra_store.list_candidates()
    assert first["discovery_candidates"] == 1
    assert first["model_calls"] == 1 and first["tokens"] == 15
    assert first["http_calls"] == 0 and first["jobs_completed"] == 0
    assert len(saved) == 1 and saved[0]["status"] == "needs_review"
    assert saved[0]["candidate_json"]["evidence_status"] == "uncertain"
    for table in (m.records, m.snapshots, m.jobs):
        assert count(extra_store, table) == 0
    # A second tick cannot automatically promote a stored candidate into a notice job.
    second = worker.run_tick(conf, extra_store, NoPolicyWrites(), discovery_fn=forbidden,
                             notice_fetcher=forbidden, raw_root=tmp_path)
    assert second["model_calls"] == second["http_calls"] == 0
    assert len(calls) == 1


@pytest.mark.parametrize("proposed,expected", [("서울시", "서울시"), ("검색모델이만든기관", "")])
def test_admitted_notice_uses_fetched_title_body_and_grounded_organization(
        extra_store, tmp_path, proposed, expected):
    extra_store.save_candidates([candidate(organization=proposed, region="추정 지역",
                                           application_period="추정 일정")], time.time())
    cid = extra_store.list_candidates()[0]["candidate_id"]
    extra_store.queue_candidate(cid, time.time())
    fetches = []
    notice_body = BODY + "\n신청 기간: 2026-10-01 ~ 2026-10-31"

    def fetch(url, domains, budget):
        fetches.append(url)
        assert domains == DOMAINS
        return {"title": "공식 원문 제목", "text": notice_body, "source_url": url,
                "attachment_status": "none_detected", "attachments": "[]"}, HTML

    report = worker.run_tick(settings(ingestion_max_jobs=1), extra_store, NoPolicyWrites(),
                             notice_fetcher=fetch, raw_root=tmp_path)
    with extra_store.engine.connect() as connection:
        record = connection.execute(select(m.records)).mappings().one()
        notice_job = connection.execute(select(m.jobs).where(
            m.jobs.c.kind == "notice")).mappings().one()
        parse_job = connection.execute(select(m.jobs).where(
            m.jobs.c.kind == "parse")).mappings().one()
    assert report["jobs_completed"] == 1 and report["model_calls"] == 0
    assert fetches == [NOTICE_URL]
    assert record["source_json"]["title"] == "공식 원문 제목"
    assert record["source_json"]["organization"] == expected
    assert record["source_json"]["fields"]["text"] == notice_body
    assert record["source_json"]["fields"]["application_period"] == (
        "신청 기간: 2026-10-01 ~ 2026-10-31")
    assert "추정 지역" not in json.dumps(record["source_json"], ensure_ascii=False)
    assert "추정 일정" not in json.dumps(record["source_json"], ensure_ascii=False)
    assert notice_job["status"] == "done" and parse_job["status"] == "pending"
    assert record["revision_id"] is None


@pytest.mark.parametrize("resource,reason", [
    ("memory", "low_available_memory"), ("disk", "low_free_disk"),
])
def test_low_resource_pause_preserves_pending_work_and_releases_lease(
        extra_store, tmp_path, monkeypatch, resource, reason):
    conf = settings(ingestion_min_available_memory_mb=1024, ingestion_min_free_disk_mb=1024,
                    data_go_kr_api_key="fake", ingestion_discovery_enabled=True)
    source = normalize_record({"서비스ID": "pending", "서비스명": "보류 공고", "지원대상": BODY})
    extra_store.observe_source(source, {}, processing_signature(conf), time.time(), 86400)
    disk_checks = []
    monkeypatch.setattr(worker, "available_memory_mb",
                        lambda: 511 if resource == "memory" else 2048)

    def disk_usage(path):
        disk_checks.append(path)
        return SimpleNamespace(free=(511 if resource == "disk" else 2048) * 1024**2)

    monkeypatch.setattr(worker.shutil, "disk_usage", disk_usage)
    raw_root = tmp_path / "not-created" / "raw"
    report = worker.run_tick(conf, extra_store, NoPolicyWrites(), raw_root=raw_root)
    assert report["status"] == "paused" and report["reason"] == reason
    assert report["http_calls"] == report["model_calls"] == report["jobs_completed"] == 0
    assert not raw_root.exists()
    with extra_store.engine.connect() as connection:
        job = connection.execute(select(m.jobs)).mappings().one()
        lease = connection.execute(select(m.state).where(
            m.state.c.state_key == "worker")).mappings().one()
    assert job["status"] == "pending" and job["attempts"] == 0
    assert lease["lease_token"] is None and lease["lease_until"] == 0
    assert disk_checks == ([] if resource == "memory" else [tmp_path])


@pytest.mark.parametrize("fault", ["daily_quota", "provider_api_fault"])
def test_gov24_quota_or_account_fault_does_not_starve_bokjiro(
        extra_store, tmp_path, fault):
    calls = {"gov24": 0, "bokjiro": 0}

    def gov24(**kwargs):
        calls["gov24"] += 1
        if fault == "daily_quota":
            pytest.fail("A provider with a zero daily budget must not make a request")
        raise CollectionAPIError("gov24_api_quota", retryable=False)

    def bokjiro(**kwargs):
        calls["bokjiro"] += 1
        return CollectionPage([], kwargs["page"], kwargs["per_page"], 0, b"empty-offline-page")

    conf = settings(data_go_kr_api_key="fake", bokjiro_api_key="fake",
                    ingestion_daily_gov24_calls=0 if fault == "daily_quota" else 5,
                    ingestion_page_size=1, ingestion_max_pages=3)
    report = worker.run_tick(conf, extra_store, NoPolicyWrites(),
        adapters={"gov24": gov24, "bokjiro": bokjiro}, raw_root=tmp_path)
    assert report["status"] == "completed" and report["pages"] == 1
    assert calls["bokjiro"] == 1
    assert calls["gov24"] == (0 if fault == "daily_quota" else 1)
    assert extra_store.get_state("scan:bokjiro:list")["scan_complete"] is True
    assert "scan:gov24:serviceDetail" in {error["source"] for error in report["errors"]}
    assert report["http_calls"] == (1 if fault == "daily_quota" else 2)
    if fault == "provider_api_fault":
        assert extra_store.get_state("blocked:gov24")["reason"] == "gov24_api_quota"


def test_bokjiro_detail_daily_quota_does_not_stop_gov24_scan(extra_store, tmp_path):
    with extra_store.engine.begin() as connection:
        extra_store.observe_listing(connection, "bokjiro", {"servId": "blocked-detail",
            "servNm": "복지 후보"}, time.time(), 86400)
    calls = []

    def gov24(**kwargs):
        calls.append(kwargs["endpoint"])
        rows = [{"서비스ID": "available", "서비스명": "정상 공급자 공고", "지원대상": BODY}]
        return CollectionPage(rows, kwargs["page"], kwargs["per_page"], 1, b"fake-gov24")

    conf = settings(data_go_kr_api_key="fake", ingestion_daily_bokjiro_calls=0,
                    ingestion_max_jobs=1, ingestion_max_pages=1, ingestion_page_size=1)
    report = worker.run_tick(conf, extra_store, NoPolicyWrites(),
        adapters={"gov24": gov24, "bokjiro_detail": forbidden}, raw_root=tmp_path)
    assert calls == ["serviceDetail"] and report["pages"] == report["new"] == 1
    assert report["status"] == "completed" and report["http_calls"] == 1
    with extra_store.engine.connect() as connection:
        detail = connection.execute(select(m.jobs).where(
            m.jobs.c.kind == "detail")).mappings().one()
    assert detail["status"] == "pending" and detail["attempts"] == 0
    assert detail["error_code"] == "daily_calls_bokjiro"


def test_provider_page_size_mismatch_is_reported_without_saving_rows(extra_store, tmp_path):
    def clamped(**kwargs):
        return CollectionPage([{"servId": "synthetic"}], kwargs["page"], 1, 10, b"fake-page")

    report = worker.run_tick(settings(bokjiro_api_key="fake", ingestion_page_size=2),
        extra_store, NoPolicyWrites(), adapters={"bokjiro": clamped}, raw_root=tmp_path)
    assert report["pages"] == 0
    assert report["errors"] == [
        {"source": "scan:bokjiro:list", "code": "page_size_mismatch"}]
    cursor = extra_store.get_state("scan:bokjiro:list")
    assert cursor.get("page", 1) == 1
    assert cursor["per_page"] == 2 and cursor["error_code"] == "page_size_mismatch"
    for table in (m.records, m.snapshots, m.jobs):
        assert count(extra_store, table) == 0


class FakeResponse:
    def __init__(self, status=200, *, body=HTML, location=None, content_type="text/html",
                 headers=None):
        self.status = status
        self.headers = Message()
        self.headers["Content-Type"] = content_type + "; charset=utf-8"
        if location is not None:
            self.headers["Location"] = location
        for key, value in (headers or {}).items():
            self.headers[key] = value
        self.body = io.BytesIO(body)

    def getheader(self, key, default=None):
        return self.headers.get(key, default)

    def read1(self, amount):
        return self.body.read(amount)


class FakeHttpBudget:
    def __init__(self, *, max_calls=10, max_bytes=4096):
        self.calls = 0
        self.max_calls = max_calls
        self.max_bytes = max_bytes

    def before(self, provider):
        assert provider == "notice"
        if self.calls >= self.max_calls:
            raise BudgetExhausted("daily_calls_notice")
        self.calls += 1
        return {"timeout": 2, "deadline": time.monotonic() + 30,
                "max_response_bytes": self.max_bytes}


@pytest.fixture
def fake_web(monkeypatch):
    state = SimpleNamespace(responses=[], connections=[], dns=[], requests=[], closed=[],
                            production_resolver=web.resolve_public)

    def resolve(host, port, timeout):
        state.dns.append((host, port))
        assert timeout > 0
        return "8.8.8.8"

    class Connection:
        def __init__(self, host, address, timeout):
            state.connections.append((host, address))
            assert address == "8.8.8.8" and timeout > 0
            self.host = host
            self.sock = SimpleNamespace(settimeout=lambda _: None)

        def request(self, method, path, headers):
            state.requests.append((self.host, method, path))
            assert headers["Accept-Encoding"] == "identity"

        def getresponse(self):
            return state.responses.pop(0)

        def close(self):
            state.closed.append(self.host)

    monkeypatch.setattr(web, "resolve_public", resolve)
    monkeypatch.setattr(web, "PinnedHTTPSConnection", Connection)
    return state


def test_safe_redirect_rechecks_dns_and_budget_and_only_extracts_body(fake_web):
    fake_web.responses = [FakeResponse(302, location="https://www.nowon.kr/notice?nttId=7"),
                          FakeResponse()]
    budget = FakeHttpBudget()
    result, raw = web.fetch_notice(NOTICE_URL, DOMAINS, budget)
    assert budget.calls == 2
    assert fake_web.dns == [("youth.seoul.go.kr", 443), ("www.nowon.kr", 443)]
    assert len(fake_web.connections) == len(fake_web.closed) == 2
    assert result["source_url"] == "https://www.nowon.kr/notice?nttId=7"
    assert result["text"] == BODY and raw == HTML
    assert result["attachment_status"] == "not_parsed"
    assert json.loads(result["attachments"]) == ["https://www.nowon.kr/forms/application.pdf"]
    assert json.loads(result["links"]) == [
        {"label": "온라인 신청", "url": "https://www.nowon.kr/apply"},
        {"label": "서식", "url": "https://www.nowon.kr/forms/application.pdf"},
    ]
    assert result["published_date"] == "2026-09-01"
    assert result["modified_date"] == "2026-09-12"
    # The attachment is retained as unresolved source metadata; no third request occurs.
    assert len(fake_web.requests) == 2


def test_notice_preserves_conflicting_published_metadata_for_review(fake_web):
    html = (HTML.decode().replace(
        "content='2026-09-01'>",
        "content='2026-09-01'><meta name='publishdate' content='2026-09-02'>"
    )).encode()
    fake_web.responses = [FakeResponse(body=html)]
    result, _ = web.fetch_notice(NOTICE_URL, DOMAINS, FakeHttpBudget())
    assert json.loads(result["published_date"]) == ["2026-09-01", "2026-09-02"]


@pytest.mark.parametrize("location", [
    "https://evil.com/private", "https://127.0.0.1/admin", "http://www.nowon.kr/plain",
])
def test_redirect_rejects_other_hosts_private_ip_and_https_downgrade(fake_web, location):
    fake_web.responses = [FakeResponse(302, location=location)]
    budget = FakeHttpBudget()
    with pytest.raises((ValueError, CollectionTransportError)):
        web.fetch_notice(NOTICE_URL, DOMAINS, budget)
    assert budget.calls == 1
    assert fake_web.dns == [("youth.seoul.go.kr", 443)]
    assert len(fake_web.requests) == len(fake_web.closed) == 1


def test_redirect_budget_exhaustion_blocks_second_dns_and_connection(fake_web):
    fake_web.responses = [FakeResponse(302, location="https://www.nowon.kr/notice")]
    budget = FakeHttpBudget(max_calls=1)
    with pytest.raises(BudgetExhausted, match="daily_calls_notice"):
        web.fetch_notice(NOTICE_URL, DOMAINS, budget)
    assert budget.calls == 1 and len(fake_web.dns) == len(fake_web.connections) == 1
    assert fake_web.closed == ["youth.seoul.go.kr"]


def test_redirect_dns_private_rebinding_is_rejected_before_second_connection(
        fake_web, monkeypatch):
    state = []

    def addresses(host, port, **kwargs):
        state.append(host)
        address = "8.8.8.8" if host == "youth.seoul.go.kr" else "10.0.0.7"
        return [(2, 1, 6, "", (address, port))]

    monkeypatch.setattr(web.socket, "getaddrinfo", addresses)
    monkeypatch.setattr(web, "resolve_public", fake_web.production_resolver)
    fake_web.responses = [FakeResponse(302, location="https://www.nowon.kr/notice")]
    budget = FakeHttpBudget()
    with pytest.raises(CollectionTransportError, match="private_address"):
        web.fetch_notice(NOTICE_URL, DOMAINS, budget)
    assert state == ["youth.seoul.go.kr", "www.nowon.kr"] and budget.calls == 2
    assert fake_web.connections == [("youth.seoul.go.kr", "8.8.8.8")]
    assert fake_web.closed == ["youth.seoul.go.kr"]


@pytest.mark.parametrize("response,max_bytes,code", [
    (FakeResponse(body=b"x" * 17), 16, "response_too_large"),
    (FakeResponse(headers={"Content-Encoding": "gzip"}), 4096, "compression_unsupported"),
    (FakeResponse(content_type="application/pdf"), 4096, "attachment_requires_adapter"),
    (FakeResponse(429, headers={"Retry-After": "30"}), 4096, "http_429"),
])
def test_notice_response_limits_and_unsupported_attachments_close_connection(
        fake_web, response, max_bytes, code):
    fake_web.responses = [response]
    with pytest.raises(CollectionTransportError, match=code) as caught:
        web.fetch_notice(NOTICE_URL, DOMAINS, FakeHttpBudget(max_bytes=max_bytes))
    assert fake_web.closed == ["youth.seoul.go.kr"]
    if code == "http_429":
        assert caught.value.retryable is True and caught.value.retry_after_seconds == 30


@pytest.mark.parametrize("tls_failure", [False, True])
def test_pinned_https_connects_to_checked_ip_and_validates_original_hostname(
        monkeypatch, tls_failure):
    connections, wrapped, closed = [], [], []
    sock = SimpleNamespace(close=lambda: closed.append(True))

    def connect(address, timeout):
        connections.append((address, timeout))
        return sock

    def wrap(value, *, server_hostname):
        wrapped.append((value, server_hostname))
        if tls_failure:
            raise web.ssl.SSLError("offline certificate verification failure")
        return "verified-tls-socket"

    monkeypatch.setattr(web.socket, "create_connection", connect)
    connection = object.__new__(web.PinnedHTTPSConnection)
    connection.address, connection.port = "8.8.8.8", 443
    connection.timeout, connection.host = 2, "youth.seoul.go.kr"
    connection._context = SimpleNamespace(wrap_socket=wrap)
    if tls_failure:
        with pytest.raises(web.ssl.SSLError):
            connection.connect()
        assert closed == [True]
    else:
        connection.connect()
        assert connection.sock == "verified-tls-socket" and closed == []
    assert connections == [(("8.8.8.8", 443), 2)]
    assert wrapped == [(sock, "youth.seoul.go.kr")]


def test_stalled_dns_stops_before_any_connection(monkeypatch):
    starts = []

    class StalledThread:
        def __init__(self, *, target, daemon):
            assert daemon is True

        def start(self):
            starts.append(True)

    # The resolver thread is simulated rather than hanging an actual lookup.
    monkeypatch.setattr(web.threading, "Thread", StalledThread)
    with pytest.raises(CollectionTransportError, match="notice_dns_timeout") as caught:
        web.resolve_public("youth.seoul.go.kr", 443, timeout=0)
    assert caught.value.retryable is True and starts == [True]
