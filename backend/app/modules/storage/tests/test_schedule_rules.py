from copy import deepcopy

import pytest

from app.modules.storage.application_dates import application_schedule, resolved_application_period
from app.modules.storage.schedule_rules import build_calendar_rule, resolve_calendar_schedule


def _source(text, *, quote=None, source_field="text"):
    quote = quote or text
    period = {
        "status": "specified", "text": text,
        "evidence": [{"source_field": source_field, "quote": quote}],
        "unresolved_reason": None,
    }
    fields = {source_field: "공고 제목\n" + quote + "\n문의: 담당 기관"}
    return fields, {"application_period": period}


@pytest.mark.parametrize(("text", "expression", "year", "month", "start", "end", "status"), [
    ("매년 4월 말일까지 신청을 받아요.", "매년 4월 말까지", 2027, 4,
     None, "2027-04-30", "dated"),
    ("매월 말일까지 신청을 받아요.", "매월 말일", 2028, 2,
     None, "2028-02-29", "dated"),
    ("3~4월 동안 신청을 받아요.", "3~4월", 2025, 3,
     "2025-03-01", "2025-04-30", "dated"),
    ("접수는 25년 4월 1일부터 4월 30일까지 운영됩니다.",
     "2025년 4월 1일~4월 30일", 2027, 4, "2025-04-01", "2025-04-30", "dated"),
    ("접수는 '25.4.1.부터 '25.4.30.까지 운영됩니다.",
     "2025.4.1.~2025.4.30.", 2027, 4, "2025-04-01", "2025-04-30", "dated"),
    ("접수는 2026년 4월 1일부터 30일까지 운영됩니다.",
     "2026년 4월 1일~4월 30일", 2027, 4, "2026-04-01", "2026-04-30", "dated"),
    ("2026.1.~12.(※예산 집행상황에 따라 접수기간이 변경될 수 있음)",
     "2026년 1~12월", 2027, 4, "2026-01-01", "2026-12-31", "dated"),
    ("연중 수시로 신청할 수 있어요.", "상시 신청", 2027, 4, None, None, "ongoing"),
    ("언제든지 신청을 받아요.", "상시 신청", 2027, 4, None, None, "ongoing"),
    ("상시 신청을 받으며 예산 소진시까지 운영됩니다.", "상시 신청", 2027, 4,
     None, None, "ongoing"),
    ("수시로 신청을 받아요.", "상시 신청", 2027, 4, None, None, "ongoing"),
    ("사업연도 2월 말까지 신청을 받아요.", "2월 말까지", 2028, 2,
     None, "2028-02-29", "dated"),
    ("당해연도 1월에 신청을 받아요.", "1월", 2027, 8,
     "2027-01-01", "2027-01-31", "dated"),
    ("해당연도 1월에 신청을 받아요.", "1월", 2027, 8,
     "2027-01-01", "2027-01-31", "dated"),
])
def test_cited_prose_uses_canonical_expression_without_rewriting_source(
    text, expression, year, month, start, end, status,
):
    fields, overview = _source(text)
    originals = deepcopy((fields, overview))
    assert application_schedule(text)["scheduleStatus"] == "unknown"
    rule = build_calendar_rule(overview["application_period"], expression, fields)
    assert rule == {"expression": expression, "period": overview["application_period"]}
    schedule = resolve_calendar_schedule(fields, overview, rule, year, month)
    actual = (schedule["applicationStart"], schedule["applicationEnd"], schedule["scheduleStatus"])
    assert actual == (
        start, end, status,
    )
    assert resolved_application_period(fields, overview) == text
    assert (fields, overview) == originals


@pytest.mark.parametrize(("text", "expression"), [
    ("3~4월 동안 신청을 받아요.", "2026년 3~4월"),
    ("3~4월 동안 신청을 받아요.", "3월 1일~4월 30일"),
    ("3~4월 동안 신청을 받아요.", "٤월"),
    ("3~4월에 1인당 30만원 지원하여 신청을 받아요.", "3월 1일~4월 30일"),
    ("4월 25일까지 신청을 받아요.", "2025년 4월 25일까지"),
    ("4월 1일부터 4월 30일까지 신청을 받아요.", "4월 1일~4월 31일"),
    ("4월 동안 신청을 받아요.", "매월 말일"),
    ("신청은 기관 안내에 따라 접수합니다.", "상시 신청"),
    ("상시 신청하되 4월 30일 마감합니다.", "상시 신청"),
    ("연중 신청하되 공고 기한까지 접수합니다.", "상시 신청"),
    ("언제든지 신청하되 2026-04-30까지 접수합니다.", "상시 신청"),
    ("검진 다음해 3월 31일까지 신청을 받아요.", "3월 31일까지"),
    ("출생 후 3월 31일까지 신청을 받아요.", "3월 31일까지"),
    ("출생 신고 후 언제든지 신청을 받아요.", "상시 신청"),
    ("전년도 4월 30일까지 신청을 받아요.", "4월 30일까지"),
    ("공고 후 3개월 이내 신청을 받아요.", "3월까지"),
    ("공고일로부터 1개월 신청을 받아요.", "1월"),
    ("출생일로부터 3개월 신청을 받아요.", "3월"),
    ("1개월 동안 신청을 받아요.", "1월"),
    ("신청인 3명에게 지원합니다.", "3월"),
    ("2025년 4월 1일부터 4월 30일까지 신청을 받아요.", "4월 1일~4월 30일"),
    ("2026년 4월 1일부터 5월 30일까지 신청을 받아요.", "2026년 4월 30일~5월 1일"),
    ("2025년 4월 1일부터 2026년 5월 30일까지 신청을 받아요.",
     "2025년 5월 30일~2026년 4월 1일"),
    ("매년 4월 말일까지 신청을 받아요.", "일정은 아직 미정"),
])
def test_rule_rejects_invented_dates_and_removed_constraints(text, expression):
    fields, overview = _source(text)
    assert build_calendar_rule(overview["application_period"], expression, fields) is None


@pytest.mark.parametrize(("text", "expression"), [
    ("매년 1월 ~ 재원소진 시까지(수시)", "매년 1월부터 상시 신청"),
    ("매년 1월 ~ 재원소진 시까지(수시)", "매년 1월~상시"),
    ("2026년 4월 1일~예산 소진 시까지(수시)", "2026년 4월 1일부터 상시 신청"),
    ("수시 모집", "상시 신청"),
    ("예산범위내 수시모집", "상시 신청"),
    ("사업연도 2월 말까지", "2월 말까지"),
    ("당해연도 1월", "1월"),
    ("해당연도 1월", "1월"),
])
def test_known_source_schedule_allows_only_the_same_calendar_expression(text, expression):
    fields, overview = _source(text)
    originals = deepcopy((fields, overview))
    rule = build_calendar_rule(overview["application_period"], expression, fields)
    assert rule is not None
    for year, month in ((2027, 8), (2028, 2)):
        source_schedule = application_schedule(text, reference_year=year, reference_month=month)
        expression_schedule = application_schedule(expression, reference_year=year,
                                                   reference_month=month)
        assert source_schedule["scheduleStatus"] != "unknown"
        assert expression_schedule == source_schedule
        assert resolve_calendar_schedule(fields, overview, rule, year, month) == source_schedule
    assert (fields, overview) == originals


@pytest.mark.parametrize(("text", "expression"), [
    ("매년 1월 ~ 재원소진 시까지(수시)", "상시 신청"),
    ("매년 1월 ~ 재원소진 시까지(수시)", "매년 1월"),
    ("2026년 4월 1일~예산 소진 시까지(수시)", "2026년 상시 신청"),
    ("상시(매년 4월 30일 마감)", "상시 신청"),
    ("수시 모집(4월 30일까지)", "상시 신청"),
    ("매년 4월 1일부터 4월 30일까지", "매년 4월 30일까지"),
    ("사업연도 2월 말까지", "2월"),
    ("해당연도 1월", "1월부터 상시 신청"),
    ("당해연도 1월", "매년 1월"),
    ("해당연도 1월", "매년 1월"),
])
def test_expression_cannot_drop_a_native_endpoint_or_add_a_finite_deadline(text, expression):
    fields, overview = _source(text)
    originals = deepcopy((fields, overview))
    assert build_calendar_rule(overview["application_period"], expression, fields) is None
    assert (fields, overview) == originals


def test_short_period_text_cannot_hide_a_start_in_its_full_source_quote():
    quote = "매년 1월부터 상시 신청"
    fields, overview = _source("상시 신청", quote=quote)
    assert build_calendar_rule(overview["application_period"], "상시 신청", fields) is None


def test_equivalent_ongoing_quote_cannot_override_a_second_finite_source_quote():
    fields, overview = _source("상시 신청")
    fields["deadline"] = "수시 모집(4월 30일까지)"
    overview["application_period"]["evidence"].append({
        "source_field": "deadline", "quote": fields["deadline"],
    })
    assert build_calendar_rule(overview["application_period"], "상시 신청", fields) is None


@pytest.mark.parametrize("change", [
    "missing_field", "wrong_quote", "uncited_text", "empty_evidence", "invalid_evidence",
    "not_specified", "unresolved", "non_string_source", "extra_field",
])
def test_every_evidence_item_and_period_structure_must_match_source(change):
    fields, overview = _source("매년 4월 말일까지 신청을 받아요.")
    period = overview["application_period"]
    if change == "missing_field":
        period["evidence"].append({"source_field": "missing", "quote": period["text"]})
    elif change == "wrong_quote":
        period["evidence"].append({"source_field": "text", "quote": "새로 만든 근거"})
    elif change == "uncited_text":
        period["text"] = "원문에 없는 신청 기간"
    elif change == "empty_evidence":
        period["evidence"] = []
    elif change == "invalid_evidence":
        period["evidence"] = [None]
    elif change == "not_specified":
        period["status"] = "unclear"
    elif change == "unresolved":
        period["unresolved_reason"] = "기준 불명확"
    elif change == "non_string_source":
        fields["text"] = None
    elif change == "extra_field":
        period["inferred_date"] = "2027-04-30"
    assert build_calendar_rule(period, "매년 4월 말까지", fields) is None


@pytest.mark.parametrize("expression", [None, "", "  ", 123, {}, []])
def test_invalid_expression_returns_none(expression):
    fields, overview = _source("매년 4월 말일까지 신청을 받아요.")
    assert build_calendar_rule(overview["application_period"], expression, fields) is None


@pytest.mark.parametrize("native", ["3~4월", "상시신청", "2025년 4월 1일~4월 30일"])
def test_original_parseable_period_always_precedes_calendar_rule(native):
    fields, overview = _source(native)
    injected = {"expression": "2027년 8월 1일~8월 31일", "period": overview["application_period"]}
    assert resolve_calendar_schedule(fields, overview, injected, 2027, 4) == application_schedule(
        native, reference_year=2027, reference_month=4,
    )


def test_native_raw_period_also_wins_when_overview_has_no_period():
    fields = {"application_period": "3~4월"}
    assert resolve_calendar_schedule(fields, {}, {"expression": "상시"}, 2027, 4) == (
        application_schedule("3~4월", reference_year=2027, reference_month=4)
    )


def test_rule_is_revalidated_and_must_match_current_overview_period():
    fields, overview = _source("매년 4월 말일까지 신청을 받아요.")
    rule = build_calendar_rule(overview["application_period"], "매년 4월 말까지", fields)
    mismatch = deepcopy(overview)
    mismatch["application_period"]["text"] = "매년 5월 말일까지 신청을 받아요."
    assert resolve_calendar_schedule(fields, mismatch, rule)["scheduleStatus"] == "unknown"
    assert resolve_calendar_schedule({"text": "변경된 원문"}, overview, rule)["scheduleStatus"] == (
        "unknown"
    )
    rule["expression"] = "매년 5월 말까지"
    assert resolve_calendar_schedule(fields, overview, rule)["scheduleStatus"] == "unknown"


def test_rule_keeps_separate_rounds_and_query_month_selects_primary():
    text = "접수는 매년 4월과 9월 두 번 받습니다."
    fields, overview = _source(text)
    rule = build_calendar_rule(overview["application_period"], "매년 4월, 9월", fields)
    assert rule is not None
    schedule = resolve_calendar_schedule(fields, overview, rule, 2027, 9)
    assert (schedule["applicationStart"], schedule["applicationEnd"]) == (
        "2027-09-01", "2027-09-30",
    )
    assert schedule["applicationWindows"] == [
        {"applicationStart": "2027-04-01", "applicationEnd": "2027-04-30"},
        {"applicationStart": "2027-09-01", "applicationEnd": "2027-09-30"},
    ]


def test_new_overview_calendar_expression_uses_same_guard_and_query_context():
    fields, overview = _source("매월 말일까지 신청을 받아요.")
    overview["calendar_expression"] = "매월 말일"
    result = resolve_calendar_schedule(fields, overview, reference_year=2028, reference_month=2)
    assert result["applicationEnd"] == "2028-02-29"
    assert result["applicationRecurrence"] == "monthly"
    overview["calendar_expression"] = "2028년 2월 29일까지"
    assert resolve_calendar_schedule(fields, overview)["scheduleStatus"] == "unknown"


def test_native_period_wins_over_new_overview_calendar_expression():
    fields, overview = _source("매년 4월 말까지")
    overview["calendar_expression"] = "매년 5월 말까지"
    assert resolve_calendar_schedule(fields, overview, reference_year=2027)["applicationEnd"] == (
        "2027-04-30"
    )


def test_invalid_explicit_rule_cannot_be_replaced_by_overview_expression():
    fields, overview = _source("매년 4월 말일까지 신청을 받아요.")
    overview["calendar_expression"] = "매년 4월 말까지"
    assert resolve_calendar_schedule(fields, overview, {})["scheduleStatus"] == "unknown"


def test_rule_preserves_cross_year_month_range_and_leap_month_end():
    fields, overview = _source("매년 11~2월 동안 접수받아요.")
    rule = build_calendar_rule(overview["application_period"], "매년 11~2월", fields)
    assert rule is not None
    schedule = resolve_calendar_schedule(fields, overview, rule, 2028, 2)
    assert (schedule["applicationStart"], schedule["applicationEnd"]) == (
        "2027-11-01", "2028-02-29",
    )


def test_invalid_container_shapes_are_safe_and_builder_does_not_alias_period():
    assert resolve_calendar_schedule(None, None, None)["scheduleStatus"] == "unknown"
    assert build_calendar_rule(None, "상시", {}) is None
    assert build_calendar_rule({}, "상시", None) is None
    fields, overview = _source("매년 4월 말일까지 신청을 받아요.")
    rule = build_calendar_rule(overview["application_period"], "매년 4월 말까지", fields)
    rule["period"]["evidence"].clear()
    assert overview["application_period"]["evidence"]
