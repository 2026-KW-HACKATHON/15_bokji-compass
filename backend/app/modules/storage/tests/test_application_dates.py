from datetime import UTC, date, datetime

import pytest

from app.modules.storage.application_dates import (
    application_date_columns,
    application_period,
    application_reference_year,
    application_schedule,
    resolved_application_period,
)


@pytest.mark.parametrize("value", [
    "분기별 신청( 매분기말 다음달)", "분기별 접수(매 분기 말 다음 달)", "매분기말 다음달",
])
def test_quarter_end_following_month_is_four_separate_annual_months(value):
    schedule = application_schedule(value, reference_year=2027, reference_month=4)
    assert (schedule["applicationStart"], schedule["applicationEnd"]) == (
        "2027-04-01", "2027-04-30",
    )
    assert schedule["applicationRecurrence"] == "yearly"
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2027-01-01", "applicationEnd": "2027-01-31"},
        {"applicationStart": "2027-04-01", "applicationEnd": "2027-04-30"},
        {"applicationStart": "2027-07-01", "applicationEnd": "2027-07-31"},
        {"applicationStart": "2027-10-01", "applicationEnd": "2027-10-31"},
    ]
    assert application_schedule("분기별 신청")["scheduleStatus"] == "unknown"


@pytest.mark.parametrize("period", [
    "'24년 3월; 4월; 6월; 8월; 10월", "24년 3월; 4월; 6월; 8월; 10월",
])
def test_abbreviated_year_is_inherited_by_later_unlabelled_months(period):
    schedule = application_schedule(period, reference_year=2026, reference_month=4)
    assert schedule["applicationYear"] == 2024
    assert "applicationRecurrence" not in schedule
    assert schedule["applicationWindows"] == [
        {"applicationStart": f"2024-{month:02d}-01", "applicationEnd": f"2024-{month:02d}-{last}"}
        for month, last in [(3, 31), (4, 30), (6, 30), (8, 31), (10, 31)]
    ]


def test_repeated_abbreviated_year_month_rounds_remain_explicit():
    schedule = application_schedule("'24년 2월; '24년 5월; '24년 8월", reference_year=2026)
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2024-02-01", "applicationEnd": "2024-02-29"},
        {"applicationStart": "2024-05-01", "applicationEnd": "2024-05-31"},
        {"applicationStart": "2024-08-01", "applicationEnd": "2024-08-31"},
    ]


def test_explicit_annual_round_resets_year_inheritance_for_later_months():
    schedule = application_schedule("2025년 4월; 매년 9월; 10월", reference_year=2027,
                                    reference_month=9)
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2025-04-01", "applicationEnd": "2025-04-30"},
        {"applicationStart": "2027-09-01", "applicationEnd": "2027-09-30"},
        {"applicationStart": "2027-10-01", "applicationEnd": "2027-10-31"},
    ]
    assert schedule["applicationYear"] is None
    assert schedule["applicationRecurrence"] == "yearly"


def test_quarter_mid_and_half_year_round_labels_keep_clear_boundaries():
    quarter = application_schedule("1분기 중", reference_year=2027)
    assert (quarter["applicationStart"], quarter["applicationEnd"]) == (
        "2027-01-01", "2027-03-31",
    )
    rounds = application_schedule("상반기 1월 1일 ~ 2월 10일; 하반기 6월 1일 ~ 7월 10일",
                                  reference_year=2027, reference_month=7)
    assert rounds["applicationWindows"] == [
        {"applicationStart": "2027-01-01", "applicationEnd": "2027-02-10"},
        {"applicationStart": "2027-06-01", "applicationEnd": "2027-07-10"},
    ]
    assert (rounds["applicationStart"], rounds["applicationEnd"]) == (
        "2027-06-01", "2027-07-10",
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


def test_missing_year_uses_reference_year_and_numbered_period_is_recognized(monkeypatch):
    monkeypatch.setattr("app.modules.storage.application_dates.application_reference_year",
                        lambda: 2027)
    assert application_date_columns(
        {"application_period": "10월 1일 ~ 10월 31일"},
    ) == (date(2027, 10, 1), date(2027, 10, 31))
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
    expected = {
        "applicationStart": start,
        "applicationEnd": end,
        "scheduleStatus": "dated",
        "applicationPrecision": "month",
        "applicationMonths": months,
        "applicationYear": year,
    }
    if "매년" in period and year is None:
        expected["applicationRecurrence"] = "yearly"
    assert application_schedule(period, reference_year=2026) == expected
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
    "3~4월 / 추가 10월", "3~4월(예정)",
])
def test_unclear_month_periods_do_not_become_exact_dates(period):
    assert application_schedule(period) == {
        "applicationStart": None, "applicationEnd": None, "scheduleStatus": "unknown",
    }


@pytest.mark.parametrize("period,year,month,end", [
    ("매년 4월 말까지", 2027, 4, "2027-04-30"),
    ("신청 마감은 매년 4월 말까지입니다.", 2027, 10, "2027-04-30"),
    ("신청기한 : 매년 4월 말일까지 신청 가능합니다.", 2027, 10, "2027-04-30"),
    ("○ 접수기한: 매년 2월 말까지 접수", 2028, 2, "2028-02-29"),
    ("매년2월말까지접수", 2027, 2, "2027-02-28"),
    ("매년 3월까지", 2027, 3, "2027-03-31"),
    ("매년 2월까지", 2028, 2, "2028-02-29"),
    ("매년 5.31.까지", 2027, 5, "2027-05-31"),
    ("매년5월31일", 2027, 5, "2027-05-31"),
    ("매월 말일", 2028, 2, "2028-02-29"),
    ("매월 말일까지", 2027, 2, "2027-02-28"),
    ("신청기한: 매월 마지막 날 18시까지", 2027, 6, "2027-06-30"),
    ("2025년 4월 말까지", 2027, 4, "2025-04-30"),
    ("2028년 2월 말일", 2027, 2, "2028-02-29"),
])
def test_month_end_and_recurring_deadlines_never_acquire_a_missing_start(period, year, month, end):
    schedule = application_schedule(period, reference_year=year, reference_month=month)
    assert schedule["applicationStart"] is None
    assert schedule["applicationEnd"] == end
    assert schedule["scheduleStatus"] == "dated"
    if "매월" in period:
        assert schedule["applicationRecurrence"] == "monthly"
    elif "매년" in period:
        assert schedule["applicationRecurrence"] == "yearly"


@pytest.mark.parametrize("period,start,end", [
    ("매년 3월 1일부터 4월 말일까지", "2027-03-01", "2027-04-30"),
    ("신청기간은 3월 1일부터 4월 30일까지입니다.", "2027-03-01", "2027-04-30"),
    ("신청기간 : 3월 1일 - 4월 30일", "2027-03-01", "2027-04-30"),
    ("매년 3.1.∼4.30.", "2027-03-01", "2027-04-30"),
    ("매년 4월 1일~30일까지", "2027-04-01", "2027-04-30"),
    ("2026년 모집기간: '26.5.4.(월) ~ '26.5.20.(수)", "2026-05-04", "2026-05-20"),
    ("2026. 2. 2.~11. 30.(예산 집행상황에 따라 지원 마감일 변경될 수 있음)",
     "2026-02-02", "2026-11-30"),
    ("매년11월~12월신청", "2027-11-01", "2027-12-31"),
    ("매년9~10월 시도를 통해 공모", "2027-09-01", "2027-10-31"),
    ("매년6~8월중(연도별상이)", "2027-06-01", "2027-08-31"),
    ("2024.1~12월연중", "2024-01-01", "2024-12-31"),
    ("매년1분기", "2027-01-01", "2027-03-31"),
    ("매년 상반기", "2027-01-01", "2027-06-30"),
    ("매년 하반기", "2027-07-01", "2027-12-31"),
    ("2028년 제1분기", "2028-01-01", "2028-03-31"),
])
def test_application_windows_parse_source_prose_and_keep_explicit_years(period, start, end):
    schedule = application_schedule(period, reference_year=2027, reference_month=3)
    assert schedule["applicationStart"] == start
    assert schedule["applicationEnd"] == end
    assert schedule["scheduleStatus"] == "dated"


@pytest.mark.parametrize("period", [
    "연중신청가능", "연중 신청 가능", "연중수시", "연중수시신청",
    "출생 신고 후 언제든지 신청 가능", "연 중", "예산의 범위에서 수시 모집",
    "연중 (지자체별 예산 소진시 조기 마감)",
])
def test_explicit_ongoing_phrases_remain_without_fabricated_deadline(period):
    assert application_schedule(period) == {
        "applicationStart": None, "applicationEnd": None, "scheduleStatus": "ongoing",
    }


@pytest.mark.parametrize(("period", "year", "start", "end"), [
    ("사업연도 2월말까지", 2027, None, "2027-02-28"),
    ("사업연도 2월말까지", 2028, None, "2028-02-29"),
    ("당해연도 1월", 2027, "2027-01-01", "2027-01-31"),
    ("신청 기한: 해당연도 2월 말까지", 2028, None, "2028-02-29"),
    ("2월 이내", 2028, None, "2028-02-29"),
    ("2026년 2월 이내", 2028, None, "2026-02-28"),
])
def test_business_calendar_year_and_month_deadline_use_selected_year(period, year, start, end):
    schedule = application_schedule(period, reference_year=year)
    assert schedule["scheduleStatus"] == "dated"
    assert (schedule["applicationStart"], schedule["applicationEnd"]) == (start, end)


@pytest.mark.parametrize("period", [
    "매년 1월 ~ 재원소진 시까지(수시)", "매년 1월부터 상시 신청", "매년 1월~상시",
])
def test_budget_exhaustion_keeps_known_start_without_a_fabricated_end(period):
    for year in (2025, 2027, 2028):
        schedule = application_schedule(period, reference_year=year, reference_month=4)
        assert schedule == {
            "applicationStart": f"{year}-01-01", "applicationEnd": None,
            "scheduleStatus": "ongoing", "applicationYear": None,
            "applicationRecurrence": "yearly",
        }
    explicit = application_schedule("2025년 신청기간: 1월~예산 소진 시까지", reference_year=2027)
    assert explicit == {
        "applicationStart": "2025-01-01", "applicationEnd": None,
        "scheduleStatus": "ongoing", "applicationYear": 2025,
    }


@pytest.mark.parametrize(("period", "year", "month", "expected"), [
    ("상시신청(4월30일까지)", 2027, 4, "2027-04-30"),
    ("상시(2026.4.30까지)", 2027, 4, "2026-04-30"),
    ("연중 신청(매년 4월 말일까지)", 2027, 4, "2027-04-30"),
    ("수시 접수(매월 말일)", 2028, 2, "2028-02-29"),
    ("상시 신청(신청 마감: 4월30일)", 2027, 4, "2027-04-30"),
    ("상시 신청(4월30일 마감)", 2027, 4, "2027-04-30"),
    ("상시 신청(예산 소진 시까지, 4월30일까지)", 2027, 4, "2027-04-30"),
    ("2025년 신청기간: 상시 신청(4월30일까지)", 2027, 4, "2025-04-30"),
])
def test_ongoing_parentheses_keep_the_explicit_deadline(period, year, month, expected):
    schedule = application_schedule(period, reference_year=year, reference_month=month)
    assert schedule["scheduleStatus"] == "dated"
    assert schedule["applicationStart"] is None
    assert schedule["applicationEnd"] == expected


@pytest.mark.parametrize("period", [
    "상시(예산 소진시까지)", "상시 신청(예산 범위 내)", "연중 신청(예산범위내에서 신청 가능)",
    "상시 신청(온라인 신청 가능)",
])
def test_budget_and_operating_parentheses_without_dates_remain_ongoing(period):
    assert application_schedule(period)["scheduleStatus"] == "ongoing"


@pytest.mark.parametrize("period", [
    "상시(검진 다음해3/31까지)", "상시 신청(공고일로부터 1개월)",
    "상시 신청(기관 공고기한까지)", "상시 신청(4월30일)", "상시 신청(4월31일까지)",
])
def test_ongoing_parentheses_do_not_erase_unresolved_or_invalid_limits(period):
    assert application_schedule(period, reference_year=2027)["scheduleStatus"] == "unknown"


@pytest.mark.parametrize("period", [
    "지급일: 매년 4월 말까지", "발표일: 2027년 4월 30일", "당해 연도 1월경", "2개월 이내",
    "검진 다음해 3월 31일까지", "1월~2월초", "매년 2월 30일까지",
    "3월 31일~3월 1일", "4월 말까지 / 추가 5월까지",
])
def test_unresolved_reference_years_or_multiple_periods_are_not_guessed(period):
    assert application_schedule(period, reference_year=2027, reference_month=4) == {
        "applicationStart": None, "applicationEnd": None, "scheduleStatus": "unknown",
    }


def test_application_sentence_is_selected_without_using_payment_or_birth_dates():
    fields = {"text": ("지급일: 매년 5월 말까지\n"
                       "○ 신청 기간은 매년 4월 말일까지입니다.\n출생: 1990년")}
    value = application_period(fields)
    assert "신청 기간" in value
    assert application_schedule(value, reference_year=2027)["applicationEnd"] == "2027-04-30"


def test_cited_conditional_application_period_precedes_raw_ongoing_and_keeps_condition():
    overview = {"application_period": {"status": "specified", "text": "검진 다음해 3월 31일까지"}}
    value = resolved_application_period({"application_period": "상시신청"}, overview)
    assert value == "검진 다음해 3월 31일까지"
    assert application_schedule(value)["scheduleStatus"] == "unknown"
    overview["application_period"]["text"] = "출생 신고 후 언제든지 신청 가능"
    value = resolved_application_period({"application_period": "상시신청"}, overview)
    assert "출생 신고 후" in value
    assert application_schedule(value)["scheduleStatus"] == "ongoing"


@pytest.mark.parametrize("period,start,end", [
    ("신청기한: 매년 4월", None, "2027-04-30"),
    ("신청마감: 2026년 1분기", None, "2026-03-31"),
    ("접수시작일: 2027년 4월", "2027-04-01", None),
])
def test_single_month_label_preserves_start_or_deadline_semantics(period, start, end):
    result = application_schedule(period, reference_year=2027)
    assert result["applicationStart"] == start
    assert result["applicationEnd"] == end


def test_explicit_month_end_preserves_year_metadata():
    result = application_schedule("2028년 2월 말까지", reference_year=2027)
    assert result["applicationPrecision"] == "month_end"
    assert result["applicationYear"] == 2028
    assert "applicationRecurrence" not in result


def test_published_year_in_a_recruitment_label_is_explicit_application_evidence():
    fields = {"text": "발표: 2026년 5월 31일\n2026년 모집기간: '26.5.4.(월) ~ '26.5.20.(수)"}
    value = application_period(fields)
    schedule = application_schedule(value, reference_year=2027)
    assert schedule["applicationStart"] == "2026-05-04"
    assert schedule["applicationEnd"] == "2026-05-20"


@pytest.mark.parametrize("month,start,end", [
    (5, "2026-05-22", "2026-06-22"), (6, "2026-05-22", "2026-06-22"),
    (8, "2026-08-12", "2026-09-09"), (9, "2026-08-12", "2026-09-09"),
])
def test_separate_application_rounds_keep_each_window_and_select_query_month(month, start, end):
    schedule = application_schedule(
        "(1차)2026년 5월 22일~6월 22일 (2차)2026년 8월 12일~9월 9일",
        reference_year=2026, reference_month=month,
    )
    assert schedule["applicationStart"] == start
    assert schedule["applicationEnd"] == end
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2026-05-22", "applicationEnd": "2026-06-22"},
        {"applicationStart": "2026-08-12", "applicationEnd": "2026-09-09"},
    ]


def test_yearless_half_year_rounds_are_separate_and_keep_summer_gap():
    schedule = application_schedule(
        "(상반기)1월1일~2월10일 (하반기)6월1일~7월10일", reference_year=2027, reference_month=6,
    )
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2027-01-01", "applicationEnd": "2027-02-10"},
        {"applicationStart": "2027-06-01", "applicationEnd": "2027-07-10"},
    ]
    assert schedule["applicationStart"] == "2027-06-01"
    assert schedule["applicationEnd"] == "2027-07-10"
    assert schedule["applicationRecurrence"] == "yearly"


def test_yearly_nonadjacent_months_do_not_become_a_continuous_april_september_window():
    schedule = application_schedule("매년4월,9월", reference_year=2027, reference_month=9)
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2027-04-01", "applicationEnd": "2027-04-30"},
        {"applicationStart": "2027-09-01", "applicationEnd": "2027-09-30"},
    ]
    assert schedule["applicationStart"] == "2027-09-01"
    assert schedule["applicationEnd"] == "2027-09-30"
    assert schedule["applicationRecurrence"] == "yearly"


@pytest.mark.parametrize("today,start,end", [
    (date(2027, 3, 1), "2027-04-01", "2027-04-30"),
    (date(2027, 4, 20), "2027-04-01", "2027-04-30"),
    (date(2027, 7, 1), "2027-09-01", "2027-09-30"),
    (date(2027, 10, 1), "2027-09-01", "2027-09-30"),
])
def test_multiple_period_primary_selects_current_next_or_recent_past_without_source_mutation(
    today, start, end, monkeypatch,
):
    monkeypatch.setattr("app.modules.storage.application_dates.application_reference_date",
                        lambda: today)
    schedule = application_schedule("매년4월,9월", reference_year=2027)
    assert schedule["applicationStart"] == start
    assert schedule["applicationEnd"] == end


def test_incomplete_or_conditional_second_round_does_not_create_a_combined_window():
    result = application_schedule("(1차)매년4월 (2차)검진 다음해3월31일까지", reference_year=2027)
    assert result["scheduleStatus"] == "unknown"
    assert result["applicationStart"] is result["applicationEnd"] is None
