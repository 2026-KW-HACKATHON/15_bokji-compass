import pytest

from experiments.welfare_classification.contracts import BatchAnalysis, validate_evidence
from experiments.welfare_classification.rules import classify_field


def test_always_open_is_not_missing():
    result = classify_field("application_period", "상시신청")
    assert result["route"] == "code"
    assert result["resolved"] == "always_open"
    assert classify_field("selection", "")["resolved"] == "not_stated"


@pytest.mark.parametrize("value", ["2026-02-30 ~ 2026-03-01", "2026-05-01 ~ 2026-04-01"])
def test_invalid_period_goes_to_review(value):
    assert classify_field("application_period", value)["route"] == "llm"


def test_partial_or_relative_period_is_not_invented():
    assert classify_field("application_period", "5.1.~5.31.")["resolved"] is None
    assert classify_field("application_period", "해당사건 접수후")["route"] == "llm"


def test_explicit_applicant_age_is_a_candidate_with_unknown_reference_date():
    result = classify_field("eligibility", "신청자는 만 19세 이상")
    assert result["route"] == "code"
    assert result["resolved"]["subject"] == "applicant"
    assert result["resolved"]["reference_date"] is None


@pytest.mark.parametrize("value", [
    "만 19세 이상인 자녀가 있는 부모", "신청자는 만 19세 이상 또는 등록장애인",
    "신청자는 만 19세 이상, 단 학생 제외", "신청자는 만 190세 이상",
])
def test_compound_or_wrong_subject_is_not_auto_resolved(value):
    assert classify_field("eligibility", value)["route"] == "llm"


def test_keyword_tags_are_multiple_hints_and_never_a_pass():
    result = classify_field("selection", "부모 소득과 가구원 재산 및 자녀 나이를 확인")
    assert set(result["tag_hints"]) >= {"household", "income", "assets", "age"}
    assert result["route"] == "llm"
    assert "eligible" not in result


def test_unfounded_llm_quote_is_rejected():
    record = {"policy_key": "synthetic:1", "fields": {"selection": "조건 원문"}}
    result = BatchAnalysis.model_validate({"policies": [{
        "policy_key": "synthetic:1", "tags": ["other"], "conditions": [],
        "groups": [{"group_id": "g1", "relation": "unresolved", "description": "미확정",
                    "source_field": "selection", "evidence_quote": "발명된 근거"}],
        "coverage": "partial", "unresolved": ["검토"],
    }]})
    with pytest.raises(ValueError, match="Evidence"):
        validate_evidence(result, [record])


def test_missing_or_duplicated_llm_record_is_rejected():
    record = {"policy_key": "synthetic:1", "fields": {"selection": "조건 원문"}}
    with pytest.raises(ValueError, match="Missing"):
        validate_evidence(BatchAnalysis(policies=[]), [record])
