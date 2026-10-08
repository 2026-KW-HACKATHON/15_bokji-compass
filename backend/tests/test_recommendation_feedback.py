"""Account feedback changes recommendation ordering without changing eligibility or progress."""

from copy import deepcopy

import pytest
from fastapi import HTTPException

from app.api import assistant_dialogue, recommendations
from app.modules.assistant import dialogue
from app.modules.assistant.dialogue_models import DialogueInput, DialogueStore
from app.modules.matching import public as matching
from app.modules.monitoring.feedback import personalize, topic_tokens
from app.modules.monitoring.storage import MonitoringStore, load_recommendation_feedback
from tests import test_assistant_dialogue as dialogue_tests
from tests import test_matching as matching_tests
from tests import test_monitoring_api as api_tests
from tests import test_monitoring_storage as storage_tests
from tests.test_matching import (
    condition,
    record,
    save_record,
)
from tests.test_monitoring_api import (
    PREFIX,
    TOKENS,
    save,
)
from tests.test_monitoring_storage import (
    ACCOUNT,
    OTHER,
    candidate,
    saved,
    scan,
)

repository = matching_tests.repository
client = api_tests.client
store = storage_tests.store
dialogue_repository = dialogue_tests.repository


def preference(policy, reason):
    return {"policy_id": policy["id"], "reason": reason,
            "category": policy.get("category", ""), "tokens": topic_tokens(policy)}


def items():
    return [{"policy": {"id": key, "title": title, "category": "일자리"}}
            for key, title in [("rejected", "산림 일자리"), ("similar", "산림 일자리 모집"),
                               ("different", "취업 상담")]]


def test_reason_changes_order_and_does_not_exclude_whole_category():
    original = items()
    eligible = preference(original[0]["policy"], "not_eligible")
    uninterested = {**eligible, "reason": "not_interested"}
    assert [item["policy"]["id"] for item in personalize(original, [eligible])] == [
        "similar", "different"]
    assert [item["policy"]["id"] for item in personalize(original, [uninterested])] == [
        "different", "similar"]
    assert original[0]["policy"]["id"] == "rejected"
    assert personalize(original, []) == original


def test_home_ranks_feedback_before_limiting_and_fills_excluded_results(repository):
    policies = []
    for item in items():
        policy = item["policy"]
        row = record([condition(state=0)], key=policy["id"], title=policy["title"],
                     category="일자리", text="조건 검증\n지원대상: 국민 누구나 신청 가능")
        save_record(repository, row)
        policies.append({**policy, "id": row["policy_key"]})
    result = matching.recommend(repository, matching.MatchingFacts(), limit=2,
                                feedback=[preference(policies[0], "not_interested")])
    assert [item["policy"]["id"] for item in result["items"]] == [
        policies[2]["id"], policies[1]["id"]]
    assert all(item["matching"]["eligibility_decided"] is False for item in result["items"])


def test_dialogue_fills_recommendations_after_exclusions_without_changing_profile(
        dialogue_repository):
    policies = []
    for index in range(14):
        row = dialogue_tests.general_record(f"medical-{index:02}", "의료비 지원")
        dialogue_repository.save(row)
        policies.append({"id": row["policy_key"], "title": row["title"], "category": "건강"})
    feedback = [preference(policy, "not_eligible") for policy in policies[:2]]
    context = DialogueStore()
    member = {"id": "dialogue-account", "age": 26, "region": "서울"}
    initial = dialogue.respond(dialogue_repository, member, DialogueInput(question="의료비 지원"),
                               context, feedback=feedback)
    result = dialogue.respond(dialogue_repository, member, DialogueInput(
        continuation=initial["continuation"], answer={"slot": "subject", "value": "self"}),
        context, feedback=feedback)
    assert result["catalog_status"] == "ready" and result["candidate_count"] == 12
    assert {item["policy_id"] for item in result["candidates"]} == {
        policy["id"] for policy in policies[2:]}
    assert result["profile_draft"] == initial["profile_draft"]
    assert result["confirmed_fields"] == [] and result["eligibility_decided"] is False


@pytest.mark.parametrize("reason", ["not_eligible", "not_interested"])
def test_feedback_persists_across_scans_topics_profile_edits_and_restore_without_progress_loss(
        store, reason):
    saved(store)
    initial = candidate()
    scan(store, [initial])
    store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "applied")
    before = store.read(ACCOUNT)
    rejected = store.set_candidate_feedback(ACCOUNT, "policy-1", "housing_repair", reason)
    assert rejected["profile"] == before["profile"]
    assert rejected["candidates"][0]["state"] == "applied"
    assert rejected["unread_count"] == 0
    assert rejected["recommendation_feedback"][0]["reason"] == reason
    changed = {**initial, "fingerprint": "b" * 64}
    second_topic = {**changed, "need_id": "another_need"}
    after = scan(store, [changed, second_topic])
    assert len(after["alerts"]) == 1
    assert all(item["recommendation_feedback"]["reason"] == reason for item in after["candidates"])
    assert MonitoringStore(store.engine).read(ACCOUNT)["recommendation_feedback"]
    store.merge_confirmed_profile(ACCOUNT, {"building_year": 1980})
    assert store.read(ACCOUNT)["recommendation_feedback"]
    scan(store, [changed, second_topic])
    restored = store.set_candidate_feedback(ACCOUNT, "policy-1", "another_need", None)
    assert restored["recommendation_feedback"] == []
    assert all(item["recommendation_feedback"] is None for item in restored["candidates"])
    assert all(item["state"] == "applied" for item in restored["candidates"])
    assert load_recommendation_feedback(store.engine, ACCOUNT) == []


def test_feedback_is_account_scoped_and_invalidates_a_late_worker(store):
    for account in (ACCOUNT, OTHER):
        saved(store, account)
        scan(store, account_id=account)
    before = store.read(ACCOUNT)
    other = deepcopy(store.read(OTHER))
    store.set_candidate_feedback(ACCOUNT, "policy-1", "housing_repair", "not_interested")
    late = store.record_scan(ACCOUNT, before["needs"], [candidate()],
                             expected_version=before["version"])
    assert late["version"] != before["version"] and late["recommendation_feedback"]
    assert store.read(OTHER) == other
    with pytest.raises(HTTPException) as error:
        store.set_candidate_feedback(OTHER, "foreign-policy", "housing_repair", "not_eligible")
    assert error.value.status_code == 404
    store.delete(ACCOUNT)
    assert load_recommendation_feedback(store.engine, ACCOUNT) == []


def test_api_rejects_foreign_identity_and_uses_persisted_feedback_in_home(client, monkeypatch):
    assert save(client, enabled=True).status_code == 200
    store = client.app.state.monitoring_store
    before = store.read("monitor-0")
    store.record_scan("monitor-0", before["needs"], [candidate()],
                      expected_version=before["version"])
    payload = {"policy_id": "policy-1", "need_id": "housing_repair", "reason": "not_interested"}
    result = client.post(PREFIX + "/candidates/feedback", json=payload)
    assert result.status_code == 200 and result.json()["recommendation_feedback"]
    assert client.post(PREFIX + "/candidates/feedback", json={
        **payload, "account_id": "monitor-1"}).status_code == 422
    assert client.post(PREFIX + "/candidates/feedback", json={
        **payload, "reason": "invented"}).status_code == 422
    received = []
    monkeypatch.setattr(recommendations, "get_repository", lambda request: object())

    def recommend(*args, **kwargs):
        received.extend(kwargs["feedback"])
        return {"items": []}

    monkeypatch.setattr(recommendations.public, "recommend", recommend)
    assert client.post("/v1/recommendations", json={"profile": {}}).status_code == 200
    assert received[0]["policy_id"] == "policy-1"
    received.clear()

    def respond(*args, **kwargs):
        received.extend(kwargs["feedback"])
        return {"candidates": [], "candidate_count": 0}

    monkeypatch.setattr(assistant_dialogue, "get_repository", lambda request: object())
    monkeypatch.setattr(assistant_dialogue, "respond", respond)
    assert client.post("/v1/assistant/dialogue", json={"question": "지원 안내"}).status_code == 200
    assert received[0]["reason"] == "not_interested"
    client.cookies.set("bokji_session", TOKENS[1])
    assert client.post(PREFIX + "/candidates/feedback", json=payload).status_code == 404
    client.cookies.set("bokji_session", TOKENS[0])
    restored = client.post(PREFIX + "/candidates/feedback", json={**payload, "reason": None})
    assert restored.status_code == 200 and restored.json()["recommendation_feedback"] == []
