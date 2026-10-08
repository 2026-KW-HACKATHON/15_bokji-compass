"""Ongoing guidance is opt-in, account-scoped, private, and available to both clients."""

import time
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select
from sqlalchemy.exc import OperationalError

from app.api import monitoring
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.consent import NOTICE_VERSION
from app.modules.auth.models import accounts, sessions
from app.modules.auth.service import AuthService, digest
from app.modules.monitoring import worker
from app.modules.monitoring.public import MonitoringScanIncomplete
from app.modules.monitoring.storage import MONITORING_TABLES

PREFIX = "/v1/monitoring"
TOKENS = ["monitor-web-0", "monitor-web-1"]
MOBILE_TOKEN = "m" * 43
PROFILE = {
    "occupation": "취업 준비 중", "job_seeking": True,
    "housing_tenure": "owner", "building_year": 1990,
}


@pytest.fixture
def client(tmp_path):
    application = create_app(Settings(
        _env_file=None, app_env="test", db_enabled=False,
        auth_sqlite_path=tmp_path / "monitoring-api.sqlite3",
    ))
    with TestClient(application, headers={"X-Auth-Request": "1"}) as value:
        assert value.get("/v1/auth/me").status_code == 401
        with application.state.auth_service.engine.begin() as connection:
            for index, token in enumerate(TOKENS):
                connection.execute(insert(accounts).values(
                    id=f"monitor-{index}", username=f"monitor_{index}", name="시험",
                    password_hash="unused", age=26 if index == 0 else 60,
                    gender="undisclosed", region="서울", phone=None, created_at=1,
                ))
                connection.execute(insert(sessions).values(
                    token_hash=digest(token), account_id=f"monitor-{index}",
                    expires_at=int(time.time()) + 3600,
                ))
            connection.execute(insert(sessions).values(
                token_hash=AuthService.session_digest(MOBILE_TOKEN, mobile=True),
                account_id="monitor-0", expires_at=int(time.time()) + 3600,
            ))
        value.cookies.set("bokji_session", TOKENS[0])
        yield value


def save(client, *, enabled=False, profile=None):
    return client.post(PREFIX + "/profile", json={
        "profile": PROFILE if profile is None else profile, "enabled": enabled, "consent": True,
    })


def test_profile_requires_explicit_consent_and_rejects_unknown_private_fields(client):
    for body in (
        {"profile": PROFILE, "enabled": True},
        {"profile": PROFILE, "enabled": True, "consent": False},
        {"profile": PROFILE, "enabled": "false", "consent": True},
        {"profile": {**PROFILE, "account_id": "private-injected-value"},
         "enabled": True, "consent": True},
    ):
        response = client.post(PREFIX + "/profile", json=body)
        assert response.status_code == 422
        assert "private-injected-value" not in response.text
        assert response.headers["cache-control"] == "no-store"
    assert client.get(PREFIX).json()["profile"] is None


def test_default_pause_saved_needs_persistence_and_account_isolation(client):
    initial = client.get(PREFIX)
    assert initial.status_code == 200 and initial.json()["enabled"] is False
    response = save(client)
    assert response.status_code == 200
    result = response.json()
    assert result["enabled"] is False and result["last_checked_at"] is None
    assert result["profile"]["building_year"] == 1990
    assert {need["id"] for need in result["needs"]} >= {"housing_repair", "youth_employment"}
    client.cookies.set("bokji_session", TOKENS[1])
    assert client.get(PREFIX).json()["profile"] is None
    with TestClient(create_app(client.app.state.settings)) as reopened:
        reopened.cookies.set("bokji_session", TOKENS[0])
        restored = reopened.get(PREFIX).json()
        assert restored["profile"] == result["profile"]
        assert restored["updated_at"] == result["updated_at"]


def test_disabled_database_keeps_profile_and_marks_scan_unavailable(client):
    result = save(client, enabled=True)
    assert result.status_code == 200
    assert result.json()["scan_status"] == "unavailable"
    assert result.json()["enabled"] is True
    assert client.get(PREFIX).json()["profile"]["housing_tenure"] == "owner"
    assert client.post(PREFIX + "/refresh", json={}).json()["scan_status"] == "unavailable"
    assert client.post(PREFIX + "/preferences", json={"enabled": False}).status_code == 200
    assert client.post(PREFIX + "/refresh", json={}).status_code == 409


def test_web_mobile_identity_and_post_guard(client):
    assert save(client).status_code == 200
    client.cookies.set("bokji_session", TOKENS[1])
    client.headers["Authorization"] = "Bearer " + MOBILE_TOKEN
    assert client.get(PREFIX).json()["profile"]["building_year"] == 1990
    client.headers["Authorization"] = "Bearer " + "z" * 43
    assert client.get(PREFIX).status_code == 401
    del client.headers["Authorization"]
    del client.headers["X-Auth-Request"]
    assert save(client).status_code == 403
    client.cookies.clear()
    assert client.get(PREFIX).status_code == 401


def test_enable_requires_stored_profile_and_deletion_removes_tracking(client):
    assert client.post(PREFIX + "/preferences", json={"enabled": True}).status_code == 409
    assert save(client).status_code == 200
    assert client.post(PREFIX + "/delete", json={"account_id": "monitor-1"}).status_code == 422
    response = client.post(PREFIX + "/delete", json={})
    assert response.status_code == 200
    result = response.json()
    assert result["profile"] is None and result["enabled"] is False
    assert result["needs"] == result["candidates"] == result["alerts"] == []
    assert client.get("/v1/auth/me").status_code == 200


@pytest.mark.parametrize("extra", [
    {"building_year": 3000}, {"building_year": "1990"}, {"repair_needed": "yes"},
    {"disaster_occurred_on": "2999-01-01"}, {"disaster_occurred_on": "2026-02-30"},
])
def test_future_and_coerced_facts_are_rejected(client, extra):
    assert save(client, profile={**PROFILE, **extra}).status_code == 422


def test_valid_disaster_date_is_accepted_over_http_and_damage_not_inferred(client):
    result = save(client, profile={"disaster_type": "flood",
                                   "disaster_occurred_on": date(2026, 1, 1).isoformat()})
    assert result.status_code == 200
    assert result.json()["profile"]["disaster_damage"] is None


def test_region_can_watch_notices_without_inventing_damage_and_respects_decline(client):
    response = save(client, profile={})
    assert response.status_code == 200
    result = response.json()
    assert "disaster_watch" in {need["id"] for need in result["needs"]}
    assert result["profile"]["disaster_damage"] is None
    assert result["profile"]["disaster_occurred_on"] is None
    assert result["candidates"] == []
    declined = save(client, profile={"disaster_damage": False})
    assert declined.status_code == 200
    assert "disaster_watch" not in {need["id"] for need in declined.json()["needs"]}
    assert declined.json()["profile"]["disaster_damage"] is False
    damaged = save(client, profile={"disaster_damage": True})
    assert damaged.status_code == 200
    recovery = next(need for need in damaged.json()["needs"] if need["id"] == "disaster_recovery")
    assert any("발생일" in question for question in recovery["questions"])
    assert damaged.json()["profile"]["disaster_occurred_on"] is None


def test_failed_read_has_safe_error_body_and_no_private_sql(client, monkeypatch):
    assert client.get(PREFIX).status_code == 200
    monkeypatch.setattr(client.app.state.monitoring_store, "read", lambda account_id: (
        _ for _ in ()).throw(OperationalError("private SQL detail", {}, Exception())))
    response = client.get(PREFIX)
    assert response.status_code == 503 and "private SQL" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_state_updates_and_alert_reads_cannot_select_another_account(client):
    assert save(client).status_code == 200
    assert client.post(PREFIX + "/candidates/state", json={
        "policy_id": "foreign-policy", "need_id": "housing_repair", "state": "applied",
    }).status_code == 404
    assert client.post(PREFIX + "/alerts/read", json={"ids": ["foreign-alert"]}).status_code == 200
    assert client.post(PREFIX + "/alerts/read", json={
        "ids": ["foreign-alert"], "account_id": "monitor-1",
    }).status_code == 422


def test_refresh_preserves_candidates_on_incomplete_or_failed_scan(client, monkeypatch):
    assert save(client, enabled=True).status_code == 200
    found = [{"need_id": "housing_repair", "policy_id": "monitor-test",
              "policy": {"id": "monitor-test", "title": "주택 개선 시험 공고"},
              "status": "needs_review", "reason": "추가 조건 확인", "questions": [],
              "fingerprint": "a" * 64}]
    monkeypatch.setattr(monitoring, "get_repository", lambda request: object())
    monkeypatch.setattr(worker, "scan_candidates", lambda *args, **kwargs: found)
    response = client.post(PREFIX + "/refresh", json={})
    assert response.status_code == 200
    result = response.json()
    assert result["scan_status"] == "ready" and len(result["alerts"]) == 1
    assert result["candidates"][0]["state"] == "watching"
    assert client.post(PREFIX + "/candidates/state", json={
        "need_id": "housing_repair", "policy_id": "monitor-test", "state": "applied",
    }).status_code == 200
    before = client.get(PREFIX).json()

    def unavailable(*args, **kwargs):
        raise MonitoringScanIncomplete("private source failure")

    monkeypatch.setattr(worker, "scan_candidates", unavailable)
    failed = client.post(PREFIX + "/refresh", json={})
    assert failed.status_code == 200 and failed.json()["scan_status"] == "unavailable"
    assert "private source" not in failed.text
    assert failed.json()["candidates"] == before["candidates"]
    assert failed.json()["last_checked_at"] == before["last_checked_at"]


def test_confirming_disaster_preserves_one_policys_application_state(client, monkeypatch):
    monkeypatch.setattr(monitoring, "get_repository", lambda request: object())

    def find(*args, **kwargs):
        profile = args[2]
        need_id = "disaster_recovery" if profile.disaster_damage is True else "disaster_watch"
        return [{"need_id": need_id, "policy_id": "disaster-test",
                 "policy": {"id": "disaster-test", "title": "지역 복구 시험 공고"},
                 "status": "needs_review", "reason": "피해와 추가 조건 확인", "questions": [],
                 "fingerprint": ("b" if need_id == "disaster_recovery" else "a") * 64}]

    monkeypatch.setattr(worker, "scan_candidates", find)
    assert save(client, enabled=True, profile={}).status_code == 200
    assert client.post(PREFIX + "/candidates/state", json={
        "need_id": "disaster_watch", "policy_id": "disaster-test", "state": "applied",
    }).status_code == 200
    confirmed = save(client, enabled=True, profile={"disaster_damage": True})
    assert confirmed.status_code == 200
    result = confirmed.json()
    assert result["profile"]["disaster_occurred_on"] is None
    current = [candidate for candidate in result["candidates"] if candidate["active"]]
    assert len(current) == 1
    assert current[0]["need_id"] == "disaster_recovery" and current[0]["state"] == "applied"
    changed = client.post(PREFIX + "/candidates/state", json={
        "need_id": "disaster_recovery", "policy_id": "disaster-test", "state": "preparing",
    })
    assert changed.status_code == 200
    assert {candidate["state"] for candidate in changed.json()["candidates"]} == {"preparing"}


def test_withdrawal_erases_monitoring_data_and_keeps_other_account(client):
    assert save(client, enabled=True).status_code == 200
    store = client.app.state.monitoring_store
    before = store.read("monitor-0")
    store.record_scan("monitor-0", before["needs"], [{
        "need_id": "housing_repair", "policy_id": "withdrawal-test",
        "policy": {"title": "시험 공고"}, "fingerprint": "b" * 64,
        "status": "needs_review", "reason": "시험", "questions": [],
    }], expected_version=before["version"])
    client.cookies.set("bokji_session", TOKENS[1])
    assert save(client).status_code == 200
    client.cookies.set("bokji_session", TOKENS[0])
    response = client.post("/v1/auth/withdraw", json={
        "confirmation": True, "notice_version": NOTICE_VERSION,
    })
    assert response.status_code == 200
    with client.app.state.auth_service.engine.connect() as connection:
        for table in MONITORING_TABLES:
            assert connection.execute(select(table).where(table.c.account_id == "monitor-0"))\
                .first() is None
    client.cookies.set("bokji_session", TOKENS[1])
    assert client.get(PREFIX).json()["profile"]["building_year"] == 1990
