"""Public cache correctness, revocation, concurrency and member isolation."""

import hashlib
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from sqlalchemy import event, update
from sqlalchemy.exc import OperationalError

from app.modules.ingestion.models import records as collection_records
from app.modules.storage import catalog, explorer_filters
from app.modules.storage.catalog_cache import PublicCatalogCache
from tests import test_smart_search as search_tests

repository = search_tests.repository
paired_catalog = search_tests.paired_catalog


@pytest.mark.parametrize("parameters", [
    {}, {"q": "장학금"}, {"q": "광운대 장학금"},
    {"q": "장학금", "search_mode": "literal"},
    {"sort": "name", "limit": 2, "offset": 1},
    {"status": "open", "age_bands": ["19-24"]}, {"category": "교육"},
])
def test_cached_snapshot_and_results_match_existing_catalog(paired_catalog, parameters):
    expected = catalog.list_policies(paired_catalog, **parameters)
    paired_catalog.catalog_cache = PublicCatalogCache()
    assert catalog.list_policies(paired_catalog, **parameters) == expected
    assert catalog.list_policies(paired_catalog, **parameters) == expected
    expected_detail = catalog.get_policy(paired_catalog, "publisher-repost")
    returned = catalog.get_policy(paired_catalog, "publisher-repost")
    returned["sourceFields"]["text"] = "caller modification"
    assert catalog.get_policy(paired_catalog, "publisher-repost") == expected_detail


def test_withdrawal_immediately_invalidates_list_detail_and_options(repository):
    search_tests.add_notice(repository, "first", title="청년 지원")
    repository.catalog_cache = PublicCatalogCache()
    assert catalog.list_policies(repository)["total"] == 1
    assert catalog.get_policy(repository, "first") is not None
    assert catalog.explorer_options(repository)["providers"]
    with repository.engine.begin() as connection:
        connection.execute(update(repository.tables["condition_documents"]).values(
            review_status="reviewed"))
    assert catalog.list_policies(repository)["total"] == 0
    assert catalog.get_policy(repository, "first") is None
    assert catalog.explorer_options(repository)["providers"] == []


def test_new_immutable_revision_replaces_cached_card(repository):
    search_tests.add_notice(repository, "first", title="이전 공고")
    repository.catalog_cache = PublicCatalogCache()
    assert catalog.list_policies(repository)["items"][0]["title"] == "이전 공고"
    search_tests.add_notice(repository, "first", title="수정된 공고", day=2,
                            revision="second-revision")
    assert catalog.list_policies(repository)["items"][0]["title"] == "수정된 공고"
    assert catalog.get_policy(repository, "first")["revisionId"] == "second-revision"


def test_listing_refresh_invalidates_popularity_without_revision(repository):
    search_tests.add_notice(repository, "gov24:first", title="첫 공고")
    search_tests.add_notice(repository, "gov24:second", title="둘째 공고")
    search_tests.add_views(repository, "gov24:first", 10)
    search_tests.add_views(repository, "gov24:second", 20)
    with repository.engine.connect() as connection:
        connection.connection.driver_connection.create_function(
            "sha2", 2, lambda value, _: hashlib.sha256(value.encode()).hexdigest()
            if value is not None else None)
    repository.catalog_cache = PublicCatalogCache()
    assert catalog.list_policies(repository)["items"][0]["id"] == "gov24:second"
    with repository.engine.begin() as connection:
        connection.execute(update(collection_records).where(
            collection_records.c.policy_key == "gov24:first"
        ).values(listing_json={"조회수": 100}))
    assert catalog.list_policies(repository)["items"][0]["id"] == "gov24:first"


def test_db_check_failure_never_serves_cached_public_data(repository, monkeypatch):
    search_tests.add_notice(repository, "first", title="공개 공고")
    repository.catalog_cache = PublicCatalogCache()
    catalog.list_policies(repository)

    def unavailable(*_):
        raise OperationalError("SELECT", {}, RuntimeError("database unavailable"))

    monkeypatch.setattr(repository.catalog_cache, "publication_token", unavailable)
    with pytest.raises(OperationalError):
        catalog.list_policies(repository)


def test_member_filter_results_are_never_shared(repository, monkeypatch):
    search_tests.add_notice(repository, "first", title="공개 공고")
    repository.catalog_cache = PublicCatalogCache()

    def eligibility(records, *, member, **_):
        return records if member["id"] == "allowed" else []

    monkeypatch.setattr(explorer_filters, "filter_records", eligibility)
    allowed = catalog.list_policies(repository, eligible_only=True, member={"id": "allowed"})
    denied = catalog.list_policies(repository, eligible_only=True, member={"id": "denied"})
    assert allowed["total"] == 1 and denied["total"] == 0
    assert not repository.catalog_cache.entries


def test_different_queries_reuse_json_snapshot(repository):
    search_tests.add_notice(repository, "first", title="청년 주거 지원")
    repository.catalog_cache = PublicCatalogCache()
    json_transfers = []

    def capture(_connection, _cursor, _statement, _parameters, context, _many):
        selected = getattr(getattr(context, "compiled", None), "statement", None)
        columns = getattr(selected, "selected_columns", ())
        if any(column.key == "source_json" for column in columns):
            json_transfers.append(True)

    event.listen(repository.engine, "after_cursor_execute", capture)
    catalog.list_policies(repository, q="청년")
    first = len(json_transfers)
    assert first == 1
    catalog.list_policies(repository, q="주거")
    assert len(json_transfers) == first


def test_search_ranking_runs_after_db_connection_is_returned(repository, monkeypatch):
    search_tests.add_notice(repository, "first", title="청년 주거 지원")
    repository.catalog_cache = PublicCatalogCache()
    checked_out = [0]
    original = catalog.search_records

    def checkout(*_):
        checked_out[0] += 1

    def checkin(*_):
        checked_out[0] -= 1

    event.listen(repository.engine, "checkout", checkout)
    event.listen(repository.engine, "checkin", checkin)

    def rank(*args, **kwargs):
        assert checked_out[0] == 0
        return original(*args, **kwargs)

    monkeypatch.setattr(catalog, "search_records", rank)
    assert catalog.list_policies(repository, q="청년")["total"] == 1


def test_concurrent_miss_computes_once_and_returns_independent_responses():
    cache = PublicCatalogCache()
    entered, release = Event(), Event()
    calls = []

    def compute():
        calls.append(True)
        entered.set()
        assert release.wait(3)
        return {"items": [{"id": "first"}]}

    with ThreadPoolExecutor(max_workers=8) as workers:
        futures = [workers.submit(cache.get_or_compute, "v1", "list", compute)
                   for _ in range(8)]
        assert entered.wait(3)
        release.set()
        results = [future.result(timeout=3) for future in futures]
    assert len(calls) == 1
    results[0]["items"][0]["id"] = "changed"
    assert all(result["items"][0]["id"] == "first" for result in results[1:])


def test_ttl_and_lru_bound_retained_results():
    now = [0]
    cache = PublicCatalogCache(ttl_seconds=5, max_entries=2, max_bytes=100,
                               clock=lambda: now[0])
    for key in ["a", "b", "c"]:
        cache.get_or_compute("v1", key, lambda: {"items": []})
    assert list(cache.entries) == ["b", "c"]
    now[0] = 6
    assert cache.get_or_compute("v1", "c", lambda: {"updated": True}) == {"updated": True}
    cache.get_or_compute("v2", "d", lambda: {"items": []})
    assert list(cache.entries) == ["d"]
    assert cache.bytes <= 100
