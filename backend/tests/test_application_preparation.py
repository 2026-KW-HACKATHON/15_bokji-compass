"""Preparation checks belong to one account and one verified source document set."""

from copy import deepcopy

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.modules.monitoring import storage
from tests import test_monitoring_api as api_tests
from tests import test_monitoring_storage as storage_tests

client = api_tests.client
store = storage_tests.store
ACCOUNT = storage_tests.ACCOUNT
OTHER = storage_tests.OTHER
PATH = api_tests.PREFIX + "/candidates/preparation"


def candidate(policy_id="policy-1", *, revision="revision-1", documents=None,
              status="listed", need_id="housing_repair"):
    item = storage_tests.candidate(policy_id)
    return {**item, "need_id": need_id, "policy": {
        **item["policy"], "revisionId": revision, "applicationGuide": {
            "methodText": "방문 신청", "onlineUrl": None, "phones": [], "visitText": "주민센터",
            "documents": ([{"id": "form", "label": "신청서"},
                           {"id": "identity", "label": "신분증"}]
                          if documents is None else documents),
            "documentsStatus": status, "documentsNote": "공식 안내에서 확인한 준비 서류",
        },
    }}


def scan(store, found, *, account_id=ACCOUNT):
    previous = store.read(account_id)
    return store.record_scan(account_id, previous["needs"], found,
                             expected_version=previous["version"])


def preparation(store, document_id="form", prepared=True, *, account_id=ACCOUNT,
                policy_id="policy-1", need_id="housing_repair", revision="revision-1"):
    return store.set_candidate_preparation(
        account_id, policy_id, need_id, revision, document_id, prepared)


def checks(snapshot, policy_id="policy-1"):
    return [item["application_preparation"] for item in snapshot["candidates"]
            if item["policy_id"] == policy_id]


def test_checks_persist_across_reopen_topics_and_false_updates_without_changing_progress(store):
    storage_tests.saved(store)
    scan(store, [candidate(), candidate(need_id="interest_housing"), candidate("policy-2")])
    store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "applied")
    before = deepcopy(store.read(ACCOUNT))
    first = preparation(store)
    assert checks(first) == [{"revision_id": "revision-1", "prepared_document_ids": ["form"]}] * 2
    assert checks(first, "policy-2") == [None]
    assert first["profile"] == before["profile"]
    assert first["alerts"] == before["alerts"]
    assert first["recommendation_feedback"] == before["recommendation_feedback"]
    assert all(item["state"] == "applied" for item in first["candidates"]
               if item["policy_id"] == "policy-1")
    assert checks(storage.MonitoringStore(store.engine).read(ACCOUNT)) == checks(first)
    second = preparation(store, "identity", need_id="interest_housing")
    assert all(item["prepared_document_ids"] == ["form", "identity"] for item in checks(second))
    cleared = preparation(store, "form", False)
    assert all(item["prepared_document_ids"] == ["identity"] for item in checks(cleared))
    cleared = preparation(store, "identity", False)
    assert all(item["prepared_document_ids"] == [] for item in checks(cleared))
    assert "documents_signature" not in str(cleared["candidates"])


def test_profile_edit_keeps_checks_when_same_source_is_found_under_a_new_topic(store):
    storage_tests.saved(store)
    scan(store, [candidate()])
    preparation(store)
    store.merge_confirmed_profile(ACCOUNT, {"building_year": 1980})
    assert store.read(ACCOUNT)["candidates"] == []
    with pytest.raises(HTTPException) as rejected:
        preparation(store)
    assert rejected.value.status_code == 409
    after = scan(store, [candidate(need_id="interest_housing")])
    assert checks(after) == [{"revision_id": "revision-1", "prepared_document_ids": ["form"]}]
    assert after["candidates"][0]["state"] == "watching"


@pytest.mark.parametrize("replacement", [
    candidate(revision="revision-2"),
    candidate(documents=[{"id": "form", "label": "새 신청서"}]),
    candidate(status="unknown", documents=[]),
    candidate(status="none", documents=[]),
])
def test_changed_source_resets_checks_and_cannot_resurrect_hidden_old_requirements(
        store, replacement):
    storage_tests.saved(store)
    scan(store, [candidate(), candidate(need_id="interest_housing")])
    preparation(store)
    replacement = {**replacement, "need_id": "another_topic"}
    after = scan(store, [replacement])
    assert checks(after) == [None]
    reverted = scan(store, [candidate()])
    assert checks(reverted) == [None]
    with store.engine.connect() as connection:
        rows = connection.execute(select(storage.candidates).where(
            storage.candidates.c.account_id == ACCOUNT)).mappings()
        assert all('"prepared_document_ids": ["form"]' not in row["candidate_json"] for row in rows)


def test_reordering_same_document_set_and_new_topic_retains_checks(store):
    storage_tests.saved(store)
    scan(store, [candidate()])
    preparation(store)
    documents = list(reversed(candidate()["policy"]["applicationGuide"]["documents"]))
    after = scan(store, [candidate(documents=documents, need_id="new_topic")])
    assert checks(after) == [{"revision_id": "revision-1", "prepared_document_ids": ["form"]}]


@pytest.mark.parametrize("payload,status", [
    ({"need_id": "not-owned"}, 404), ({"policy_id": "not-owned"}, 404),
    ({"revision": "old-revision"}, 409), ({"document_id": "invented"}, 409),
    ({"prepared": "true"}, 422), ({"prepared": 1}, 422),
])
def test_missing_candidate_forged_document_stale_revision_and_coerced_checks_are_rejected(
        store, payload, status):
    storage_tests.saved(store)
    scan(store, [candidate()])
    before = deepcopy(store.read(ACCOUNT))
    with pytest.raises(HTTPException) as rejected:
        preparation(store, **payload)
    assert rejected.value.status_code == status
    assert store.read(ACCOUNT) == before


@pytest.mark.parametrize("status", ["none", "unknown"])
def test_no_source_list_cannot_accept_an_invented_requirement(store, status):
    storage_tests.saved(store)
    scan(store, [candidate(status=status)])
    with pytest.raises(HTTPException) as rejected:
        preparation(store)
    assert rejected.value.status_code == 409


def test_checks_are_account_scoped_and_excluded_candidates_require_restore(store):
    for account in (ACCOUNT, OTHER):
        storage_tests.saved(store, account)
        scan(store, [candidate()], account_id=account)
    other = deepcopy(store.read(OTHER))
    preparation(store)
    assert store.read(OTHER) == other
    store.set_candidate_feedback(ACCOUNT, "policy-1", "housing_repair", "not_eligible")
    with pytest.raises(HTTPException) as rejected:
        preparation(store, "identity")
    assert rejected.value.status_code == 409
    assert checks(store.read(ACCOUNT))[0]["prepared_document_ids"] == ["form"]
    store.set_candidate_feedback(ACCOUNT, "policy-1", "housing_repair", None)
    updated = preparation(store, "identity")
    assert checks(updated)[0]["prepared_document_ids"] == ["form", "identity"]


def test_new_check_invalidates_inflight_worker_and_delete_removes_all_checks(store):
    storage_tests.saved(store)
    before = scan(store, [candidate()])
    after = preparation(store)
    stale = store.record_scan(ACCOUNT, before["needs"], [candidate(revision="revision-2")],
                             expected_version=before["version"])
    assert stale == after
    store.delete(ACCOUNT)
    storage_tests.saved(store)
    assert checks(scan(store, [candidate()])) == [None]


def test_withdrawn_account_cannot_save_or_leave_document_checks(store):
    storage_tests.saved(store)
    scan(store, [candidate()])
    preparation(store)
    store.auth_service.withdraw(storage_tests.TOKEN)
    with pytest.raises(HTTPException) as rejected:
        preparation(store)
    assert rejected.value.status_code == 401
    with store.engine.connect() as connection:
        assert connection.execute(select(storage.candidates).where(
            storage.candidates.c.account_id == ACCOUNT)).first() is None


def test_backward_compatible_candidates_and_empty_store_have_no_preparation(store):
    assert store.read(ACCOUNT)["candidates"] == []
    storage_tests.saved(store)
    after = scan(store, [storage_tests.candidate()])
    assert checks(after) == [None]


def seed_api(client):
    assert api_tests.save(client, enabled=True).status_code == 200
    store = client.app.state.monitoring_store
    scan(store, [candidate()], account_id="monitor-0")
    return store


def test_http_saves_true_false_rejects_stale_and_forged_fields_and_is_account_scoped(client):
    store = seed_api(client)
    payload = {"policy_id": "policy-1", "need_id": "housing_repair",
               "revision_id": "revision-1", "document_id": "form", "prepared": True}
    first = client.post(PATH, json=payload)
    assert first.status_code == 200
    assert checks(first.json()) == [
        {"revision_id": "revision-1", "prepared_document_ids": ["form"]}]
    assert checks(client.get(api_tests.PREFIX).json()) == checks(first.json())
    for changes, status in [
        ({"prepared": "true"}, 422), ({"prepared": 1}, 422),
        ({"document_id": "unknown"}, 409), ({"revision_id": "old"}, 409),
        ({"account_id": "monitor-1"}, 422), ({"policy_id": "foreign"}, 404),
    ]:
        before = store.read("monitor-0")
        assert client.post(PATH, json={**payload, **changes}).status_code == status
        assert store.read("monitor-0") == before
    client.cookies.set("bokji_session", api_tests.TOKENS[1])
    assert client.post(PATH, json=payload).status_code == 404
    client.cookies.set("bokji_session", api_tests.TOKENS[0])
    removed = client.post(PATH, json={**payload, "prepared": False})
    assert removed.status_code == 200 and checks(removed.json())[0]["prepared_document_ids"] == []


def test_http_auth_csrf_and_mobile_session_use_existing_guard(client):
    seed_api(client)
    payload = {"policy_id": "policy-1", "need_id": "housing_repair",
               "revision_id": "revision-1", "document_id": "identity", "prepared": True}
    del client.headers["X-Auth-Request"]
    assert client.post(PATH, json=payload).status_code == 403
    client.headers["X-Auth-Request"] = "1"
    client.headers["Authorization"] = "Bearer " + api_tests.MOBILE_TOKEN
    assert client.post(PATH, json=payload).status_code == 200
    client.headers["Authorization"] = "Bearer " + "z" * 43
    assert client.post(PATH, json=payload).status_code == 401
    del client.headers["Authorization"]
    client.cookies.clear()
    client.headers["X-Auth-Request"] = "1"
    assert client.post(PATH, json=payload).status_code == 401
