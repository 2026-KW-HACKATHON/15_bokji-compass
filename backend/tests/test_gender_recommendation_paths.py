"""Known personal gender mismatches stay excluded across recommendation entry points."""

from copy import deepcopy
from uuid import uuid4

import pytest

from app.contracts.conditions import CanonicalPolicy
from app.modules.assistant import dialogue_search
from app.modules.assistant.dialogue_models import DialogueStore
from app.modules.matching import public as matching
from app.modules.monitoring import public as monitoring
from app.modules.monitoring.models import MonitoringProfile
from tests import test_assistant_dialogue as dialogue_tests
from tests import test_matching as matching_tests

repository = dialogue_tests.repository
stable_date = dialogue_tests.stable_date
TODAY = dialogue_tests.TODAY
MALE = {**dialogue_tests.MEMBER, "gender": "male", "age": 30}
FEMALE = {**MALE, "gender": "female"}
NEED = {"id": "employment_support", "title": "취업 지원 찾기", "keywords": ["취업 정보"]}


def notice(key="women", *, period="상시", partial=False, audience=None):
    row = matching_tests.record(
        key=key, title="폭력 피해 이주여성 보호시설 운영 지원", category="일자리", period=period,
        enabled=not partial, coverage="partial" if partial else "complete")
    row["revision_id"] = str(uuid4())
    row["source_json"]["fields"].update({
        "eligibility": audience or "○ 가정폭력·성폭력·성매매 등 폭력 피해 이주여성 및 동반 아동",
        "benefits": "숙식·상담·치료·의료지원·취업 정보 제공, 동반 아동 주거 지원",
    })
    return row


def scan(repository, member):
    return monitoring.scan_candidates(repository, member, MonitoringProfile(), [NEED], today=TODAY)


def general(repository, member):
    plan = dialogue_search.prepare_search("보호시설 지원", repository)
    return dialogue_search.general_candidates(repository, plan, member, MonitoringProfile())


@pytest.mark.parametrize("partial", [False, True])
@pytest.mark.parametrize("period", ["상시", "2026-11-01 ~ 2026-11-30"])
def test_source_women_and_accompanying_children_excludes_known_adult_man_everywhere(
        repository, partial, period):
    row = notice(partial=partial, period=period)
    repository.save(row)
    assert scan(repository, MALE) == []
    assert general(repository, MALE) == []
    home = matching.recommend(repository, matching.build_facts(MALE, None), today=TODAY)
    assert home["items"] == []
    # A missing extraction must not hide the notice from the relevant audience.
    assert [item["policy_id"] for item in scan(repository, FEMALE)] == [row["policy_key"]]
    assert [item["policy_id"] for item in general(repository, FEMALE)] == [row["policy_key"]]


def test_wrong_gender_notice_does_not_consume_general_search_result_limit(repository):
    excluded = [notice(f"women-{index}") for index in range(14)]
    relevant = notice("unrestricted", audience="성별과 관계없이 폭력 피해 주민")
    repository.save(*excluded, relevant)
    assert [item["policy_id"] for item in general(repository, MALE)] == [relevant["policy_key"]]
    assert [item["policy_id"] for item in scan(repository, MALE)] == [relevant["policy_key"]]


@pytest.mark.parametrize("gender", [None, "undisclosed"])
def test_missing_gender_retains_review_candidate_without_inferred_sex(repository, gender):
    row = notice()
    repository.save(row)
    member = {**MALE, "gender": gender}
    for candidates in (scan(repository, member), general(repository, member)):
        assert len(candidates) == 1
        assert candidates[0]["status"] == "needs_review"
        assert candidates[0]["eligibility_decided"] is False


@pytest.mark.parametrize("subject", ["other", "hypothetical"])
def test_dialogue_for_someone_else_does_not_use_male_account_gender(repository, subject):
    row = notice()
    repository.save(row)
    store = DialogueStore()
    initial = dialogue_tests.ask(
        store, "보호시설 지원", member=MALE, repository=repository)
    personal = dialogue_tests.reply(store, initial, "self", member=MALE, repository=repository)
    assert personal["catalog_status"] == "ready"
    assert personal["candidates"] == []
    store = DialogueStore()
    initial = dialogue_tests.ask(
        store, "보호시설 지원", member=MALE, repository=repository)
    result = dialogue_tests.reply(store, initial, subject, member=MALE, repository=repository)
    assert [item["policy_id"] for item in result["candidates"]] == [row["policy_key"]]
    assert result["candidates"][0]["status"] == "needs_review"
    assert result["can_save_profile"] is False


def test_selected_notice_reports_gender_mismatch_without_recommending_it(repository):
    row = notice(partial=True)
    repository.save(row)
    store = DialogueStore()
    initial = dialogue_tests.ask(store, "지원 받을 수 있어?", member=MALE,
                                 repository=repository, revision_id=row["revision_id"])
    result = dialogue_tests.reply(store, initial, "self", member=MALE, repository=repository)
    compared = result["selected_policy"]["comparison"]
    assert compared["status"] == "not_matched"
    assert any(check["field_key"] == "gender" and check["state"] == "mismatch"
               for check in compared["checks"])
    assert "맞지 않는 조건" in result["answer"]
    assert compared["eligibility_decided"] is False
    assert result["candidates"] == []


def test_upcoming_schedule_cannot_override_source_gender_mismatch():
    row = notice(period="2026-11-01 ~ 2026-11-30")
    comparison = matching.compare_policy(row, matching.build_facts(MALE, None), today=TODAY)
    canonical = CanonicalPolicy.model_validate(deepcopy(row["canonical_json"]))
    assert monitoring._logic_state(canonical, comparison, upcoming=True, today=TODAY) is False
