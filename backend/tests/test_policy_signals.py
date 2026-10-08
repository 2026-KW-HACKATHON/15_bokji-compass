"""Official source percentages are distinct from guessed budget availability."""

from copy import deepcopy

import pytest

from app.modules.presentation.public import policy_signals


def record(text, url="https://example.gov/notice"):
    return {"source_json": {"source_url": url, "fields": {"text": text}}}


def test_explicit_budget_ratio_keeps_source_quote_date_and_does_not_mutate():
    source = record("예산 소진율: 72.5%\n예산 기준일: 2026-10-06\n예산 소진 시 조기 마감")
    before = deepcopy(source)
    result = policy_signals(source)
    assert result["budget"] == {
        "usedPercent": 72.5, "sourceUrl": "https://example.gov/notice",
        "asOf": "2026-10-06", "evidence": "예산 소진율: 72.5%",
    }
    assert result["budgetNotice"] == "예산 소진 시 조기 마감"
    assert source == before


@pytest.mark.parametrize("text", [
    "예산 소진 시 마감", "지원비의 80% 지원", "예산: 100억원",
    "예산 소진율: 80%가 되면 마감", "예산 소진율: 80% 예정",
    "예산 소진율: -1%", "예산 소진율: 101%",
    "예산 소진율: 50%\n예산 소진율: 60%",
    "예산 소진율: 50%\n예산 소진율: 101%",
    "예산 집행률: 80%",
])
def test_warning_threshold_conflict_or_other_percentage_never_becomes_ratio(text):
    assert "budget" not in policy_signals(record(text))


@pytest.mark.parametrize("url", [
    None, "javascript:alert(1)", "http://example.gov/a", "https://user:pass@example.gov/a",
])
def test_budget_needs_usable_source_reference(url):
    assert policy_signals(record("예산 소진율: 50%", url=url)) == {}


def test_conflicting_budget_dates_do_not_invent_an_observation_date():
    result = policy_signals(record(
        "예산 소진률: 0%\n예산 기준일: 2026-10-01\n예산 기준일: 2026-10-02"))
    assert result["budget"]["usedPercent"] == 0
    assert result["budget"]["asOf"] is None


def test_real_popularity_is_preserved_even_without_budget_source_url():
    popularity = {"views": 0, "source": "gov24", "basis": "provider_cumulative_views",
                  "asOf": None}
    assert policy_signals(record("상시 신청", url=None), popularity=popularity) == {
        "popularity": popularity}
