from datetime import UTC, date, datetime

import pytest

from app.modules.storage.application_dates import (
    application_date_columns,
    application_reference_year,
    application_schedule,
)


def test_explicit_application_period_maps_to_database_date_columns():
    assert application_date_columns({
        "application_period": "신청 기간: 2026-10-01 ~ 2026-10-31",
    }) == (date(2026, 10, 1), date(2026, 10, 31))


def test_ambiguous_or_unrecognized_application_period_stays_null():
    assert application_date_columns({
        "text": "신청 기간: 2026-10-01 ~ 2026-10-31\n신청 기간: 2026-11-01 ~ 2026-11-30",
    }) == (None, None)
    assert application_date_columns({
        "application_period": "상시 신청",
    }) == (None, None)


def test_cited_overview_period_maps_korean_from_to_dates():
    overview_period = {
        "status": "specified",
        "text": "신청 기간은 2026년 10월 1일부터 2026년 10월 31일까지",
    }
    assert application_date_columns({}, overview_period) == (
        date(2026, 10, 1), date(2026, 10, 31))


def test_period_with_application_hours_maps_to_calendar_dates():
    assert application_date_columns({
        "application_period": "신청기간: 2026. 8. 12.(수) 9시 ~ 2026. 9. 9.(수) 18시",
    }) == (date(2026, 8, 12), date(2026, 9, 9))
    assert application_date_columns({
        "application_period": "2026. 9. 28.(월) 09:00 ~ 10. 7.(수) 18:00",
    }) == (date(2026, 9, 28), date(2026, 10, 7))


def test_missing_year_stays_unknown_and_numbered_period_is_recognized():
    assert application_date_columns(
        {"application_period": "10월 1일 ~ 10월 31일"},
    ) == (None, None)
    assert application_date_columns({
        "text": "장학생 모집\n3. 신청기간: 2026. 9. 28.(월) 09:00 ~ 10. 7.(수) 18:00",
    }) == (date(2026, 9, 28), date(2026, 10, 7))


@pytest.mark.parametrize("period,months,year,start,end", [
    ("3~4월", [3, 4], None, "2026-03-01", "2026-04-30"),
    ("3월 ~ 4월", [3, 4], None, "2026-03-01", "2026-04-30"),
    ("신청기간: 매년 3월부터 4월까지", [3, 4], None, "2026-03-01", "2026-04-30"),
    ("접수 기간은 2026년 3~4월", [3, 4], 2026, "2026-03-01", "2026-04-30"),
    ("2025년 3월 ~ 2025년 4월", [3, 4], 2025, "2025-03-01", "2025-04-30"),
    ("3월 ~ 2025년 4월", [3, 4], 2025, "2025-03-01", "2025-04-30"),
    ("2028년 2월", [2], 2028, "2028-02-01", "2028-02-29"),
    ("2월", [2], None, "2026-02-01", "2026-02-28"),
    ("7~8월", [7, 8], None, "2026-07-01", "2026-08-31"),
    ("11~2월", [11, 12, 1, 2], None, "2026-11-01", "2027-02-28"),
    ("2027년 11~2월", [11, 12, 1, 2], 2027, "2027-11-01", "2028-02-29"),
    ("2027년 11월~2028년 2월", [11, 12, 1, 2], 2027, "2027-11-01", "2028-02-29"),
    ("11월~2028년 2월", [11, 12, 1, 2], 2027, "2027-11-01", "2028-02-29"),
])
def test_month_periods_expand_to_first_and_last_days(period, months, year, start, end, monkeypatch):
    monkeypatch.setattr("app.modules.storage.application_dates.application_reference_year",
                        lambda: 2026)
    assert application_schedule(period, reference_year=2026) == {
        "applicationStart": start,
        "applicationEnd": end,
        "scheduleStatus": "dated",
        "applicationPrecision": "month",
        "applicationMonths": months,
        "applicationYear": year,
    }
    assert application_date_columns({"application_period": period}) == (
        date.fromisoformat(start), date.fromisoformat(end))


def test_month_period_default_year_is_korean_calendar_year():
    assert application_reference_year(datetime(2026, 12, 31, 14, 59, tzinfo=UTC)) == 2026
    assert application_reference_year(datetime(2026, 12, 31, 15, 0, tzinfo=UTC)) == 2027


@pytest.mark.parametrize("year,month,start,end", [
    (2027, 11, "2027-11-01", "2028-02-29"),
    (2027, 12, "2027-11-01", "2028-02-29"),
    (2028, 1, "2027-11-01", "2028-02-29"),
    (2028, 2, "2027-11-01", "2028-02-29"),
])
def test_yearless_month_window_keeps_same_season_across_new_year(year, month, start, end):
    schedule = application_schedule("11~2월", reference_year=year, reference_month=month)
    assert schedule["applicationStart"] == start
    assert schedule["applicationEnd"] == end
    assert schedule["applicationYear"] is None


@pytest.mark.parametrize("period", [
    "0~4월", "3~13월", "3~4", "2026년 11월~2026년 2월", "2026년 3월~2025년 4월",
    "3~4월 / 추가 10월", "3~4월(예정)", "3월 1일 ~ 4월 30일",
])
def test_unclear_month_periods_do_not_become_exact_dates(period):
    assert application_schedule(period) == {
        "applicationStart": None, "applicationEnd": None, "scheduleStatus": "unknown",
    }
