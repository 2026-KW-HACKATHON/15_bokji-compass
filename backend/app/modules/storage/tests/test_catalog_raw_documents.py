from types import SimpleNamespace

from sqlalchemy import (
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    event,
    insert,
)
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import JSON

from app.modules.storage import catalog


def _document(document_id, title, text, source_url, published_at="2026-10-05"):
    return {
        "document_id": document_id,
        "title": title,
        "text": text,
        "source_url": source_url,
        "collected_at": "2026-10-05T12:00:00+00:00",
        "published_at": published_at,
    }


def test_raw_documents_use_only_explicit_application_periods():
    with_dates = catalog.raw_document_card(
        _document(
            "notice-1",
            "[등록/장학] 신청 안내",
            "1. 신청기간 : 2026. 10. 6. ~ 2026. 10. 20.",
            "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=1",
        )
    )
    without_dates = catalog.raw_document_card(
        _document(
            "notice-2",
            "[등록/장학] 게시 안내",
            "작성일 2026.10.05\n장학사업 안내",
            "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=2",
        )
    )

    assert with_dates["applicationStart"] == "2026-10-06"
    assert with_dates["applicationEnd"] == "2026-10-20"
    assert with_dates["scheduleStatus"] == "dated"
    assert without_dates["date"] == "2026-10-05"
    assert without_dates["applicationStart"] is None
    assert without_dates["applicationEnd"] is None
    assert without_dates["scheduleStatus"] == "unknown"


def test_raw_document_cards_filter_notice_pages_and_metadata():
    engine = create_engine("sqlite://")
    metadata = MetaData()
    table = Table(
        "raw_documents",
        metadata,
        Column("document_id", String, primary_key=True),
        Column("title", String, nullable=False),
        Column("text", Text, nullable=False),
        Column("source_url", String, nullable=False),
        Column("collected_at", String, nullable=False),
        Column("published_at", String),
    )
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            insert(table),
            [
                _document(
                    "notice-1",
                    "[등록/장학] 광운대 장학금 신청",
                    "생활비 장학 신청 안내",
                    "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=1",
                ),
                _document(
                    "notice-2",
                    "[등록/장학] 다른 공지",
                    "일반 안내",
                    "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=2",
                ),
                _document(
                    "listing",
                    "광운대 등록/장학 공지",
                    "게시판 목록",
                    "https://www.kw.ac.kr/ko/life/notice.jsp?srCategoryId=4",
                ),
            ],
        )

    repository = SimpleNamespace(tables={"raw_documents": table})
    with engine.connect() as connection:
        all_cards = catalog.raw_document_cards(repository, connection)
        matching_cards = catalog.raw_document_cards(
            repository, connection, q="광운대 장학금"
        )
        nonmatching_region = catalog.raw_document_cards(
            repository, connection, region="서울"
        )

    assert {item["id"] for item in all_cards} == {
        "kwangwoon:notice-1",
        "kwangwoon:notice-2",
    }
    assert [item["id"] for item in matching_cards] == ["kwangwoon:notice-1"]
    assert nonmatching_region == []
    engine.dispose()


def test_raw_notices_flow_through_catalog_list_detail_and_calendar():
    from fastapi.testclient import TestClient

    from app.api.policies import get_repository
    from app.core.config import Settings
    from app.main import create_app

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def register_mysql_functions(connection, _):
        connection.create_function("json_unquote", 1, lambda value: value)
        connection.create_function(
            "concat", -1, lambda *values: "".join(str(value) for value in values)
        )

    metadata = MetaData()
    raw_documents = Table(
        "raw_documents",
        metadata,
        Column("document_id", String, primary_key=True),
        Column("title", String, nullable=False),
        Column("text", Text, nullable=False),
        Column("source_url", String, nullable=False),
        Column("collected_at", String, nullable=False),
        Column("published_at", String),
    )
    condition_documents = Table(
        "condition_documents",
        metadata,
        Column("revision_id", String, primary_key=True),
        Column("policy_key", String, nullable=False),
        Column("created_at", DateTime, nullable=False),
        Column("source_json", JSON, nullable=False),
        Column("review_status", String, nullable=False),
    )
    policy_revision_details = Table(
        "policy_revision_details",
        metadata,
        Column("revision_id", String, primary_key=True),
        Column("draft_json", JSON, nullable=False),
        Column("title", String, nullable=False),
        Column("category", String),
    )
    metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            insert(raw_documents),
            [
                _document(
                    "dated",
                    "[등록/장학] 날짜 있는 공고",
                    "신청기간 : 2026. 10. 6. ~ 2026. 10. 20.",
                    "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=1",
                ),
                _document(
                    "undated",
                    "[등록/장학] 일정 미정 공고",
                    "일정은 공식 공고를 확인하세요.",
                    "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=2",
                    published_at="2026-10-04",
                ),
            ],
        )

    repository = SimpleNamespace(
        engine=engine,
        tables={
            "raw_documents": raw_documents,
            "condition_documents": condition_documents,
            "policy_revision_details": policy_revision_details,
        },
    )
    listing = catalog.list_policies(repository, limit=1)
    next_page = catalog.list_policies(repository, limit=1, offset=1)
    detail = catalog.get_policy(repository, "kwangwoon:dated")
    calendar = catalog.list_calendar(repository, month="2026-10")

    assert listing["total"] == 2
    assert listing["items"][0]["id"] == "kwangwoon:dated"
    assert listing["nextCursor"] == "1"
    assert next_page["items"][0]["id"] == "kwangwoon:undated"
    assert detail["applicationStart"] == "2026-10-06"
    assert calendar["total"] == 1
    assert calendar["items"][0]["id"] == "kwangwoon:dated"
    assert calendar["undatedTotal"] == 1
    assert calendar["undatedItems"][0]["id"] == "kwangwoon:undated"

    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get("/v1/policies?limit=1")
        assert response.status_code == 200, response.text
        assert response.json()["items"][0]["id"] == "kwangwoon:dated"
        assert (
            client.get("/v1/policies/kwangwoon:dated").json()["title"]
            == "[등록/장학] 날짜 있는 공고"
        )
        calendar_response = client.get("/v1/policies/calendar?month=2026-10").json()
        assert calendar_response["total"] == 1
        assert calendar_response["undatedTotal"] == 1
    engine.dispose()
