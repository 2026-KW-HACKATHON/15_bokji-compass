"""Official recipient gender supplements missing extraction without profile guesses."""

import pytest

from app.contracts.conditions import CanonicalPolicy
from app.modules.matching import public
from tests import test_matching as matching_tests

TODAY = matching_tests.TODAY
repository = matching_tests.repository


def audience_record(audience="폭력 피해 이주여성 및 동반 아동", *, gender=None,
                    **kwargs):
    row = matching_tests.record(**kwargs)
    row["source_json"]["fields"]["eligibility"] = audience
    if gender is not None:
        row["source_json"]["fields"]["gender"] = gender
    return row


@pytest.mark.parametrize("age,gender,state", [
    (40, "male", "mismatch"), (40, "female", "match"),
    (40, "undisclosed", "unknown"), (None, "male", "unknown"),
    (12, "male", "unknown"), (18, "male", "unknown"), (19, "male", "mismatch"),
])
def test_migrant_women_and_accompanying_children_respect_recipient_scope(age, gender, state):
    row = audience_record(gender="여성 대상", title="폭력 피해 이주여성 보호시설 운영 지원")
    facts = public.build_facts({"age": age, "gender": gender}, None)
    comparison = public.compare_policy(row, facts, today=TODAY)
    assert comparison["gender_guard"]["state"] == state
    assert comparison["checks"][-1]["field_key"] == "gender"
    assert comparison["checks"][-1]["quote"] in row["source_json"]["fields"][
        comparison["checks"][-1]["source_field"]]
    assert comparison["eligibility_decided"] is False
    if state == "mismatch":
        assert comparison["status"] == "not_matched"


@pytest.mark.parametrize("audience,member_gender", [
    ("경력단절여성", "male"), ("남성 대상", "female"),
    ("여아만 신청 가능", "male"), ("남자 청년", "female"),
])
def test_unambiguous_single_recipient_gender_rejects_opposite_gender(audience, member_gender):
    facts = public.build_facts({"age": 40, "gender": member_gender}, None)
    comparison = public.compare_policy(audience_record(audience), facts, today=TODAY)
    assert comparison["gender_guard"]["state"] == "mismatch"
    assert comparison["status"] == "not_matched"


@pytest.mark.parametrize("coverage,enabled", [("complete", True), ("partial", True),
                                             ("partial", False)])
def test_clear_source_gender_mismatch_is_excluded_even_if_other_conditions_need_review(
        coverage, enabled):
    row = audience_record("이주여성", coverage=coverage, enabled=enabled)
    comparison = public.compare_policy(row, public.MatchingFacts(gender="MALE"), today=TODAY)
    assert comparison["status"] == "not_matched"


@pytest.mark.parametrize("source_field", ["eligibility", "selection", "gender"])
def test_source_gender_is_read_from_dedicated_official_fields(source_field):
    row = matching_tests.record()
    row["source_json"]["fields"][source_field] = "여성 대상"
    guard = public.source_gender_guard(row, public.MatchingFacts(gender="MALE"))
    assert guard["state"] == "mismatch" and guard["source_field"] == source_field


@pytest.mark.parametrize("text", [
    "조건 검증\n지원대상: 폭력 피해 이주여성 및 동반 아동\n신청방법: 기관 문의",
    "조건 검증\n지원대상\n○ 폭력 피해 이주여성 및 동반 아동\n신청방법\n기관 문의",
    "조건 검증\n성별: 여성 대상\n지원내용: 교육",
    "조건 검증\n지원 대상: 이주여성\n신청 방법: 기관 문의",
    "조건 검증\n성별 조건: 여성 대상\n지원 내용: 교육",
])
def test_labelled_document_body_audience_is_source_evidence(text):
    row = matching_tests.record(text=text)
    guard = public.source_gender_guard(row, public.MatchingFacts(age_range=(40, 40), gender="MALE"))
    assert guard["state"] == "mismatch" and guard["source_field"] == "text"
    assert guard["quote"] in text


@pytest.mark.parametrize("audience", [
    "여성 우대", "여성 우선 지원", "여성 및 장애인", "여성 또는 청년",
    "여성 및 배우자", "여성의 부모", "여성가족부 선정 수행기관",
    "여성 보호시설 운영 법인", "성별 관계없이 주민 누구나 신청 가능",
    "남녀 모두", "남성 및 여성", "여성 제외",
    "여성·장애인", "여성ㆍ청년", "여성·청년", "여성 및 청년",
    "여성 (만 19세 이상) 및 청년", "여성(만 19세 이상)·청년", "여성 대상 및 청년",
])
def test_alternatives_institutions_and_other_recipients_are_not_gender_exclusions(audience):
    guard = public.source_gender_guard(audience_record(audience),
                                      public.MatchingFacts(age_range=(40, 40), gender="MALE"))
    assert guard is None


@pytest.mark.parametrize("audience", [
    "여성", "여성 전용", "여성 중 만 19세 이상인 자", "만 19세 이상 여성",
    "폭력 피해 이주여성 및 동반 아동", "폭력 피해 이주여성·동반 아동",
])
def test_qualifiers_and_accompanying_children_preserve_clear_adult_gender_requirement(audience):
    guard = public.source_gender_guard(audience_record(audience),
                                      public.MatchingFacts(age_range=(40, 40), gender="MALE"))
    assert guard["state"] == "mismatch"


def test_title_organization_benefits_and_unlabelled_body_are_not_gender_restrictions():
    row = matching_tests.record(title="여성가족부 여성 문화 사업",
                                text="조건 검증\n여성 상담과 남성 취업 상담을 제공합니다.")
    row["source_json"]["organization"] = "여성가족부"
    row["source_json"]["fields"]["benefits"] = "여성 상담 서비스"
    assert public.source_gender_guard(row, public.MatchingFacts(gender="MALE")) is None


@pytest.mark.parametrize("field,quote,expected", [
    ("eligibility", "폭력 피해 이주여성 및 동반 아동", "mismatch"),
    ("text", "이주여성 보호 대상", "mismatch"),
    ("text", "원문에 없는 여성", None),
    ("title", "여성 사업", None),
    ("organization", "여성가족부", None),
    ("benefits", "여성 상담", None),
])
def test_overview_gender_uses_actual_supported_audience_citation(field, quote, expected):
    row = matching_tests.record(title="여성 사업", text="조건 검증\n이주여성 보호 대상")
    row["source_json"]["organization"] = "여성가족부"
    row["source_json"]["fields"]["benefits"] = "여성 상담"
    if field == "eligibility":
        row["source_json"]["fields"][field] = quote
    row["draft_json"] = {"overview": {"gender_conditions": {
        "status": "specified", "text": "여성 대상",
        "evidence": [{"source_field": field, "quote": quote}],
    }}}
    guard = public.source_gender_guard(row, public.MatchingFacts(age_range=(40, 40), gender="MALE"))
    assert (guard["state"] if guard else None) == expected


def gender_condition(*, identifier="gender", subject="applicant", role="eligibility", state=1):
    return matching_tests.condition("gender", identifier=identifier, subject=subject, role=role,
                                    operator="EQ", state=state,
                                    value={"kind": "CATEGORY", "code": "FEMALE"})


def test_canonical_gender_or_other_matching_branch_is_not_flattened_into_female_only():
    female, age = gender_condition(), matching_tests.condition()
    logic = {"op": "any", "condition_id": None, "reason": None,
             "children": [matching_tests.leaf("gender"), matching_tests.leaf("c1")]}
    row = audience_record("여성 대상", conditions=[female, age], logic=logic)
    comparison = public.compare_policy(row, public.MatchingFacts(age_range=(40, 40), gender="MALE"),
                                       today=TODAY)
    assert comparison["gender_guard"] is None
    assert comparison["status"] == "potential_match"


def test_canonical_negated_female_exclusion_preserves_male_match():
    excluded = gender_condition(role="exclusion")
    logic = {"op": "not", "condition_id": None, "reason": None,
             "children": [matching_tests.leaf("gender")]}
    row = audience_record("여성 대상", conditions=[excluded], logic=logic)
    comparison = public.compare_policy(row, public.MatchingFacts(gender="MALE"), today=TODAY)
    assert comparison["gender_guard"] is None
    assert comparison["status"] == "potential_match"


@pytest.mark.parametrize("subject", ["child", "dependent_child", "parents", "household", "other"])
def test_explicit_other_recipient_gender_cannot_be_compared_to_account_gender(subject):
    row = audience_record("여아 대상", conditions=[gender_condition(subject=subject)])
    comparison = public.compare_policy(row, public.MatchingFacts(gender="MALE"), today=TODAY)
    assert comparison["gender_guard"] is None
    assert comparison["status"] == "needs_review"


def test_unknown_canonical_gender_does_not_disable_clear_source_gender_guard():
    row = audience_record("여성 대상", conditions=[gender_condition(state=9)], coverage="partial")
    guard = public.source_gender_guard(row, public.MatchingFacts(gender="MALE"),
                                      CanonicalPolicy.model_validate(row["canonical_json"]))
    assert guard["state"] == "mismatch"
    assert public.compare_policy(row, public.MatchingFacts(gender="MALE"),
                                 today=TODAY)["status"] == "not_matched"


def test_synthetic_source_check_never_collides_with_canonical_condition_id():
    row = audience_record("여성 대상", conditions=[
        matching_tests.condition(identifier="source-gender")])
    comparison = public.compare_policy(row, public.MatchingFacts(gender="MALE"), today=TODAY)
    ids = [check["condition_id"] for check in comparison["checks"]]
    assert len(set(ids)) == len(ids)


def test_home_recommendations_exclude_missing_extraction_women_only_for_known_male(repository):
    matching_tests.save_record(repository, audience_record("여성 대상", key="women"))
    matching_tests.save_record(repository, matching_tests.record(key="age-only"))
    result = public.recommend(repository, public.MatchingFacts(age_range=(40, 40), gender="MALE"),
                              today=TODAY)
    assert [item["policy"]["id"] for item in result["items"]] == ["notice:age-only"]


def test_unreported_gender_does_not_become_male_from_name_or_other_profile_fields():
    facts = public.build_facts({"age": 40, "name": "남성 이름", "gender": "undisclosed"}, None)
    comparison = public.compare_policy(audience_record("여성 대상"), facts, today=TODAY)
    assert facts.gender is None
    assert comparison["gender_guard"]["state"] == "unknown"
    assert comparison["status"] == "needs_review"
