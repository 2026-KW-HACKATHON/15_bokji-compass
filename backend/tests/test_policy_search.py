"""Search intent is preserved before pagination and at the HTTP boundary."""

import json
import os
import re
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import JSON, Column, DateTime, MetaData, String, Table, create_engine, event, insert
from sqlalchemy.dialects import mysql
from sqlalchemy.pool import StaticPool

from app.api.policies import get_repository
from app.core.config import BACKEND_ROOT, Settings
from app.core.database import create_database_engine
from app.main import create_app
from app.modules.storage import catalog
from app.modules.storage.search import CONTENT_FIELDS, search_terms


@pytest.fixture
def repository():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def register_mysql_functions(connection, _):
        connection.create_function("json_unquote", 1, lambda value: value)
        connection.create_function("concat", -1, lambda *values: "".join(map(str, values)))
        connection.create_function("regexp", 2,
                                   lambda pattern, value: bool(re.search(pattern, value or "")))

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


def add_policy(repository, key, *, title="외부 장학 공고", organization="광운대학교",
               fields=None, day=1, revision=None, published=True, editorial=None):
    revision = revision or key + "-revision"
    source = {"title": title, "organization": organization,
              "source_url": "https://example.org/metadata-url-token",
              "fields": {"application_period": "2026-10-01 ~ 2026-10-31", **(fields or {})}}
    with repository.engine.begin() as connection:
        connection.execute(insert(repository.tables["condition_documents"]).values(
            revision_id=revision, policy_key=key, created_at=datetime(2026, 10, day),
            source_json=source, review_status="published" if published else "draft"))
        connection.execute(insert(repository.tables["policy_revision_details"]).values(
            revision_id=revision, title=title, category="교육",
            draft_json={"editorial": editorial or {}, "overview": {
                "region_conditions": {"status": "unrestricted", "text": "전국"},
                "age_conditions": {"status": "specified", "text": "청년"}}}))


def ids(result):
    return {item["id"] for item in result["items"]}


def test_publisher_content_and_mixed_terms_are_distinct(repository):
    add_policy(repository, "publisher", fields={"text": "논산시 장학재단 대학생 지원"})
    add_policy(repository, "related", organization="서울시", fields={
        "eligibility": "광운대 학생 대상", "benefits": "장학금 지원"})
    add_policy(repository, "both", title="광운대학교 교내 장학금")
    add_policy(repository, "unrelated", organization="부산시")
    assert ids(catalog.list_policies(repository, q="광운대")) == {"publisher", "related", "both"}
    assert ids(catalog.list_policies(repository, q="광운대", search_scope="organization")) == {
        "publisher", "both"}
    assert ids(catalog.list_policies(repository, q="광운대", search_scope="content")) == {
        "related", "both"}
    assert ids(catalog.list_policies(repository, q="광운대 장학")) == {
        "publisher", "related", "both"}
    assert catalog.list_policies(repository, q="광운대 장학",
                                 search_scope="organization")["total"] == 0
    assert catalog.list_policies(repository, q="광운대 무관")["total"] == 0


@pytest.mark.parametrize("field", CONTENT_FIELDS)
def test_each_meaningful_field_is_searchable(repository, field):
    add_policy(repository, "content", organization="외부 기관", fields={field: "광운대 학생 지원"})
    assert ids(catalog.list_policies(repository, q="광운대학교", search_scope="content")) == {
        "content"}


def test_metadata_and_json_keys_never_establish_a_match(repository):
    add_policy(repository, "metadata", organization="외부 기관", fields={
        "text": "일반 대학생 지원", "광운대": "공고 항목 이름", "contact": "광운대 문의처",
        "receipt_agency": "광운대", "application_url": "https://example.org/광운대",
        "links": '[{"label":"광운대","url":"https://example.org"}]',
        "attachments": '[{"filename":"광운대.hwp"}]', "_editor_contact": "광운대"})
    for word in ("광운대", "metadata-url-token", "eligibility", "application_period",
                 "fields", "_editor_contact", "filename"):
        assert catalog.list_policies(repository, q=word)["total"] == 0


def test_body_boilerplate_is_still_literal_content_without_semantic_guessing(repository):
    add_policy(repository, "literal", fields={"text": "신청 안내\n광운대학교 학생처 게시"})
    add_policy(repository, "implicit", fields={"text": "우리대학 재학생은 KLAS에서 신청"})
    assert ids(catalog.list_policies(repository, q="광운대", search_scope="content")) == {"literal"}


@pytest.mark.parametrize("field", ["summary", "benefits", "region", "age", "gender", "other"])
def test_selected_admin_display_corrections_are_searchable(repository, field):
    add_policy(repository, "manual", organization="외부 기관", editorial={field: "광운대 학생"})
    assert ids(catalog.list_policies(repository, q="광운대", search_scope="content")) == {"manual"}


def test_admin_contact_metadata_does_not_establish_content_matches(repository):
    add_policy(repository, "manual", organization="외부 기관", editorial={
        "contact": "광운대", "application_url": "https://example.org/광운대"})
    assert catalog.list_policies(repository, q="광운대", search_scope="content")["total"] == 0


def test_aliases_case_unicode_whitespace_and_field_boundaries(repository):
    add_policy(repository, "short", title="광운대 학생", organization="외부 기관")
    add_policy(repository, "full", title="광운\u3000대학\n교 ABC 지원", organization="외부 기관")
    add_policy(repository, "other", title="성균관대 학생", organization="외부 기관")
    add_policy(repository, "boundary", title="광운", organization="외부 기관",
               fields={"benefits": "대학교 지원"})
    assert ids(catalog.list_policies(repository, q=" 광운대학교 \t ", search_scope="content")) == {
        "short", "full"}
    assert ids(catalog.list_policies(repository, q="성균관대학교", search_scope="content")) == {
        "other"}
    assert ids(catalog.list_policies(repository, q="광운대 aBc", search_scope="content")) == {
        "full"}
    assert search_terms("임대 세대 대학교 ABC") == [("임대",), ("세대",), ("대학교",), ("abc",)]


def test_field_separators_never_create_matches(repository):
    add_policy(repository, "boundary", title="광", organization="외부 기관",
               fields={"text": "운대 학생 지원"})
    add_policy(repository, "literal", title="장학 | 안내", organization="외부 기관")
    assert catalog.list_policies(repository, q="광운대", search_scope="content")["total"] == 0
    assert ids(catalog.list_policies(repository, q="|", search_scope="content")) == {"literal"}


@pytest.mark.parametrize("query,expected", [("%", "percent"), ("_", "underscore"),
                                          ("/", "slash"), ("% _", "both")])
def test_wildcard_and_escape_characters_are_literal(repository, query, expected):
    for key, title in [("plain", "일반 공고"), ("percent", "50% 지원"),
                       ("underscore", "장학_지원"), ("slash", "장학/지원"),
                       ("both", "% _ 장학")]:
        add_policy(repository, key, title=title, organization="외부 기관")
    expected_ids = {expected, "both"} if query in {"%", "_"} else {expected}
    assert ids(catalog.list_policies(repository, q=query, search_scope="content")) == expected_ids


def test_latest_publication_filters_count_pages_and_calendar_share_scope(repository):
    add_policy(repository, "one", title="광운대 이전 공개 제목", revision="old", day=1)
    add_policy(repository, "one", title="변경된 외부 장학", revision="new", day=2)
    add_policy(repository, "two", title="광운대 학생 장학", day=3)
    add_policy(repository, "two", title="숨겨진 초안", revision="hidden", day=7, published=False)
    add_policy(repository, "draft", title="광운대 비공개 장학", published=False)
    add_policy(repository, "three", title="광운대학교 학생 장학", day=4)
    filters = {"q": "광운대", "search_scope": "content", "category": "교육",
               "region": "서울", "audience": "청년"}
    first = catalog.list_policies(repository, limit=1, **filters)
    second = catalog.list_policies(repository, limit=1, offset=1, **filters)
    assert first["total"] == second["total"] == 2
    assert first["nextCursor"] == "1" and second["nextCursor"] is None
    assert ids(first) | ids(second) == {"two", "three"}
    calendar = catalog.list_calendar(repository, month="2026-10", **filters)
    assert calendar["total"] == 2 and ids(calendar) == {"two", "three"}
    assert catalog.list_calendar(repository, month="2026-10", q="광운대",
                                 search_scope="organization")["total"] == 3


def test_http_scope_default_forwarding_and_validation(repository):
    add_policy(repository, "publisher")
    add_policy(repository, "content", title="광운대 학생 장학", organization="외부 기관")
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        for path, params in [("/v1/policies", {}), ("/v1/policies/calendar", {"month": "2026-10"})]:
            assert ids(client.get(path, params={**params, "q": "광운대"}).json()) == {
                "publisher", "content"}
            for scope, expected in [("all", {"publisher", "content"}),
                                    ("organization", {"publisher"}), ("content", {"content"})]:
                response = client.get(path, params={**params, "q": "광운대", "search_scope": scope})
                assert response.status_code == 200 and ids(response.json()) == expected
            for scope in ("invalid", "", "ALL"):
                assert client.get(path, params={**params, "search_scope": scope}).status_code == 422


def test_mysql_query_uses_explicit_fields_and_escapes_bound_literals(repository):
    _, query = catalog.filtered_catalog(repository, q="광운대학교 % _", search_scope="content")
    compiled = query.compile(dialect=mysql.dialect())
    sql = str(compiled)
    assert "$.fields" not in compiled.params.values()
    assert "$.organization" not in compiled.params.values()
    assert "$.fields.text" in compiled.params.values()
    assert "$.editorial.summary" in compiled.params.values()
    assert "/%" in compiled.params.values() and "/_" in compiled.params.values()
    assert "ESCAPE" in sql and "position =" in sql


@pytest.mark.skipif(os.getenv("BOKJI_TEST_MYSQL") != "1", reason="Opt-in read-only MySQL test")
def test_mysql_native_search_matches_sqlite_contract():
    # Parameterized synthetic rows exercise the production expressions; no
    # source data, schema or publication state is read or changed.
    from sqlalchemy import literal, select, text

    from app.modules.storage.search import search_predicates

    state = json.loads((BACKEND_ROOT / "data/mysql-dev/credentials.json").read_text())
    engine = create_database_engine(Settings(
        _env_file=None, db_enabled=True, db_host="127.0.0.1", db_port=state["port"],
        db_name="bokji_compass_test", db_user="bokji_test", db_password=state["app_password"],
    ))
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT DATABASE()")) == "bokji_compass_test"
            actual = connection.scalar(text("SELECT @@datadir"))
            assert Path(actual).resolve() == (BACKEND_ROOT / "data/mysql-dev/data").resolve()
            for title, organization, fields, query, scope, expected in [
                ("외부 장학", "광운대학교", {}, "광운대", "organization", True),
                ("외부 장학", "광운대학교", {}, "광운대", "content", False),
                ("광운대 학생", "서울시", {}, "광운대학교", "content", True),
                ("지원", "광운대학교", {"benefits": "장학금"}, "광운대 장학", "all", True),
                ("광운\u3000대학교 ABC", "기관", {}, "광운대 abc", "content", True),
                ("광운", "기관", {"text": "대학교"}, "광운대", "content", False),
                ("지원", "기관", {"contact": "광운대"}, "광운대", "content", False),
                ("지원", "기관", {"text": "50%_ 지원"}, "% _", "content", True),
                ("지원", "기관", {"text": "지원"}, "%", "content", False),
            ]:
                source = {"organization": organization, "fields": fields}
                synthetic = select(literal(title).label("title"),
                    literal(json.dumps(source, ensure_ascii=False)).label("source_json"),
                    literal("{}").label("draft_json")).subquery()
                predicates = search_predicates(synthetic, query, scope)
                assert bool(connection.scalar(select(literal(1)).select_from(synthetic)
                                              .where(*predicates))) is expected
    finally:
        engine.dispose()
