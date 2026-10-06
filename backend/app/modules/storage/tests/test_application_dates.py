from datetime import date

from app.modules.storage.application_dates import application_date_columns


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
