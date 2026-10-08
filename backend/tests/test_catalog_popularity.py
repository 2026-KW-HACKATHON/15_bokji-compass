"""Entire catalog views are ordered before pagination, using optional stored signals."""

import json
import os
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    create_engine,
    event,
    insert,
    select,
    text,
    update,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.pool import StaticPool

from app.api.policies import get_repository
from app.core.config import Settings, load_settings
from app.core.database import create_database_engine
from app.main import create_app
from app.modules.ingestion import models
from app.modules.ingestion.popularity import (
    MAX_SAFE_INTEGER,
    listing_popularity,
    view_count_expression,
)
from app.modules.storage import catalog


@pytest.fixture
def repository():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def register_mysql_functions(connection, _):
        connection.create_function("json_unquote", 1, lambda value: value)
        connection.create_function("concat", -1,
                                   lambda *values: "".join(str(value) for value in values))

    metadata = MetaData()
    documents = Table("condition_documents", metadata,
        Column("revision_id", String, primary_key=True),
        Column("policy_key", String, nullable=False),
        Column("created_at", DateTime, nullable=False),
        Column("source_json", JSON, nullable=False),
        Column("review_status", String, nullable=False))
    details = Table("policy_revision_details", metadata,
        Column("revision_id", String, primary_key=True),
        Column("draft_json", JSON, nullable=False),
        Column("title", String, nullable=False), Column("category", String))
    metadata.create_all(engine)
    yield SimpleNamespace(engine=engine, tables={
        "condition_documents": documents, "policy_revision_details": details})
    engine.dispose()


def add_policy(repository, key, *, day=1, title=None, category="주거",
               revision=None, published=True, fields=None):
    revision = revision or key + "-revision"
    source = {"title": title or key, "organization": "테스트 기관", "source_url": None,
              "fields": {"application_period": "2026-10-01 ~ 2026-10-31", **(fields or {})}}
    with repository.engine.begin() as connection:
        connection.execute(insert(repository.tables["condition_documents"]).values(
            revision_id=revision, policy_key=key, created_at=datetime(2026, 10, day),
            source_json=source, review_status="published" if published else "draft"))
        connection.execute(insert(repository.tables["policy_revision_details"]).values(
            revision_id=revision, title=source["title"], category=category,
            draft_json={"overview": {
                "region_conditions": {"status": "unrestricted", "text": "전국"},
                "age_conditions": {"status": "specified", "text": "청년"}}}))


def add_listing(repository, key, value, *, provider="gov24"):
    models.records.create(repository.engine, checkfirst=True)
    field = "조회수" if provider == "gov24" else "inqNum"
    with repository.engine.begin() as connection:
        connection.execute(insert(models.records).values(
            policy_key=key, provider=provider, external_id=key,
            listing_json={field: value, "_views_observed_at": 1791334923},
            last_seen_at=1, next_check_at=0))


def ids(result):
    return [item["id"] for item in result["items"]]


def test_global_popularity_order_zero_unknown_ties_and_pages(repository):
    # The old popular policy must win even when a newer page would exclude it.
    for key, day, views in [("old-popular", 1, "12,345"), ("tie-a", 3, 50),
                            ("tie-b", 3, "50"), ("tie-old", 2, 50),
                            ("zero", 1, 0), ("unknown", 7, None)]:
        add_policy(repository, key, day=day)
        if views is not None:
            add_listing(repository, key, views)
    expected = ["old-popular", "tie-a", "tie-b", "tie-old", "zero", "unknown"]
    pages = [catalog.list_policies(repository, limit=2, offset=offset)
             for offset in (0, 2, 4)]
    assert [key for page in pages for key in ids(page)] == expected
    assert [page["total"] for page in pages] == [6, 6, 6]
    assert [page["nextCursor"] for page in pages] == ["2", "4", None]
    assert pages[0]["items"][0]["popularity"] == {
        "views": 12345, "source": "gov24", "basis": "provider_cumulative_views",
        "asOf": datetime.fromtimestamp(1791334923, UTC).isoformat()}
    assert pages[2]["items"][0]["popularity"]["views"] == 0
    assert pages[2]["items"][1]["popularity"] is None
    assert ids(catalog.list_policies(repository, sort="recent"))[0] == "unknown"
    assert ids(catalog.list_policies(repository, sort="name")) == sorted(expected)


def test_filters_and_latest_publication_apply_before_popularity_pagination(repository):
    add_policy(repository, "farm", title="지원 농업 자금", category="생활·금융")
    add_policy(repository, "farm", title="지원 농업 자금 공개 개정", day=2,
               revision="farm-published-2", category="생활·금융")
    add_policy(repository, "farm", title="숨겨진 새 농업 초안", day=7,
               revision="farm-hidden", published=False, category="생활·금융")
    add_policy(repository, "farm-low", title="지원 축산 보조금", category="생활·금융")
    add_policy(repository, "business", title="지원 창업 자금", category="생활·금융")
    add_policy(repository, "hidden", title="지원 농업 비공개", published=False)
    for key, views in [("farm", 100), ("farm-low", 5), ("business", 10000),
                        ("hidden", 999999)]:
        add_listing(repository, key, views)
    filters = {"category": "농림축산·어업", "q": "지원", "region": "서울", "audience": "청년"}
    first = catalog.list_policies(repository, limit=1, **filters)
    second = catalog.list_policies(repository, limit=1, offset=1, **filters)
    assert first["total"] == second["total"] == 2
    assert ids(first) == ["farm"] and ids(second) == ["farm-low"]
    assert first["items"][0]["revisionId"] == "farm-published-2"
    assert first["items"][0]["category"] == "농림축산·어업"
    assert ids(catalog.list_policies(repository, tag="농림축산·어업")) == ["farm", "farm-low"]
    assert ids(catalog.list_policies(repository, category="사업·창업")) == ["business"]
    assert catalog.get_policy(repository, "hidden") is None


def test_old_schema_without_collection_records_retains_recent_fallback(repository):
    add_policy(repository, "old", day=1)
    add_policy(repository, "new", day=2)
    result = catalog.list_policies(repository, limit=1)
    assert ids(result) == ["new"] and result["total"] == 2
    assert result["items"][0]["popularity"] is None
    assert catalog.get_policy(repository, "old")["popularity"] is None
    assert catalog.list_calendar(repository, month="2026-10")["total"] == 2


def test_refreshed_listing_changes_order_and_detail_without_new_revision(repository):
    add_policy(repository, "gov24:one")
    add_policy(repository, "bokjiro:two")
    add_listing(repository, "gov24:one", 100)
    add_listing(repository, "bokjiro:two", "90", provider="bokjiro")
    assert ids(catalog.list_policies(repository)) == ["gov24:one", "bokjiro:two"]
    with repository.engine.begin() as connection:
        connection.execute(update(models.records).where(
            models.records.c.policy_key == "bokjiro:two").values(listing_json={"inqNum": 101}))
    assert ids(catalog.list_policies(repository)) == ["bokjiro:two", "gov24:one"]
    detail = catalog.get_policy(repository, "bokjiro:two")
    assert detail["revisionId"] == "bokjiro:two-revision"
    assert detail["popularity"] == {"views": 101, "source": "bokjiro",
                                    "basis": "provider_cumulative_views", "asOf": None}
    assert all(item["popularity"] is not None
               for item in catalog.list_calendar(repository, month="2026-10")["items"])


@pytest.mark.parametrize("value", [
    0, 1234, MAX_SAFE_INTEGER, "0", "000123", " 1234 ", "\t\n42\u3000",
    "1,234,567", "9,007,199,254,740,991", True, False, -1, 1.0,
    MAX_SAFE_INTEGER + 1, None, [], {}, "", "-1", "+1", "1.0", "1e3",
    "1,23", "12,34,567", "0,123", "1 234", "NaN", "１２３",
    "9,007,199,254,740,992", "00000000000000000", "1" * 100,
])
@pytest.mark.parametrize("provider", ["gov24", "bokjiro", "notice"])
def test_database_count_validation_matches_shared_listing_parser(repository, value, provider):
    add_listing(repository, "signal", value, provider=provider)
    with repository.engine.connect() as connection:
        measured = connection.scalar(select(
            view_count_expression(models.records, dialect="sqlite")))
        listing = connection.scalar(select(models.records.c.listing_json))
    parsed = listing_popularity(provider, listing)
    assert measured == (parsed["views"] if parsed else None)


def test_mysql_count_query_has_validation_and_orders_before_limit(repository):
    # Production MySQL expression is compiled independently of the SQLite adapter.
    views = view_count_expression(models.records).label("views")
    query = select(models.records.c.policy_key, views).order_by(views.desc()).limit(1)
    sql = str(query.compile(dialect=mysql.dialect()))
    assert "json_type" in sql and "REGEXP" in sql and "regexp_replace" in sql
    assert "CAST(" in sql and sql.index("ORDER BY") < sql.index("LIMIT")


@pytest.mark.skipif(os.getenv("BOKJI_TEST_MYSQL") != "1", reason="Opt-in read-only MySQL test")
def test_mysql_native_json_types_and_count_validation_match_parser():
    # Only SELECT on parameterized synthetic JSON; no real rows or schema changes.
    engine = create_database_engine(load_settings())
    try:
        synthetic = text(
            "SELECT :provider AS provider, CAST(:listing AS JSON) AS listing_json"
        ).columns(provider=String, listing_json=JSON).subquery()
        samples = [0, MAX_SAFE_INTEGER, "000123", "\t\n42\u3000", "1,234,567",
                   True, False, -1, 1.0, MAX_SAFE_INTEGER + 1, None, [], {},
                   "0,123", "1e3", "00000000000000000"]
        with engine.connect() as connection:
            for provider in ("gov24", "bokjiro", "notice"):
                field = "조회수" if provider == "gov24" else "inqNum"
                for value in samples:
                    listing = {field: value}
                    measured = connection.scalar(select(view_count_expression(synthetic)), {
                        "provider": provider, "listing": json.dumps(listing, ensure_ascii=False)})
                    parsed = listing_popularity(provider, listing)
                    assert measured == (parsed["views"] if parsed else None)
    finally:
        engine.dispose()


def test_http_defaults_to_popular_and_validates_sort(repository):
    add_policy(repository, "popular", day=1)
    add_policy(repository, "new", day=7)
    add_listing(repository, "popular", 123)
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        assert ids(client.get("/v1/policies?limit=1").json()) == ["popular"]
        assert ids(client.get("/v1/policies?sort=popular&limit=1").json()) == ["popular"]
        assert ids(client.get("/v1/policies?sort=recent&limit=1").json()) == ["new"]
        assert client.get("/v1/policies?sort=name").status_code == 200
        assert client.get("/v1/policies?sort=views").status_code == 422
