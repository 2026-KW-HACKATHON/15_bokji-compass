"""Independent workers use server member data, paginate all accounts and preserve failures."""

import json

import pytest
from sqlalchemy import insert, update

from app.modules.auth.models import accounts
from app.modules.monitoring import worker
from app.modules.monitoring.models import MonitoringProfile
from app.modules.monitoring.storage import profiles
from tests.test_monitoring_storage import ACCOUNT, OTHER, candidate, saved, scan
from tests.test_monitoring_storage import store as store


def test_worker_processes_all_enabled_accounts_in_bounded_pages(store, monkeypatch):
    with store.engine.begin() as connection:
        members = [{"id": f"page-member-{index:04}", "username": f"paged_{index:04}",
                    "age": 28, "password_hash": "unused", "gender": "undisclosed",
                    "created_at": 1} for index in range(505)]
        connection.execute(insert(accounts), members)
        connection.execute(insert(profiles), [{"account_id": member["id"],
            "profile_json": MonitoringProfile(job_seeking=True).model_dump_json(),
            "enabled": True, "version": member["id"], "updated_at": "2026-10-07",
            "needs_json": json.dumps([])} for member in members])
    visited = []

    def member_loader(account_id):
        visited.append(account_id)
        return {"id": account_id, "age": 28, "region": "서울"}

    monkeypatch.setattr(worker, "scan_candidates", lambda *args, **kwargs: [])
    result = worker.run_once(object(), store, member_loader=member_loader, batch_size=7)
    assert result == {"checked": 505, "skipped": 0, "failed": 0}
    assert len(visited) == len(set(visited)) == 505


def test_worker_does_not_need_login_session_and_uses_server_account(store, monkeypatch):
    saved(store)
    seen = []

    def find(repository, member, profile, needs, **kwargs):
        seen.append(member)
        return [candidate()]

    monkeypatch.setattr(worker, "scan_candidates", find)
    result = worker.run_once(object(), store, store.auth_service)
    assert result == {"checked": 1, "skipped": 0, "failed": 0}
    assert seen[0]["id"] == ACCOUNT and seen[0]["age"] == 28
    assert store.read(ACCOUNT)["unread_count"] == 1


def test_source_failure_keeps_existing_matches_and_continues_other_accounts(
    store, monkeypatch, caplog,
):
    saved(store)
    first = scan(store)
    saved(store, OTHER)

    def find(repository, member, profile, needs, **kwargs):
        if member["id"] == ACCOUNT:
            raise RuntimeError("secret resident data must not enter a log")
        return [candidate()]

    monkeypatch.setattr(worker, "scan_candidates", find)
    result = worker.run_once(object(), store, store.auth_service, batch_size=1)
    assert result == {"checked": 1, "skipped": 0, "failed": 1}
    assert store.read(ACCOUNT) == first
    assert store.read(OTHER)["unread_count"] == 1
    assert "secret resident" not in caplog.text
    assert ACCOUNT not in caplog.text


def test_pause_during_external_scan_prevents_late_notifications(store, monkeypatch):
    saved(store)

    def find(*args, **kwargs):
        store.set_enabled(ACCOUNT, False)
        return [candidate()]

    monkeypatch.setattr(worker, "scan_candidates", find)
    result = worker.run_once(object(), store, store.auth_service)
    assert result == {"checked": 0, "skipped": 1, "failed": 0}
    assert store.read(ACCOUNT)["alerts"] == []


def test_wrong_member_identity_is_rejected_before_scan(store, monkeypatch):
    saved(store)
    monkeypatch.setattr(worker, "scan_candidates",
                        lambda *args, **kwargs: pytest.fail("must not scan another member"))
    result = worker.run_once(object(), store, member_loader=lambda account_id: {"id": OTHER})
    assert result["failed"] == 1
    assert store.read(ACCOUNT)["alerts"] == []


def test_disabled_profile_is_not_scanned(store, monkeypatch):
    store.save(ACCOUNT, MonitoringProfile())
    monkeypatch.setattr(worker, "scan_candidates",
                        lambda *args, **kwargs: pytest.fail("must not scan without consent"))
    assert worker.run_once(object(), store, store.auth_service) == {
        "checked": 0, "skipped": 0, "failed": 0}


@pytest.mark.parametrize("field,value", [("age", 60), ("region", "경기"), ("gender", "female")])
def test_member_update_during_scan_rejects_old_matches(store, monkeypatch, field, value):
    saved(store)
    first = scan(store)

    def find(*args, **kwargs):
        with store.engine.begin() as connection:
            connection.execute(update(accounts).where(accounts.c.id == ACCOUNT)
                               .values({field: value}))
        return [candidate("old-facts-policy")]

    monkeypatch.setattr(worker, "scan_candidates", find)
    result = worker.run_once(object(), store, store.auth_service)
    assert result == {"checked": 0, "skipped": 1, "failed": 0}
    assert store.read(ACCOUNT) == first


def test_evaluation_refreshes_member_even_if_caller_has_an_old_profile(store, monkeypatch):
    saved(store)
    seen = []

    def find(repository, member, profile, needs, **kwargs):
        seen.append(member)
        return []

    monkeypatch.setattr(worker, "scan_candidates", find)
    worker.evaluate_account(object(), store, {"id": ACCOUNT, "age": 90, "region": "제주"})
    assert seen[0]["age"] == 28 and seen[0]["region"] == "서울"
