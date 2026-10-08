"""Persistent progress, account isolation and stale worker writes are security boundaries."""

import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, insert, select, update

from app.core.config import Settings
from app.modules.auth.account_write import require_active_account
from app.modules.auth.models import accounts, sessions
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import AuthService
from app.modules.monitoring import storage
from app.modules.monitoring.models import MonitoringProfile
from app.modules.monitoring.schema import initialize_monitoring_schema

ACCOUNT = "monitor-member"
OTHER = "other-member"
TOKEN = "T" * 43


@pytest.fixture
def store(tmp_path):
    engine = create_engine("sqlite:///" + (tmp_path / "monitoring.sqlite3").as_posix(),
                           connect_args={"check_same_thread": False, "timeout": 5})
    initialize_auth_schema(engine)
    initialize_monitoring_schema(engine)
    service = AuthService(engine, Settings(_env_file=None, app_env="test"))
    with engine.begin() as connection:
        for account_id in (ACCOUNT, OTHER):
            connection.execute(insert(accounts).values(
                id=account_id, username=account_id, age=28, region="서울",
                password_hash="unused", gender="undisclosed", created_at=1,
            ))
        connection.execute(insert(sessions).values(
            token_hash=service.session_digest(TOKEN), account_id=ACCOUNT,
            expires_at=int(time.time()) + 3600,
        ))
    monitoring = storage.MonitoringStore(engine)
    monitoring.auth_service = service
    yield monitoring
    engine.dispose()


def candidate(policy_id="policy-1", fingerprint="a" * 64):
    return {"need_id": "housing_repair", "policy_id": policy_id,
            "policy": {"id": policy_id, "title": "주택 개보수 지원"},
            "status": "needs_review", "reason": "노후 자가주택 관련 공고",
            "questions": ["지역과 소득 요건을 확인해 주세요."], "fingerprint": fingerprint}


def saved(store, account_id=ACCOUNT):
    return store.save(account_id, MonitoringProfile(housing_tenure="owner", building_year=1990),
                      enabled=True)


def scan(store, found=None, account_id=ACCOUNT):
    prior = store.read(account_id)
    return store.record_scan(account_id, prior["needs"], found or [candidate()],
                             expected_version=prior["version"])


def test_default_disabled_and_needs_derive_without_scan(store):
    assert store.read(ACCOUNT)["enabled"] is False
    value = store.save(ACCOUNT, MonitoringProfile(housing_tenure="owner", building_year=1990))
    assert value["enabled"] is False
    assert "housing_repair" in {need["id"] for need in value["needs"]}
    assert value["last_checked_at"] is None
    assert value["candidates"] == value["alerts"] == []


def test_identical_rescan_deduplicates_alert_and_preserves_progress(store):
    saved(store)
    first = scan(store)
    assert first["unread_count"] == 1
    store.mark_read(ACCOUNT, [first["alerts"][0]["id"]])
    store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "applied")
    repeated = scan(store)
    assert len(repeated["alerts"]) == 1
    assert repeated["unread_count"] == 0
    assert repeated["candidates"][0]["application_state"] == "applied"
    assert repeated["last_checked_at"] is not None
    # Fresh store instances see exactly the same progress and read state.
    assert storage.MonitoringStore(store.engine).read(ACCOUNT) == repeated


def test_semantic_changes_alert_once_and_prior_fingerprint_is_not_repeated(store):
    saved(store)
    scan(store)
    changed = scan(store, [candidate(fingerprint="b" * 64)])
    assert len(changed["alerts"]) == 2
    assert changed["alerts"][0]["kind"] == "candidate_changed"
    assert len(scan(store)["alerts"]) == 2


@pytest.mark.parametrize("need_id", ["disaster_watch", "interest_health"])
def test_new_exploration_topics_share_policy_progress_and_have_change_alerts(store, need_id):
    saved(store)
    housing = candidate()
    exploratory = {**candidate(), "need_id": need_id,
                   "reason": "내 정보와 연결되는 공개 지원 공고 탐색",
                   "questions": ["해당 지원 조건과 내 상황을 확인해 주세요."]}
    first = scan(store, [housing, exploratory])
    assert len(first["candidates"]) == 2 and len(first["alerts"]) == 2
    store.set_candidate_state(ACCOUNT, "policy-1", need_id, "preparing")
    repeated = scan(store, [housing, exploratory])
    assert len(repeated["alerts"]) == 2
    states = {item["need_id"]: item["state"] for item in repeated["candidates"]}
    assert states == {"housing_repair": "preparing", need_id: "preparing"}
    changed = scan(store, [housing, {**exploratory, "fingerprint": "b" * 64}])
    assert len(changed["alerts"]) == 3
    assert changed["alerts"][0]["need_id"] == need_id
    assert changed["alerts"][0]["kind"] == "candidate_changed"
    # Exploratory findings never mutate or confirm the user's damage facts.
    assert changed["profile"]["disaster_damage"] is None


@pytest.mark.parametrize("state", ["preparing", "applied", "completed", "dismissed"])
def test_disaster_watch_to_recovery_inherits_same_policy_progress(store, state):
    saved(store)
    watch = {**candidate(), "need_id": "disaster_watch"}
    scan(store, [watch])
    store.set_candidate_state(ACCOUNT, "policy-1", "disaster_watch", state)
    profile = MonitoringProfile(disaster_damage=True, disaster_type="flood",
                                disaster_occurred_on="2026-10-01")
    store.save(ACCOUNT, profile, enabled=True)
    recovery = {**candidate(), "need_id": "disaster_recovery"}
    continued = scan(store, [recovery])
    current = next(item for item in continued["candidates"]
                   if item["need_id"] == "disaster_recovery")
    assert current["state"] == state
    assert current["active"] is True
    expected_alert_count = 1 if state in {"completed", "dismissed"} else 2
    assert len(continued["alerts"]) == expected_alert_count


def test_inactive_applied_history_survives_newer_watching_record(store):
    saved(store)
    watch = {**candidate(), "need_id": "disaster_watch"}
    scan(store, [watch])
    store.set_candidate_state(ACCOUNT, "policy-1", "disaster_watch", "applied")
    scan(store)
    # Simulate an older deployment's conflicting topics: scans made the watching row newer.
    with store.engine.begin() as connection:
        connection.execute(update(storage.candidates).where(
            storage.candidates.c.account_id == ACCOUNT,
            storage.candidates.c.candidate_key == storage._key("housing_repair", "policy-1"),
        ).values(application_state="watching", updated_at="2099-01-01T00:00:00+00:00"))
    recovery = {**candidate(), "need_id": "disaster_recovery"}
    continued = scan(store, [recovery])
    current = next(item for item in continued["candidates"]
                   if item["need_id"] == "disaster_recovery")
    assert current["state"] == "applied"
    store.set_candidate_state(ACCOUNT, "policy-1", "disaster_recovery", "watching")
    # Explicit reset reaches inactive topics; the old applied state cannot reappear.
    another = scan(store, [{**candidate(), "need_id": "interest_health"}])
    assert all(item["state"] == "watching" for item in another["candidates"])


def test_policy_state_sync_does_not_cross_other_policies_or_accounts(store):
    saved(store)
    scan(store, [candidate(), {**candidate(), "need_id": "disaster_watch"},
                 candidate("policy-2")])
    saved(store, OTHER)
    scan(store, account_id=OTHER)
    store.set_candidate_state(ACCOUNT, "policy-1", "disaster_watch", "applied")
    ours = store.read(ACCOUNT)["candidates"]
    assert all(item["state"] == "applied" for item in ours if item["policy_id"] == "policy-1")
    assert next(item["state"] for item in ours if item["policy_id"] == "policy-2") == "watching"
    assert store.read(OTHER)["candidates"][0]["state"] == "watching"
    with pytest.raises(HTTPException) as rejected:
        store.set_candidate_state(ACCOUNT, "policy-1", "nonexistent-topic", "completed")
    assert rejected.value.status_code == 404
    assert store.read(ACCOUNT)["candidates"] == ours


def test_conflicting_terminal_states_use_latest_then_documented_tie_priority(store):
    saved(store)
    scan(store, [candidate(), {**candidate(), "need_id": "disaster_watch"}])
    with store.engine.begin() as connection:
        for need_id, state in (("housing_repair", "dismissed"), ("disaster_watch", "completed")):
            connection.execute(update(storage.candidates).where(
                storage.candidates.c.account_id == ACCOUNT,
                storage.candidates.c.candidate_key == storage._key(need_id, "policy-1"),
            ).values(application_state=state, updated_at="2026-01-01T00:00:00+00:00"))
    continued = scan(store, [{**candidate(), "need_id": "disaster_recovery"}])
    recovery = next(item for item in continued["candidates"]
                    if item["need_id"] == "disaster_recovery")
    assert recovery["state"] == "completed"
    assert len(continued["alerts"]) == 2
    with store.engine.begin() as connection:
        connection.execute(update(storage.candidates).where(
            storage.candidates.c.account_id == ACCOUNT,
            storage.candidates.c.candidate_key == storage._key("housing_repair", "policy-1"),
        ).values(application_state="dismissed", updated_at="2099-01-01T00:00:00+00:00"))
    newest = scan(store, [{**candidate(), "need_id": "interest_health"}])
    interest = next(item for item in newest["candidates"] if item["need_id"] == "interest_health")
    assert interest["state"] == "dismissed"
    assert len(newest["alerts"]) == 2


def test_dismissed_candidate_change_does_not_alert(store):
    saved(store)
    scan(store)
    store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "dismissed")
    changed = scan(store, [candidate(fingerprint="b" * 64)])
    assert len(changed["alerts"]) == 1
    assert changed["candidates"][0]["application_state"] == "dismissed"


def test_candidate_disappears_but_application_progress_survives(store):
    saved(store)
    scan(store)
    store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "applied")
    prior = store.read(ACCOUNT)
    empty = store.record_scan(ACCOUNT, prior["needs"], [], expected_version=prior["version"])
    assert len(empty["candidates"]) == 1
    assert empty["candidates"][0]["active"] is False
    assert empty["candidates"][0]["application_state"] == "applied"


def test_changed_profile_hides_unconfirmed_old_matches(store):
    saved(store)
    scan(store)
    changed = store.save(ACCOUNT, MonitoringProfile(housing_tenure="renter"), enabled=True)
    assert changed["candidates"] == []
    assert "housing_repair" not in {need["id"] for need in changed["needs"]}


@pytest.mark.parametrize("mutation", ["pause", "pause_resume", "delete", "delete_recreate",
                                      "profile", "state"])
def test_old_scan_cannot_overwrite_newer_consent_or_progress(store, mutation):
    saved(store)
    old = scan(store)
    if mutation.startswith("pause"):
        store.set_enabled(ACCOUNT, False)
        if mutation == "pause_resume":
            store.set_enabled(ACCOUNT, True)
    elif mutation.startswith("delete"):
        store.delete(ACCOUNT)
        if mutation == "delete_recreate":
            saved(store)
    elif mutation == "profile":
        store.save(ACCOUNT, MonitoringProfile(housing_tenure="renter"), enabled=True)
    else:
        store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "preparing")
    expected = store.read(ACCOUNT)
    stale = store.record_scan(ACCOUNT, old["needs"], [candidate("late-policy")],
                              expected_version=old["version"])
    assert stale == expected


def test_accounts_cannot_read_or_mutate_each_others_progress_or_alerts(store):
    saved(store)
    first = scan(store)
    saved(store, OTHER)
    assert store.read(OTHER)["candidates"] == []
    store.mark_read(OTHER, [first["alerts"][0]["id"]])
    assert store.read(ACCOUNT)["unread_count"] == 1
    with pytest.raises(HTTPException) as rejected:
        store.set_candidate_state(OTHER, "policy-1", "housing_repair", "applied")
    assert rejected.value.status_code == 404
    store.delete(OTHER)
    assert store.read(ACCOUNT)["candidates"] == first["candidates"]


def test_withdrawal_purges_rows_and_old_workers_cannot_recreate_them(store):
    saved(store)
    old = scan(store)
    store.auth_service.withdraw(TOKEN)
    with store.engine.connect() as connection:
        for table in storage.MONITORING_TABLES:
            assert not connection.execute(select(table).where(
                table.c.account_id == ACCOUNT
            )).first()
    with pytest.raises(HTTPException) as rejected:
        store.record_scan(ACCOUNT, old["needs"], [candidate()], expected_version=old["version"])
    assert rejected.value.status_code == 401
    with pytest.raises(HTTPException):
        saved(store)


def test_scan_serializes_with_withdrawal_and_committed_data_is_purged(store, monkeypatch):
    saved(store)
    old = store.read(ACCOUNT)
    active, release, withdrawing = Event(), Event(), Event()

    def hold_member_lock(connection, account_id):
        account = require_active_account(connection, account_id)
        active.set()
        assert release.wait(5)
        return account

    def withdraw():
        withdrawing.set()
        store.auth_service.withdraw(TOKEN)

    monkeypatch.setattr(storage, "require_active_account", hold_member_lock)
    with ThreadPoolExecutor(max_workers=2) as executor:
        scanning = executor.submit(store.record_scan, ACCOUNT, old["needs"], [candidate()],
                                   expected_version=old["version"])
        assert active.wait(5)
        withdrawal = executor.submit(withdraw)
        assert withdrawing.wait(5)
        assert not withdrawal.done()
        release.set()
        scanning.result(timeout=5)
        withdrawal.result(timeout=5)
    with store.engine.connect() as connection:
        for table in storage.MONITORING_TABLES:
            assert not connection.execute(select(table).where(
                table.c.account_id == ACCOUNT
            )).first()


def test_scan_waiting_for_withdrawal_rechecks_account(store):
    old = saved(store)
    deleting, release, scan_started = Event(), Event(), Event()

    def hold_delete(connection, cursor, statement, parameters, context, executemany):
        if "DELETE FROM auth_accounts" in statement:
            deleting.set()
            assert release.wait(5)

    def late_scan():
        scan_started.set()
        return store.record_scan(ACCOUNT, old["needs"], [candidate()],
                                 expected_version=old["version"])

    event.listen(store.engine, "before_cursor_execute", hold_delete)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            withdrawal = executor.submit(store.auth_service.withdraw, TOKEN)
            assert deleting.wait(5)
            scanning = executor.submit(late_scan)
            assert scan_started.wait(5)
            assert not scanning.done()
            release.set()
            withdrawal.result(timeout=5)
            with pytest.raises(HTTPException) as rejected:
                scanning.result(timeout=5)
            assert rejected.value.status_code == 401
    finally:
        release.set()
        event.remove(store.engine, "before_cursor_execute", hold_delete)


@pytest.mark.parametrize("enabled", [False, True])
def test_confirmed_profile_merge_preserves_other_facts_and_enabled(store, enabled):
    before = store.save(ACCOUNT, MonitoringProfile(
        occupation="직장인", household="가족과 살아요", interests=["주거"],
        housing_tenure="owner", housing_type="detached", job_seeking=False,
    ), enabled=enabled)
    other = saved(store, OTHER)
    after = store.merge_confirmed_profile(ACCOUNT, {"building_year": 1920})
    assert after["profile"] == {**before["profile"], "building_year": 1920}
    assert after["enabled"] is enabled
    assert after["version"] != before["version"]
    assert "housing_repair" in {need["id"] for need in after["needs"]}
    assert store.read(OTHER) == other


def test_confirmed_profile_merge_creates_disabled_profile_and_can_clear_confirmed_field(store):
    created = store.merge_confirmed_profile(ACCOUNT, {"building_year": 1920})
    assert created["enabled"] is False
    assert created["profile"] == MonitoringProfile(building_year=1920).model_dump()
    cleared = store.merge_confirmed_profile(ACCOUNT, {"building_year": None})
    assert cleared["profile"] == MonitoringProfile().model_dump()
    assert cleared["version"] != created["version"]


@pytest.mark.parametrize("changes", [
    {"account_id": OTHER}, {"enabled": True}, {"age": 28}, {"region": "부산"},
    {"building_year": "1920"}, {"building_year": True}, {"building_year": 1799},
    {"repair_needed": 1}, {"job_seeking": "true"}, {"disaster_occurred_on": "2026-02-30"},
])
def test_confirmed_profile_merge_rejects_unknown_fields_and_non_strict_values(store, changes):
    before = saved(store)
    with pytest.raises(ValidationError):
        store.merge_confirmed_profile(ACCOUNT, changes)
    assert store.read(ACCOUNT) == before


def test_confirmed_profile_merge_invalidates_candidates_and_stale_scan(store):
    saved(store)
    before = scan(store, [candidate(), candidate("policy-2")])
    store.set_candidate_state(ACCOUNT, "policy-1", "housing_repair", "applied")
    after = store.merge_confirmed_profile(ACCOUNT, {"building_year": 1920})
    assert after["last_checked_at"] is None
    assert after["version"] != before["version"]
    assert len(after["candidates"]) == 1
    assert after["candidates"][0]["policy_id"] == "policy-1"
    assert after["candidates"][0]["state"] == "applied"
    assert after["candidates"][0]["active"] is False
    assert after["alerts"] == before["alerts"]
    assert store.record_scan(ACCOUNT, before["needs"], [candidate("late-policy")],
                             expected_version=before["version"]) == after


def test_simultaneous_confirmed_profile_merges_do_not_lose_fields(store, monkeypatch):
    saved(store)
    first_locked, release, second_started = Event(), Event(), Event()
    original_profile_row = store._profile_row
    calls = 0

    def hold_first_profile_read(connection, account_id):
        nonlocal calls
        result = original_profile_row(connection, account_id)
        calls += 1
        if calls == 1:
            first_locked.set()
            assert release.wait(5)
        return result

    def merge_second():
        second_started.set()
        return store.merge_confirmed_profile(ACCOUNT, {"job_seeking": True})

    monkeypatch.setattr(store, "_profile_row", hold_first_profile_read)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(store.merge_confirmed_profile, ACCOUNT,
                                    {"building_year": 1920})
            assert first_locked.wait(5)
            second = executor.submit(merge_second)
            assert second_started.wait(5)
            assert not second.done()
            release.set()
            first.result(timeout=5)
            final = second.result(timeout=5)
        assert final["profile"]["building_year"] == 1920
        assert final["profile"]["job_seeking"] is True
        assert final["profile"]["housing_tenure"] == "owner"
        assert final["enabled"] is True
    finally:
        release.set()


def test_confirmed_profile_merge_waiting_for_withdrawal_cannot_recreate_profile(store):
    saved(store)
    deleting, release, merge_started = Event(), Event(), Event()

    def hold_delete(connection, cursor, statement, parameters, context, executemany):
        if "DELETE FROM auth_accounts" in statement:
            deleting.set()
            assert release.wait(5)

    def late_merge():
        merge_started.set()
        return store.merge_confirmed_profile(ACCOUNT, {"building_year": 1920})

    event.listen(store.engine, "before_cursor_execute", hold_delete)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            withdrawal = executor.submit(store.auth_service.withdraw, TOKEN)
            assert deleting.wait(5)
            merging = executor.submit(late_merge)
            assert merge_started.wait(5)
            assert not merging.done()
            release.set()
            withdrawal.result(timeout=5)
            with pytest.raises(HTTPException) as rejected:
                merging.result(timeout=5)
            assert rejected.value.status_code == 401
        with store.engine.connect() as connection:
            assert not connection.execute(select(storage.profiles).where(
                storage.profiles.c.account_id == ACCOUNT
            )).first()
    finally:
        release.set()
        event.remove(store.engine, "before_cursor_execute", hold_delete)
