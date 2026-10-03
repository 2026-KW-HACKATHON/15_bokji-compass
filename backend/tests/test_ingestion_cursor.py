"""Page-size changes and stale revision pointers use only in-memory SQLite."""

import pytest
from sqlalchemy import create_engine, select, update

from app.modules.collectors.pages import CollectionPage
from app.modules.ingestion import models as m
from app.modules.ingestion.identity import content_hash
from app.modules.ingestion.repository import IngestionRepository, LeaseLost, PageSizeMismatch
from app.modules.normalization.raw import normalize_record


@pytest.fixture
def store():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    m.metadata.create_all(engine)
    repository = IngestionRepository(engine, allow_sqlite_for_tests=True)
    assert repository.acquire_worker("worker", 100, 1000)
    yield repository
    engine.dispose()


def test_changed_page_size_restarts_incomplete_scan_and_removes_old_hash(store):
    store.set_state("scan", {"page": 3, "per_page": 50, "page_hash": "old-page",
                             "next_due_at": 999, "last_success_at": 100})
    same = store.prepare_scan("scan", 50, 110, worker_token="worker")
    assert same["page"] == 3 and same["page_hash"] == "old-page"
    resized = store.prepare_scan("scan", 20, 110, worker_token="worker")
    assert resized["page"] == 1 and resized["per_page"] == 20
    assert resized["page_hash"] is None and resized["next_due_at"] == 0
    assert resized["last_success_at"] == 100
    assert store.get_state("scan") == resized


def test_legacy_incomplete_cursor_without_page_size_restarts(store):
    store.set_state("scan", {"page": 2, "page_hash": "old-page"})
    assert store.prepare_scan("scan", 20, 110, worker_token="worker")["page"] == 1


def test_first_page_size_change_keeps_normal_scan_interval(store):
    store.set_state("scan", {"page": 1, "per_page": 50, "next_due_at": 999})
    prepared = store.prepare_scan("scan", 20, 110, worker_token="worker")
    assert prepared["page"] == 1 and prepared["next_due_at"] == 999


def test_save_page_records_size_and_resize_starts_at_first_page(store):
    store.prepare_scan("scan", 2, 110, worker_token="worker")
    first = CollectionPage([{"id": "a"}, {"id": "b"}], 1, 2, 8, b"synthetic")
    store.save_page("scan", first, 110, 600, lambda c, rows: rows, worker_token="worker")
    assert store.get_state("scan")["page"] == 2
    assert store.get_state("scan")["per_page"] == 2
    store.prepare_scan("scan", 3, 111, worker_token="worker")
    resized = CollectionPage([{"id": "a"}, {"id": "b"}, {"id": "c"}], 1, 3, 8, b"synthetic")
    store.save_page("scan", resized, 111, 600, lambda c, rows: rows, worker_token="worker")
    assert store.get_state("scan")["page"] == 2
    assert store.get_state("scan")["per_page"] == 3


def test_response_page_size_mismatch_leaves_cursor_and_rows_untouched(store):
    prepared = store.prepare_scan("scan", 50, 110, worker_token="worker")
    called = []
    clamped = CollectionPage([{"id": "a"}], 1, 10, 100, b"synthetic")
    with pytest.raises(PageSizeMismatch, match="prepared scan") as caught:
        store.save_page("scan", clamped, 110, 600,
                        lambda c, rows: called.append(rows), worker_token="worker")
    assert caught.value.code == "page_size_mismatch"
    assert called == [] and store.get_state("scan") == prepared


def test_scan_preparation_rejects_expired_worker_without_resetting_cursor(store):
    store.set_state("scan", {"page": 3, "per_page": 50})
    with pytest.raises(LeaseLost):
        store.prepare_scan("scan", 20, 1101, worker_token="worker")
    assert store.get_state("scan") == {"page": 3, "per_page": 50}


def test_changed_content_clears_previous_revision_and_known_reversion_reuses_it(store):
    row = {"서비스ID": "synthetic", "서비스명": "합성 공고", "지원대상": "청년"}
    original = normalize_record(row)
    store.observe_source(original, row, {"hash": "signature"}, 110, 600)
    with store.engine.begin() as c:
        c.execute(update(m.records).values(revision_id="previous-revision"))
        c.execute(update(m.jobs).values(status="done", revision_id="previous-revision"))
    changed_row = {**row, "지원대상": "청년 및 어르신"}
    changed = normalize_record(changed_row)
    store.observe_source(changed, changed_row, {"hash": "signature"}, 111, 600)
    with store.engine.connect() as c:
        current = c.execute(select(m.records)).mappings().one()
        assert current["revision_id"] is None and current["content_hash"] == content_hash(changed)
    store.observe_source(original, row, {"hash": "signature"}, 112, 600)
    with store.engine.connect() as c:
        current = c.execute(select(m.records)).mappings().one()
        assert current["revision_id"] == "previous-revision"
        assert current["content_hash"] == content_hash(original)
