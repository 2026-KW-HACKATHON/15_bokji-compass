"""Recorded non-age audiences remain visible without rewriting eligibility results."""

from copy import deepcopy
from datetime import datetime

from app.modules.storage.catalog import card


def record(fields=None, overview=None, editorial=None):
    return {"policy_key": "test:assistive-equipment", "revision_id": "test-revision",
            "created_at": datetime(2026, 10, 8), "category": None,
            "source_json": {"title": "보조공학기기 지원", "organization": "검증 기관",
                            "source_url": None, "fields": fields or {}},
            "draft_json": {"overview": overview or {}, "editorial": editorial or {}}}


def test_business_owner_target_survives_missing_age_and_other_summary():
    target = "○ 장애인기업 중 1인 중증장애인 사업주"
    selection = "○ 평가우수자 선정"
    value = record({"eligibility": target, "selection": selection,
                    "benefits": "점자단말기 등 물품가액 5백만원 한도 지원(자부담 10%)"},
                   {"age_conditions": {"status": "not_stated", "text": None},
                    "other_conditions": []})
    before = deepcopy(value)
    result = card(value, full=True)
    assert result["audience"] == target
    assert result["otherConditions"] == [target, selection]
    assert result["category"] == "사업·창업"
    assert result["sourceFields"]["eligibility"] == target
    assert value == before


def test_entire_target_keeps_age_disability_and_exclusions_together():
    target = "만 19세 이상 등록장애인 사업주, 휴업 기업 제외"
    value = record({"eligibility": target},
                   {"age_conditions": {"status": "specified", "text": "만 19세 이상"}})
    assert card(value)["audience"] == target


def test_verified_legacy_other_conditions_supply_target_without_duplicate_raw_list():
    target = "1인 중증장애인 사업주"
    overview = {"other_conditions": [{"text": target,
                "evidence": [{"source_field": "eligibility", "quote": target}]}]}
    value = record({"selection": "평가우수자 선정"}, overview)
    assert card(value)["audience"] == target
    assert card(value)["otherConditions"] == [target]


def test_known_stored_requirement_fills_omitted_target_but_unknown_does_not():
    target = "등록장애인 사업주"
    rows = [{"condition_type": "other", "information_state": "specified",
             "evidence_text": target},
            {"condition_type": "other", "information_state": "unknown",
             "evidence_text": "청년 여부 확인 필요"}]
    value = record(overview={"policy_requirements": rows})
    assert card(value)["audience"] == target
    assert card(value)["otherConditions"] == [target]
    value["draft_json"]["overview"]["policy_requirements"] = rows[1:]
    assert card(value)["audience"] == "지원 대상 확인 필요"
    assert card(value)["otherConditions"] == []


def test_explicit_admin_display_edit_and_existing_age_only_records_are_preserved():
    overview = {"age_conditions": {"status": "specified", "text": "관리자 확인 대상"}}
    value = record({"eligibility": "기존 대상"}, overview, {"age": "관리자 확인 대상"})
    assert card(value)["audience"] == "관리자 확인 대상"
    assert card(record(overview={"age_conditions": {
        "status": "specified", "text": "만 19세 이상"}}))["audience"] == "만 19세 이상"


def test_benefits_and_contact_text_never_become_audience():
    value = record({"benefits": "청년·장애인 우대", "contact": "기업 담당 부서 문의"})
    assert card(value)["audience"] == "지원 대상 확인 필요"
    assert card(value)["otherConditions"] == []
