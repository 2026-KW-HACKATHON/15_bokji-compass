"""Conversation facts are temporary until the member explicitly confirms a scoped save."""

import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.exc import OperationalError

from app.api import assistant_dialogue
from app.core.config import Settings
from app.main import create_app
from app.modules.assistant.dialogue_models import DialogueStore
from app.modules.auth.consent import NOTICE_VERSION
from app.modules.auth.models import accounts, sessions
from app.modules.auth.service import AuthService, digest

PREFIX = "/v1/assistant/dialogue"
TOKENS = ["dialogue-web-0", "dialogue-web-1"]
MOBILE_TOKEN = "d" * 43


@pytest.fixture
def client(tmp_path):
    application = create_app(Settings(
        _env_file=None, app_env="test", db_enabled=False,
        auth_sqlite_path=tmp_path / "dialogue-api.sqlite3"))
    with TestClient(application, headers={"X-Auth-Request": "1"}) as value:
        assert value.get("/v1/auth/me").status_code == 401
        with application.state.auth_service.engine.begin() as connection:
            for index, token in enumerate(TOKENS):
                connection.execute(insert(accounts).values(
                    id=f"dialogue-{index}", username=f"dialogue_{index}", name="시험",
                    password_hash="unused", age=26 if index == 0 else 60,
                    gender="undisclosed", region="서울", phone=None, created_at=1))
                connection.execute(insert(sessions).values(
                    token_hash=digest(token), account_id=f"dialogue-{index}",
                    expires_at=int(time.time()) + 3600))
            connection.execute(insert(sessions).values(
                token_hash=AuthService.session_digest(MOBILE_TOKEN, mobile=True),
                account_id="dialogue-0", expires_at=int(time.time()) + 3600))
        value.cookies.set("bokji_session", TOKENS[0])
        yield value


def start(client, question="리모델링 지원금을 받을 수 있어?"):
    response = client.post(PREFIX, json={"question": question})
    assert response.status_code == 200, response.text
    return response.json()


def answer(client, result, value):
    response = client.post(PREFIX, json={"continuation": result["continuation"],
                                       "answer": {"slot": result["follow_up"]["slot"],
                                                  "value": value}})
    assert response.status_code == 200, response.text
    return response.json()


def owned_home(client):
    return answer(client, answer(client, start(client), "self"), "owner")


def save(client, result, **extra):
    return client.post(PREFIX + "/profile", json={
        "continuation": result["continuation"], "consent": True, "confirmed": True, **extra})


def test_guided_input_needs_no_external_ai_consent_and_no_year_alone_grant(client):
    result = owned_home(client)
    assert result["follow_up"]["slot"] == "building_year"
    result = answer(client, result, "1920년 건축")
    assert result["profile_draft"]["building_year"] == 1920
    assert result["eligibility_decided"] is False
    assert "준공 연도만으로" in result["answer"]
    assert result["follow_up"]["slot"] == "housing_type"
    assert result["catalog_status"] == "unavailable"
    assert client.get("/v1/monitoring").json()["profile"] is None


def test_catalog_initial_connection_failure_keeps_practical_help_and_followups(client, monkeypatch):
    def fail(request):
        raise OperationalError("private source schema", {}, Exception("secret"))
    monkeypatch.setattr(assistant_dialogue, "get_repository", fail)
    result = start(client, "집에 누수가 생겨 침수됐어 어떻게 해?")
    assert result["practical_steps"]
    assert result["follow_up"]
    result = answer(client, result, "self")
    assert result["catalog_status"] == "unavailable"
    assert result["practical_steps"]
    assert "private source" not in result["answer"] and "secret" not in result["answer"]


def test_save_only_confirmed_patch_preserves_concurrent_fields_and_disabled_consent(client):
    result = answer(client, owned_home(client), "1920년 건축")
    # Another form changes a field while the guided conversation is open.
    assert client.post("/v1/monitoring/profile", json={
        "profile": {"occupation": "직장인", "job_seeking": False},
        "enabled": False, "consent": True}).status_code == 200
    response = save(client, result)
    assert response.status_code == 200
    stored = response.json()
    assert stored["profile"]["building_year"] == 1920
    assert stored["profile"]["housing_tenure"] == "owner"
    assert stored["profile"]["occupation"] == "직장인"
    assert stored["profile"]["job_seeking"] is False
    assert stored["enabled"] is False and stored["scan_status"] == "paused"
    assert save(client, result).status_code == 409


def test_save_preserves_enabled_and_reports_unavailable_catalog(client):
    result = owned_home(client)
    assert client.post("/v1/monitoring/profile", json={
        "profile": {"job_seeking": True}, "enabled": True, "consent": True,
    }).status_code == 200
    response = save(client, result)
    assert response.status_code == 200
    assert response.json()["enabled"] is True
    assert response.json()["scan_status"] == "unavailable"
    assert response.json()["profile"]["job_seeking"] is True


@pytest.mark.parametrize("extra", [
    {"consent": False}, {"confirmed": False}, {"consent": "true"},
    {"profile": {"building_year": 1920}}, {"account_id": "dialogue-1"},
])
def test_save_rejects_unconfirmed_or_client_supplied_facts(client, extra):
    result = owned_home(client)
    response = save(client, result, **extra)
    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/v1/monitoring").json()["profile"] is None


@pytest.mark.parametrize("subject", ["other", "hypothetical", None])
def test_other_or_unknown_subject_never_inherits_or_saves_member_facts(client, subject):
    assert client.post("/v1/monitoring/profile", json={
        "profile": {"building_year": 1990, "housing_tenure": "owner"},
        "enabled": False, "consent": True}).status_code == 200
    result = answer(client, start(client), subject)
    assert result["profile_draft"]["building_year"] is None
    assert result["follow_up"]["slot"] == "region"
    result = answer(client, result, "서울특별시 노원구")
    result = answer(client, result, "owner")
    assert result["can_save_profile"] is False
    assert save(client, result).status_code == 409


def test_unknown_year_advances_without_manufacturing_fact(client):
    result = answer(client, owned_home(client), None)
    assert result["profile_draft"]["building_year"] is None
    assert "building_year" not in result["confirmed_fields"]
    assert result["follow_up"]["slot"] == "housing_type"
    assert any(row["slot"] == "building_year" for row in result["missing_fields"])


def test_token_is_account_bound_and_cookie_bearer_share_account(client):
    result = owned_home(client)
    client.cookies.set("bokji_session", TOKENS[1])
    assert save(client, result).status_code == 410
    response = client.post(PREFIX + "/profile", headers={
        "Authorization": "Bearer " + MOBILE_TOKEN}, json={
        "continuation": result["continuation"], "consent": True, "confirmed": True})
    assert response.status_code == 200
    assert client.get("/v1/monitoring").json()["profile"] is None


def test_expired_context_requires_new_question(client):
    now = [0]
    client.app.state.dialogue_store = DialogueStore(ttl_seconds=30, clock=lambda: now[0])
    result = owned_home(client)
    now[0] = 31
    response = save(client, result)
    assert response.status_code == 410
    assert client.get("/v1/monitoring").json()["profile"] is None


def test_failed_save_keeps_confirmed_draft_and_hides_sql(client, monkeypatch):
    result = owned_home(client)
    store = client.app.state.monitoring_store
    original = store.merge_confirmed_profile
    def fail(*args):
        raise OperationalError("private SQL", {}, Exception("secret"))
    monkeypatch.setattr(store, "merge_confirmed_profile", fail)
    response = save(client, result)
    assert response.status_code == 503
    assert "private SQL" not in response.text and "secret" not in response.text
    assert response.headers["cache-control"] == "no-store"
    monkeypatch.setattr(store, "merge_confirmed_profile", original)
    assert save(client, result).status_code == 200


def test_withdrawal_and_monitoring_delete_discard_temporary_facts(client):
    first = owned_home(client)
    assert client.post("/v1/monitoring/delete", json={}).status_code == 200
    assert save(client, first).status_code == 410
    second = owned_home(client)
    assert client.post("/v1/auth/withdraw", json={
        "notice_version": NOTICE_VERSION, "confirmation": True}).status_code == 200
    assert client.app.state.dialogue_store._entries == {}
    assert save(client, second).status_code == 401


def test_delayed_dialogue_save_cannot_recreate_a_deleted_profile(client, monkeypatch):
    result = owned_home(client)
    store = client.app.state.monitoring_store
    original = store.delete
    removed, finish = Event(), Event()

    def pause_after_delete(account_id):
        original(account_id)
        removed.set()
        assert finish.wait(10)

    monkeypatch.setattr(store, "delete", pause_after_delete)
    with ThreadPoolExecutor(max_workers=1) as executor:
        deletion = executor.submit(client.post, "/v1/monitoring/delete", json={})
        try:
            assert removed.wait(10)
            response = save(client, result)
            assert response.status_code == 410
        finally:
            finish.set()
        assert deletion.result(timeout=10).status_code == 200
    assert client.get("/v1/monitoring").json()["profile"] is None


def test_account_withdrawn_during_comparison_has_no_remaining_context(client, monkeypatch):
    original = assistant_dialogue.respond
    def withdraw_during_scan(*args, **kwargs):
        result = original(*args, **kwargs)
        client.app.state.auth_service.withdraw(TOKENS[0])
        return result
    monkeypatch.setattr(assistant_dialogue, "respond", withdraw_during_scan)
    response = client.post(PREFIX, json={"question": "집에 누수가 생겼어"})
    assert response.status_code == 401
    assert client.app.state.dialogue_store._entries == {}


def test_auth_request_guard_and_validation_do_not_echo_private_input(client):
    response = client.post(PREFIX, headers={"X-Auth-Request": "0"}, json={"question": "누수"})
    assert response.status_code == 403
    response = client.post(PREFIX, json={"question": "누수", "private": "secret question"})
    assert response.status_code == 422 and "secret question" not in response.text
    client.cookies.clear()
    response = client.post(PREFIX, json={"question": "누수"})
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
