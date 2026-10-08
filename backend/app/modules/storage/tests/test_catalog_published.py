from datetime import datetime
from types import SimpleNamespace

from sqlalchemy import Column, DateTime, MetaData, String, Table, create_engine, event
from sqlalchemy.types import JSON

from app.modules.storage import catalog


def test_published_pipeline_revision_is_used_for_list_detail_and_calendar():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def register_mysql_functions(connection, _):
        connection.create_function("json_unquote", 1, lambda value: value)
        connection.create_function(
            "concat", -1, lambda *values: "".join(str(value) for value in values)
        )

    metadata = MetaData()
    documents = Table(
        "condition_documents",
        metadata,
        Column("revision_id", String, primary_key=True),
        Column("policy_key", String, nullable=False),
        Column("created_at", DateTime, nullable=False),
        Column("source_json", JSON, nullable=False),
        Column("review_status", String, nullable=False),
    )
    details = Table(
        "policy_revision_details",
        metadata,
        Column("revision_id", String, primary_key=True),
        Column("draft_json", JSON, nullable=False),
        Column("title", String, nullable=False),
        Column("category", String),
    )
    metadata.create_all(engine)
    source = {
        "title": "[논산시] 장학 공고",
        "organization": "광운대학교",
        "source_url": "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=notice-1",
        "fields": {
            "text": "장학 공고 본문",
            "application_period": "신청 기간: 2026-10-01 ~ 2026-10-31",
        },
    }
    with engine.begin() as connection:
        connection.execute(
            documents.insert(),
            {
                "revision_id": "revision-1",
                "policy_key": "notice:notice-1",
                "created_at": datetime(2026, 9, 20),
                "source_json": source,
                "review_status": "published",
            },
        )
        connection.execute(
            details.insert(),
            {
                "revision_id": "revision-1",
                "draft_json": {
                    "overview": {
                        "region_conditions": {
                            "status": "specified",
                            "text": ("충청남도 논산시에 1년 이상 주소를 두고 실제 거주하는 "
                                     "주민 또는 그 자녀"),
                        }
                    }
                },
                "title": source["title"],
                "category": "교육",
            },
        )

    repository = SimpleNamespace(
        engine=engine,
        tables={
            "condition_documents": documents,
            "policy_revision_details": details,
        },
    )
    listing = catalog.list_policies(repository)
    chungnam_listing = catalog.list_policies(repository, region="충남")
    seoul_listing = catalog.list_policies(repository, region="서울")
    detail = catalog.get_policy(repository, "notice:notice-1")
    calendar = catalog.list_calendar(repository, month="2026-10")
    chungnam_calendar = catalog.list_calendar(repository, month="2026-10", region="충남")

    assert listing["total"] == 1
    assert listing["items"][0]["organization"] == "광운대학교"
    assert chungnam_listing["total"] == 1
    assert chungnam_listing["items"][0]["title"] == "[논산시] 장학 공고"
    assert seoul_listing["total"] == 0
    assert detail is not None
    assert detail["revisionId"] == "revision-1"
    assert detail["applicationStart"] == "2026-10-01"
    assert detail["applicationEnd"] == "2026-10-31"
    assert calendar["total"] == 1
    assert calendar["items"][0]["id"] == "notice:notice-1"
    assert chungnam_calendar["total"] == 1
    engine.dispose()
