"""Month periods use first/last day markers while preserving source precision."""

from datetime import datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import JSON, Column, DateTime, MetaData, String, Table, create_engine, event

from app.modules.storage import catalog


@pytest.fixture
def repository():
    engine = create_engine("sqlite://")

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


@pytest.fixture(autouse=True)
def current_year(monkeypatch):
    monkeypatch.setattr("app.modules.storage.application_dates.application_reference_year",
                        lambda: 2026)


def add_policy(repository, key, period, *, published=True, overview_period=None):
    source = {"title": key, "organization": "테스트 기관", "source_url": None,
              "fields": {"application_period": period}}
    overview = {"application_period": overview_period} if overview_period else {}
    with repository.engine.begin() as connection:
        connection.execute(repository.tables["condition_documents"].insert().values(
            revision_id=key + "-revision", policy_key=key,
            created_at=datetime(2026, 10, 8), source_json=source,
            review_status="published" if published else "draft"))
        connection.execute(repository.tables["policy_revision_details"].insert().values(
            revision_id=key + "-revision", title=key, category="생활·금융",
            draft_json={"overview": overview}))


def ids(result):
    return {item["id"] for item in result["items"]}


def test_yearless_months_have_start_end_markers_in_past_and_next_year(repository):
    add_policy(repository, "month-reference", "3~4월")
    add_policy(repository, "ongoing", "상시 신청")
    add_policy(repository, "unknown", "공식 공고에서 확인")
    add_policy(repository, "hidden", "3~4월", published=False)

    for month in ("2025-03", "2026-04", "2027-03", "2028-04"):
        result = catalog.list_calendar(repository, month=month)
        assert ids(result) == {"month-reference"}
        assert result["total"] == 1 and result["undatedTotal"] == 2
        item = result["items"][0]
        assert item["applicationPrecision"] == "month"
        assert item["scheduleStatus"] == "dated"
        assert item["applicationYear"] is None
        assert item["applicationStart"] == month[:4] + "-03-01"
        assert item["applicationEnd"] == month[:4] + "-04-30"
    assert catalog.list_calendar(repository, month="2027-05")["total"] == 0


def test_expired_exact_dates_and_explicit_month_year_remain_in_original_calendar(repository):
    add_policy(repository, "expired", "2024-03-10 ~ 2024-04-20")
    add_policy(repository, "dated-month", "2025년 3~4월")

    for month in ("2024-03", "2024-04"):
        result = catalog.list_calendar(repository, month=month)
        assert ids(result) == {"expired"}
        assert result["items"][0]["applicationEnd"] == "2024-04-20"
    assert ids(catalog.list_calendar(repository, month="2025-03")) == {"dated-month"}
    assert ids(catalog.list_calendar(repository, month="2025-04")) == {"dated-month"}
    item = catalog.list_calendar(repository, month="2025-04")["items"][0]
    assert item["applicationStart"] == "2025-03-01"
    assert item["applicationEnd"] == "2025-04-30"
    assert catalog.list_calendar(repository, month="2026-03")["total"] == 0
    assert catalog.list_calendar(repository, month="2025-05")["total"] == 0


def test_budget_ongoing_with_start_remains_visible_in_later_months(repository):
    add_policy(repository, "budget", "매년 5월 ~ 재원소진 시까지(수시)")
    assert catalog.list_calendar(repository, month="2027-04")["total"] == 0
    for month in ("2027-05", "2027-06", "2027-12", "2028-05"):
        result = catalog.list_calendar(repository, month=month)
        assert ids(result) == {"budget"}
        assert result["undatedTotal"] == 0
        item = result["items"][0]
        assert item["scheduleStatus"] == "ongoing"
        assert item["applicationStart"] == month[:4] + "-05-01"
        assert item["applicationEnd"] is None


def test_cited_month_period_is_shared_by_list_detail_calendar_and_filters(repository):
    add_policy(repository, "assistive-device", "", overview_period={
        "status": "specified", "text": "3~4월",
    })
    listing = catalog.list_policies(repository, category="생활·금융")
    detail = catalog.get_policy(repository, "assistive-device")
    calendar = catalog.list_calendar(repository, month="2027-03", category="생활·금융")
    assert listing["items"][0]["applicationMonths"] == detail["applicationMonths"] == [3, 4]
    assert listing["items"][0]["applicationStart"] == detail["applicationStart"] == "2026-03-01"
    assert listing["items"][0]["applicationEnd"] == detail["applicationEnd"] == "2026-04-30"
    assert calendar["items"][0]["applicationStart"] == "2027-03-01"
    assert calendar["items"][0]["applicationEnd"] == "2027-04-30"
    assert calendar["items"][0]["applicationPeriod"] == "3~4월"
    assert calendar["undatedTotal"] == 0
    assert catalog.list_calendar(repository, month="2027-03", category="주거")["total"] == 0


def test_cross_year_month_period_preserves_one_season_and_february_leap_day(repository):
    add_policy(repository, "winter", "11~2월")
    for month in ("2027-11", "2027-12", "2028-01", "2028-02"):
        result = catalog.list_calendar(repository, month=month)
        assert ids(result) == {"winter"}
        assert result["items"][0]["applicationStart"] == "2027-11-01"
        assert result["items"][0]["applicationEnd"] == "2028-02-29"
        assert result["undatedTotal"] == 0
    assert catalog.list_calendar(repository, month="2028-03")["total"] == 0


def test_explicit_cross_year_period_overrides_query_year(repository):
    add_policy(repository, "winter-2027", "2027년 11월~2028년 2월")
    result = catalog.list_calendar(repository, month="2028-02")
    assert ids(result) == {"winter-2027"}
    assert result["items"][0]["applicationStart"] == "2027-11-01"
    assert result["items"][0]["applicationEnd"] == "2028-02-29"
    assert result["items"][0]["applicationYear"] == 2027
    assert catalog.list_calendar(repository, month="2029-02")["total"] == 0


@pytest.mark.parametrize("year", [2025, 2027, 2028])
def test_annual_april_deadline_rebases_calendar_year_without_inventing_start(repository, year):
    add_policy(repository, "annual-april", "매년 4월 말까지")
    result = catalog.list_calendar(repository, month=f"{year}-04")
    assert ids(result) == {"annual-april"}
    assert result["total"] == 1 and result["undatedTotal"] == 0
    item = result["items"][0]
    assert item["applicationStart"] is None
    assert item["applicationEnd"] == f"{year}-04-30"
    assert item["applicationPrecision"] == "month_end"
    assert item["applicationRecurrence"] == "yearly"
    assert item["applicationYear"] is None
    assert catalog.list_calendar(repository, month=f"{year}-03")["total"] == 0
    assert catalog.list_calendar(repository, month=f"{year}-05")["total"] == 0


@pytest.mark.parametrize("month,end", [
    ("2025-02", "2025-02-28"), ("2027-02", "2027-02-28"),
    ("2028-02", "2028-02-29"), ("2028-04", "2028-04-30"),
    ("2028-05", "2028-05-31"),
])
def test_monthly_deadline_uses_real_query_month_end_and_leap_year(repository, month, end):
    add_policy(repository, "monthly-deadline", "매월 말일")
    result = catalog.list_calendar(repository, month=month)
    assert ids(result) == {"monthly-deadline"} and result["undatedTotal"] == 0
    item = result["items"][0]
    assert item["applicationStart"] is None
    assert item["applicationEnd"] == end
    assert item["applicationRecurrence"] == "monthly"
    assert item["applicationPrecision"] == "month_end"


def test_two_rounds_in_one_month_keep_all_start_end_markers_and_daily_gap(repository):
    add_policy(repository, "two-may-rounds",
               "(1차)2026년5월1일~5월10일 (2차)2026년5월20일~5월31일")
    result = catalog.list_calendar(repository, month="2026-05")
    assert ids(result) == {"two-may-rounds"} and result["total"] == 1
    assert result["undatedTotal"] == 0
    item = result["items"][0]
    assert item["applicationStart"] == "2026-05-01"
    assert item["applicationEnd"] == "2026-05-10"
    assert item["applicationWindows"] == [
        {"applicationStart": "2026-05-01", "applicationEnd": "2026-05-10"},
        {"applicationStart": "2026-05-20", "applicationEnd": "2026-05-31"},
    ]
    assert all(not (window["applicationStart"] <= "2026-05-15" <= window["applicationEnd"])
               for window in item["applicationWindows"])


def test_calendar_checks_every_round_but_excludes_whole_month_gap(repository):
    add_policy(repository, "separate-rounds",
               "(1차)2026년5월22일~6월22일 (2차)2026년8월12일~9월9일")
    for month, start, end in [
        ("2026-05", "2026-05-22", "2026-06-22"),
        ("2026-06", "2026-05-22", "2026-06-22"),
        ("2026-08", "2026-08-12", "2026-09-09"),
        ("2026-09", "2026-08-12", "2026-09-09"),
    ]:
        result = catalog.list_calendar(repository, month=month)
        assert ids(result) == {"separate-rounds"}
        item = result["items"][0]
        assert item["applicationStart"] == start and item["applicationEnd"] == end
        assert len(item["applicationWindows"]) == 2
    assert catalog.list_calendar(repository, month="2026-07")["total"] == 0
    assert catalog.list_calendar(repository, month="2026-10")["total"] == 0


def test_explicit_and_annual_rounds_keep_each_year_and_selected_recurrence(repository):
    add_policy(repository, "mixed-rounds",
               "(1차)2025년4월1일~4월30일 (2차)매년9월1일~9월30일")
    historic = catalog.list_calendar(repository, month="2025-04")["items"][0]
    assert historic["applicationStart"] == "2025-04-01"
    assert historic["applicationEnd"] == "2025-04-30"
    assert historic.get("applicationRecurrence") is None
    assert catalog.list_calendar(repository, month="2027-04")["total"] == 0

    future = catalog.list_calendar(repository, month="2027-09")["items"][0]
    assert future["applicationStart"] == "2027-09-01"
    assert future["applicationEnd"] == "2027-09-30"
    assert future["applicationRecurrence"] == "yearly"
    assert future["applicationYear"] is None
    assert future["applicationWindows"] == [
        {"applicationStart": "2025-04-01", "applicationEnd": "2025-04-30"},
        {"applicationStart": "2027-09-01", "applicationEnd": "2027-09-30"},
    ]
    assert catalog.list_calendar(repository, month="2027-08")["total"] == 0
