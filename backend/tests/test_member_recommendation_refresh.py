"""A changed account fact immediately retires recommendations from the old facts."""

import json
from datetime import timedelta

import pytest
from sqlalchemy import event, insert, select, update

from app.api.auth import ProfileInput
from app.modules.auth.models import accounts
from app.modules.monitoring import storage
from tests import test_matching as matching_tests
from tests import test_monitoring_storage as storage_tests

store = storage_tests.store
repository = matching_tests.repository
ACCOUNT = storage_tests.ACCOUNT
OTHER = storage_tests.OTHER
TOKEN = storage_tests.TOKEN
candidate = storage_tests.candidate
saved = storage_tests.saved
scan = storage_tests.scan


@pytest.mark.parametrize("change", [
    {"gender": "male"}, {"gender": "female"}, {"age": 67}, {"region": "부산"},
])
def test_matching_account_fact_retires_old_candidates_and_unread_alerts(store, change):
    saved(store)
    before = scan(store, [candidate(), candidate("policy-2")])
    other_before = saved(store, OTHER)
    other_before = scan(store, account_id=OTHER)

    store.auth_service.update_profile(ACCOUNT, ProfileInput(**change), token=TOKEN)

    after = store.read(ACCOUNT)
    assert after["candidates"] == []
    assert after["enabled"] is True
    assert after["profile"] == before["profile"]
    assert after["last_checked_at"] is None
    assert after["version"] != before["version"]
    assert after["unread_count"] == 0
    assert all(item["read"] for item in after["alerts"])
    assert store.read(OTHER) == other_before
    assert store.record_scan(ACCOUNT, before["needs"], [candidate("late-policy")],
                             expected_version=before["version"]) == after


@pytest.mark.parametrize("change", [
    {"name": "김복지"}, {"gender": "undisclosed"}, {"age": 28}, {"region": "서울"},
])
def test_non_matching_or_identical_account_fact_preserves_candidates(store, change):
    saved(store)
    before = scan(store)
    store.auth_service.update_profile(ACCOUNT, ProfileInput(**change), token=TOKEN)
    assert store.read(ACCOUNT) == before


def test_account_gender_change_preserves_application_and_preparation_history(store):
    saved(store)
    item = candidate()
    item["policy"].update({"revisionId": "source-v1", "applicationGuide": {
        "documentsStatus": "listed", "documents": [{"id": "doc-1", "label": "주민등록등본"}],
    }})
    scan(store, [item])
    store.set_candidate_state(ACCOUNT, item["policy_id"], item["need_id"], "applied")
    store.set_candidate_preparation(ACCOUNT, item["policy_id"], item["need_id"],
                                    "source-v1", "doc-1", True)
    store.set_candidate_feedback(ACCOUNT, item["policy_id"], item["need_id"], "not_interested")
    before = store.read(ACCOUNT)

    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="male"), token=TOKEN)
    after = store.read(ACCOUNT)

    assert after["recommendation_feedback"] == before["recommendation_feedback"]
    assert len(after["candidates"]) == 1
    history = after["candidates"][0]
    assert history["active"] is False
    assert history["application_state"] == "applied"
    assert history["application_preparation"] == {
        "revision_id": "source-v1", "prepared_document_ids": ["doc-1"],
    }
    assert history["recommendation_feedback"] == before["candidates"][0]["recommendation_feedback"]


def test_gender_becoming_undisclosed_does_not_permanently_exclude_a_policy(store):
    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="male"), token=TOKEN)
    saved(store)
    before = scan(store)
    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="undisclosed"), token=TOKEN)
    after = store.read(ACCOUNT)
    assert after["candidates"] == []
    assert after["recommendation_feedback"] == []
    refreshed = scan(store)
    assert refreshed["candidates"][0]["active"] is True
    assert refreshed["candidates"][0]["policy_id"] == before["candidates"][0]["policy_id"]


def test_gender_change_keeps_excluded_watching_candidate_available_for_undo(store):
    saved(store)
    scan(store)
    store.set_candidate_feedback(ACCOUNT, "policy-1", "housing_repair", "not_eligible")
    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="male"), token=TOKEN)
    after = store.read(ACCOUNT)
    assert len(after["candidates"]) == 1
    assert after["candidates"][0]["active"] is False
    assert after["candidates"][0]["recommendation_feedback"]["reason"] == "not_eligible"
    restored = store.set_candidate_feedback(ACCOUNT, "policy-1", "housing_repair", None)
    assert restored["candidates"] == []
    assert restored["recommendation_feedback"] == []


def test_matching_account_fact_edit_keeps_monitoring_paused(store):
    saved(store)
    scan(store)
    store.set_enabled(ACCOUNT, False)
    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="female"), token=TOKEN)
    after = store.read(ACCOUNT)
    assert after["enabled"] is False
    assert after["candidates"] == []
    assert after["last_checked_at"] is None


def test_invalidated_candidate_data_is_preserved_without_creating_a_profile(store):
    before = store.read(ACCOUNT)
    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="male"), token=TOKEN)
    assert store.read(ACCOUNT) == before
    saved(store)
    scan(store)
    with store.engine.begin() as connection:
        row = connection.execute(select(storage.candidates).where(
            storage.candidates.c.account_id == ACCOUNT
        )).mappings().one()
        original = json.loads(row["candidate_json"])
        connection.execute(update(storage.profiles).where(
            storage.profiles.c.account_id == ACCOUNT
        ).values(enabled=False))
    store.auth_service.update_profile(ACCOUNT, ProfileInput(gender="female"), token=TOKEN)
    with store.engine.connect() as connection:
        row = connection.execute(select(storage.candidates).where(
            storage.candidates.c.account_id == ACCOUNT
        )).mappings().one()
        assert json.loads(row["candidate_json"]) == original
        assert row["active"] is False


def women_source(*, key="women", mixed=False):
    row = matching_tests.record(key=key, coverage="partial")
    row["source_json"]["fields"]["eligibility"] = (
        "폭력 피해 이주여성 및 동반 아동" if mixed else "여성 대상")
    return row


def snapshot_candidates(store, repository, rows, *, gender="male", age=28):
    with store.engine.begin() as connection:
        connection.execute(update(accounts).where(accounts.c.id == ACCOUNT).values(
            gender=gender, age=age))
    saved(store)
    items = []
    for row in rows:
        matching_tests.save_record(repository, row)
        item = candidate(row["policy_key"])
        item["policy"].update({"id": row["policy_key"], "revisionId": row["revision_id"]})
        items.append(item)
    before = scan(store, items)
    member = {"id": ACCOUNT, "gender": gender, "age": age, "region": "서울"}
    return before, member


def test_saved_gender_mismatch_is_filtered_from_current_source_in_one_batch(store, repository):
    gender = matching_tests.condition("gender", operator="EQ", value={
        "kind": "CATEGORY", "code": "FEMALE"})
    native = matching_tests.record([gender], key="native")
    generic = matching_tests.record(key="generic")
    source = women_source()
    before, member = snapshot_candidates(store, repository, [native, generic, source])
    queries = []

    def count_query(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            queries.append(statement)

    event.listen(repository.engine, "before_cursor_execute", count_query)
    try:
        # The trusted DB member must prevail over a stale female request dependency.
        after = storage.filter_snapshot_gender(before, {**member, "gender": "female"},
                                                repository, store=store)
    finally:
        event.remove(repository.engine, "before_cursor_execute", count_query)
    assert len(queries) == 1
    assert [item["policy_id"] for item in after["candidates"]] == [generic["policy_key"]]
    assert [item["policy_id"] for item in after["alerts"]] == [generic["policy_key"]]
    assert after["unread_count"] == 1
    # This presentation filter does not erase preferences or original source/history.
    assert store.read(ACCOUNT) == before


@pytest.mark.parametrize("gender", ["undisclosed", "other"])
def test_unknown_gender_never_hides_or_permanently_excludes_saved_candidates(store, repository,
                                                                           gender):
    before, member = snapshot_candidates(store, repository, [women_source()], gender=gender)
    assert storage.filter_snapshot_gender(before, member, None, store=store) == before
    assert before["recommendation_feedback"] == []


def test_gender_filter_preserves_viable_alternative_and_other_subjects(store, repository):
    gender = matching_tests.condition("gender", operator="EQ", value={
        "kind": "CATEGORY", "code": "FEMALE"})
    age = matching_tests.condition("age", identifier="age")
    alternative = matching_tests.record([gender, age], key="alternative", logic={
        "op": "any", "children": [matching_tests.leaf("c1"), matching_tests.leaf("age")],
        "condition_id": None, "reason": None,
    })
    child = matching_tests.record([gender.model_copy(update={"subject": "child"})], key="child")
    before, member = snapshot_candidates(store, repository, [alternative, child])
    assert storage.filter_snapshot_gender(before, member, repository, store=store) == before


@pytest.mark.parametrize("age,remaining", [(28, 0), (10, 1)])
def test_women_with_accompanying_children_are_not_inferred_to_exclude_a_male_child(
        store, repository, age, remaining):
    before, member = snapshot_candidates(store, repository, [women_source(mixed=True)], age=age)
    after = storage.filter_snapshot_gender(before, member, repository, store=store)
    assert len(after["candidates"]) == remaining


def test_unavailable_source_suspends_recommendations_but_retains_application_and_feedback_history(
        store, repository):
    rows = [women_source(key="one"), women_source(key="two"), women_source(key="three")]
    before, member = snapshot_candidates(store, repository, rows)
    store.set_candidate_state(ACCOUNT, rows[0]["policy_key"], "housing_repair", "applied")
    store.set_candidate_feedback(ACCOUNT, rows[1]["policy_key"], "housing_repair", "not_eligible")
    before = store.read(ACCOUNT)
    after = storage.filter_snapshot_gender(before, member, None, store=store)
    assert after["scan_status"] == "unavailable"
    assert after["scan_message"]
    assert after["alerts"] == [] and after["unread_count"] == 0
    assert {item["policy_id"] for item in after["candidates"]} == {
        rows[0]["policy_key"], rows[1]["policy_key"],
    }
    assert all(item["active"] is False for item in after["candidates"])
    assert after["recommendation_feedback"] == before["recommendation_feedback"]
    assert store.read(ACCOUNT) == before


def test_unread_mismatch_alerts_beyond_the_inbox_preview_are_removed_from_badge(store, repository):
    before, member = snapshot_candidates(store, repository, [women_source()])
    original = before["alerts"][0]
    payload = {key: value for key, value in original.items()
               if key not in {"id", "created_at", "read_at", "read"}}
    with store.engine.begin() as connection:
        connection.execute(insert(storage.alerts), [{
            "account_id": ACCOUNT, "alert_key": f"old-{index:03}",
            "alert_json": json.dumps(payload), "created_at": original["created_at"],
        } for index in range(104)])
    before = store.read(ACCOUNT)
    assert before["unread_count"] == 105 and len(before["alerts"]) == 100
    after = storage.filter_snapshot_gender(before, member, repository, store=store)
    assert after["alerts"] == [] and after["unread_count"] == 0
    assert store.read(ACCOUNT)["unread_count"] == 105


def test_older_wrong_gender_alert_is_rechecked_after_the_candidate_was_retired(store, repository):
    before, member = snapshot_candidates(store, repository, [women_source()])
    prior = before["alerts"][0]
    generic = matching_tests.record(key="generic")
    matching_tests.save_record(repository, generic)
    scan(store, [candidate(generic["policy_key"])])
    # All preview rows concern a different current notice; the wrong old alert is hidden.
    payload = {key: value for key, value in prior.items()
               if key not in {"id", "created_at", "read_at", "read"}}
    payload["policy_id"] = generic["policy_key"]
    with store.engine.begin() as connection:
        connection.execute(insert(storage.alerts), [{
            "account_id": ACCOUNT, "alert_key": f"current-{index:03}",
            "alert_json": json.dumps(payload), "created_at": "2099-01-01T00:00:00+00:00",
        } for index in range(100)])
    before = store.read(ACCOUNT)
    assert before["unread_count"] == 102
    assert all(item["policy_id"] == generic["policy_key"] for item in before["alerts"])
    assert all(item["policy_id"] == generic["policy_key"] for item in before["candidates"])
    after = storage.filter_snapshot_gender(before, member, repository, store=store)
    assert after["candidates"] == before["candidates"]
    assert after["alerts"] == before["alerts"]
    assert after["unread_count"] == 101


def test_saved_candidate_is_compared_with_the_latest_published_revision(store, repository):
    old = matching_tests.record(key="changing")
    before, member = snapshot_candidates(store, repository, [old])
    latest = women_source(key="changing")
    latest["revision_id"] = "updated-gender-restriction"
    latest["created_at"] += timedelta(days=1)
    matching_tests.save_record(repository, latest)
    after = storage.filter_snapshot_gender(before, member, repository, store=store)
    assert after["candidates"] == after["alerts"] == []
    assert after["unread_count"] == 0


def test_withdrawn_source_retires_recommendations_without_erasing_history(store, repository):
    row = women_source()
    before, member = snapshot_candidates(store, repository, [row])
    store.set_candidate_state(ACCOUNT, row["policy_key"], "housing_repair", "applied")
    before = store.read(ACCOUNT)
    with repository.engine.begin() as connection:
        table = repository.tables["condition_documents"]
        connection.execute(update(table).values(review_status="draft"))
    after = storage.filter_snapshot_gender(before, member, repository, store=store)
    assert after["candidates"][0]["active"] is False
    assert after["candidates"][0]["application_state"] == "applied"
    assert after["alerts"] == [] and after["unread_count"] == 0
