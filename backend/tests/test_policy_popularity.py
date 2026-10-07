"""Provider views use current listings and do not create policy revisions or model work."""

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, func, insert, select, update
from sqlalchemy.exc import OperationalError

from app.modules.ingestion import models
from app.modules.ingestion.identity import content_hash, listing_hash
from app.modules.ingestion.popularity import MAX_SAFE_INTEGER
from app.modules.ingestion.public import load_popularity
from app.modules.ingestion.repository import IngestionRepository
from app.modules.normalization.raw import normalize_record


@pytest.fixture
def store():
    engine = create_engine("sqlite://")
    models.metadata.create_all(engine)
    repository = IngestionRepository(engine, allow_sqlite_for_tests=True)
    yield repository
    engine.dispose()


def add_listing(store, provider, listing, *, identity="01", last_seen_at=1):
    key = f"{provider}:{identity}"
    with store.engine.begin() as connection:
        connection.execute(insert(models.records).values(
            policy_key=key, provider=provider, external_id=identity,
            listing_json=listing, last_seen_at=last_seen_at, next_check_at=0,
        ))
    return key


@pytest.mark.parametrize("provider, field", [("gov24", "조회수"), ("bokjiro", "inqNum")])
@pytest.mark.parametrize("value, expected", [
    (0, 0), (1234, 1234), (MAX_SAFE_INTEGER, MAX_SAFE_INTEGER),
    ("0", 0), (" 1234 ", 1234), ("1,234,567", 1234567),
    ("9,007,199,254,740,991", MAX_SAFE_INTEGER),
])
def test_valid_source_counts(store, provider, field, value, expected):
    observed = datetime(2026, 10, 7, 1, 2, 3, tzinfo=UTC)
    key = add_listing(store, provider, {field: value, "_views_observed_at": observed.timestamp()})
    assert load_popularity(store, [key]) == {key: {
        "views": expected, "source": provider, "basis": "provider_cumulative_views",
        "asOf": observed.isoformat(),
    }}


@pytest.mark.parametrize("value", [
    True, False, -1, 1.0, MAX_SAFE_INTEGER + 1, None, [], {},
    "", "-1", "+1", "1.0", "1e3", "1,23", "12,34,567", "0,123",
    "1 234", "NaN", "１２３", "9,007,199,254,740,992", "1" * 100,
])
def test_invalid_source_counts_are_omitted(store, value):
    key = add_listing(store, "gov24", {"조회수": value})
    assert load_popularity(store, [key]) == {}


def test_optional_table_absent_and_empty_request():
    engine = create_engine("sqlite://")
    try:
        assert load_popularity(SimpleNamespace(engine=engine), ["gov24:01"]) == {}
    finally:
        engine.dispose()
    assert load_popularity(SimpleNamespace(engine=Mock()), []) == {}


def test_database_connection_failure_propagates():
    engine = Mock()
    engine.connect.side_effect = OperationalError("connect", {}, Exception("unavailable"))
    with pytest.raises(OperationalError):
        load_popularity(SimpleNamespace(engine=engine), ["gov24:01"])


def test_load_only_requested_supported_listings(store):
    selected = add_listing(store, "gov24", {"조회수": 42})
    add_listing(store, "gov24", {"조회수": 84}, identity="02")
    unsupported = add_listing(store, "notice", {"조회수": 9000})
    malformed = add_listing(store, "bokjiro", [123])
    assert load_popularity(store, [selected, selected, unsupported, malformed]) == {selected: {
        "views": 42, "source": "gov24", "basis": "provider_cumulative_views", "asOf": None,
    }}


@pytest.mark.parametrize("timestamp", [None, True, -1, "2026-10-07", float("inf"), 10**100])
def test_as_of_never_uses_unrelated_record_observation(store, timestamp):
    key = add_listing(store, "gov24", {"조회수": 1, "_views_observed_at": timestamp},
                      last_seen_at=datetime(2026, 10, 7, tzinfo=UTC).timestamp())
    assert load_popularity(store, [key])[key]["asOf"] is None


def test_listing_refresh_keeps_content_identity_and_existing_work(store):
    first = {"servId": "01", "servNm": "서비스", "inqNum": "100"}
    original = deepcopy(first)
    detail = {"servId": "01", "servNm": "서비스", "tgtrDtlCn": "전 국민"}
    source = normalize_record(detail)
    with store.engine.begin() as connection:
        store.observe_listing(connection, "bokjiro", first, 1000, 3600)
    store.observe_source(source, detail, {"hash": "v1"}, 1000, 3600)
    with store.engine.connect() as connection:
        initial = connection.execute(select(models.records)).mappings().one()
        job_count = connection.scalar(select(func.count()).select_from(models.jobs))
    second = {**first, "inqNum": "150"}
    with store.engine.begin() as connection:
        assert store.observe_listing(connection, "bokjiro", second, 1060, 3600) == 0
        # A later detail/condition observation must not alter the count's observation time.
        connection.execute(update(models.records).values(last_seen_at=2000))
    with store.engine.connect() as connection:
        refreshed = connection.execute(select(models.records)).mappings().one()
        assert connection.scalar(select(func.count()).select_from(models.jobs)) == job_count
    assert first == original
    assert second == {**original, "inqNum": "150"}
    assert initial["listing_hash"] == refreshed["listing_hash"] == listing_hash(first)
    assert listing_hash(refreshed["listing_json"]) == listing_hash(first)
    assert initial["content_hash"] == refreshed["content_hash"] == content_hash(source)
    assert initial["source_json"] == refreshed["source_json"]
    assert load_popularity(store, ["bokjiro:01"])["bokjiro:01"] == {
        "views": 150, "source": "bokjiro", "basis": "provider_cumulative_views",
        "asOf": datetime.fromtimestamp(1060, UTC).isoformat(),
    }
