"""Offline worker wiring and fixed Windows task arguments, without provider calls."""

import json
import os
import subprocess
from threading import Event, RLock
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.modules.server_admin import operations


@pytest.fixture
def state(tmp_path, monkeypatch):
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    config = tmp_path / "worker.env"
    config.write_text("DB_ENABLED=true\nDB_PASSWORD=OfflineDbPassword42\n", encoding="utf-8")
    settings = Settings(_env_file=None, db_enabled=True,
                        db_password=SecretStr("OfflineDbPassword42"))
    return SimpleNamespace(settings=settings, database_engine=object(),
                           server_config_lock=RLock(), server_config_path=config)


def test_execute_uses_existing_worker_and_publication_setting(state, monkeypatch):
    calls = []

    class Store:
        def __init__(self, engine):
            assert engine is state.database_engine

        def check_schema(self):
            calls.append("schema")

    def policies(engine, *, auto_publish):
        assert engine is state.database_engine
        assert auto_publish is False
        return "policies"

    def tick(settings, store, repository):
        assert repository == "policies"
        assert settings.ingestion_max_jobs == 0
        assert settings.ingestion_discovery_enabled is False
        calls.append("tick")
        return {"status": "completed", "new": 3}

    state.settings = state.settings.model_copy(update={"policy_auto_publish": False})
    monkeypatch.setattr(operations, "IngestionRepository", Store)
    monkeypatch.setattr(operations, "PolicyRepository", policies)
    monkeypatch.setattr(operations, "run_tick", tick)
    request = operations.RunInput(action="tick", mode="raw")
    settings = operations.prepare_settings(state, request)
    assert operations.execute(state, request, settings)["new"] == 3
    assert calls == ["schema", "tick"]


def test_seed_releases_lease_and_never_adopts_legacy_results(state, monkeypatch):
    calls = []

    class Store:
        def __init__(self, engine):
            pass

        def check_schema(self):
            pass

        def acquire_worker(self, token, now, seconds):
            calls.append(("lease", token))
            return True

        def seed_existing(self, policies, signature, now, **kwargs):
            assert kwargs["adopt_legacy"] is False
            assert kwargs["limit"] == 7
            assert kwargs["worker_token"] == calls[0][1]
            raise RuntimeError("offline failure")

        def release_worker(self, token):
            calls.append(("release", token))

    monkeypatch.setattr(operations, "IngestionRepository", Store)
    monkeypatch.setattr(operations, "PolicyRepository", lambda *a, **kw: "policies")
    monkeypatch.setattr(operations, "processing_signature", lambda _: "offline-signature")
    with pytest.raises(RuntimeError):
        operations.execute(state, operations.RunInput(action="seed", limit=7), state.settings)
    assert calls[0][1] == calls[1][1]


def test_console_custom_defaults_cannot_exceed_ten_minutes(state):
    state.settings = state.settings.model_copy(update={"ingestion_max_seconds": 3600})
    settings = operations.prepare_settings(state, operations.RunInput(action="tick", mode="custom"))
    assert settings.ingestion_max_seconds == 600


def test_close_waits_for_inflight_work_before_disposing_shared_engine(state, monkeypatch):
    entered, release = Event(), Event()

    def work(*_args):
        entered.set()
        assert release.wait(2)
        return {"status": "completed"}

    monkeypatch.setattr(operations, "execute", work)
    manager = operations.Operations()
    manager.start(state, operations.RunInput(action="check"))
    assert entered.wait(1)
    release.set()
    manager.close()
    assert manager.snapshot()["operation"]["status"] == "finished"
    with pytest.raises(operations.OperationError):
        manager.start(state, operations.RunInput(action="check"))


@pytest.mark.skipif(os.name != "nt", reason="Windows task adapter")
@pytest.mark.parametrize("action", ["Status", "Install", "Remove"])
def test_scheduler_uses_fixed_script_and_native_python_without_shell(monkeypatch, action):
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        return subprocess.CompletedProcess(command, 0, json.dumps({
            "State": "Ready", "LiveCollectionEnabled": True}).encode(), b"")

    monkeypatch.setattr(operations.subprocess, "run", run)
    result = operations.scheduler(action)
    command, kwargs = calls[0]
    assert command[0].endswith("powershell.exe")
    assert command[command.index("-File") + 1].endswith("ingestion-schedule.ps1")
    assert command[command.index("-Action") + 1] == action
    assert "-Json" in command
    assert ("-EnableLiveCollection" in command) == (action == "Install")
    assert not kwargs.get("shell", False)
    assert kwargs["timeout"] == 30
    assert result["enabled"] is True


@pytest.mark.skipif(os.name != "nt", reason="Windows task adapter")
def test_schedule_registration_requires_same_config_and_bounded_time(state, monkeypatch):
    with pytest.raises(operations.OperationError, match="schedule_configuration_mismatch"):
        operations.prepare_settings(state, operations.RunInput(action="schedule-enable"))
    monkeypatch.setattr(operations, "BACKEND_ROOT", state.server_config_path.parent)
    state.server_config_path.rename(state.server_config_path.parent / ".env")
    state.server_config_path = state.server_config_path.parent / ".env"
    state.settings = state.settings.model_copy(update={"ingestion_max_seconds": 601})
    with pytest.raises(operations.OperationError, match="schedule_time_limit"):
        operations.prepare_settings(state, operations.RunInput(action="schedule-enable"))
    # Removal stays possible even when collection is disabled or a DB restart is pending.
    state.server_config_path.write_text("DB_ENABLED=false\n", encoding="utf-8")
    assert operations.prepare_settings(
        state, operations.RunInput(action="schedule-remove")) is state.settings


@pytest.mark.skipif(os.name != "nt", reason="Windows task adapter")
def test_schedule_errors_never_reveal_stderr(monkeypatch):
    monkeypatch.setattr(operations.subprocess, "run", lambda *a, **kw: (
        subprocess.CompletedProcess([], 1, b"", b"private-account-details")))
    with pytest.raises(operations.OperationError) as error:
        operations.scheduler("Install")
    assert str(error.value) == "schedule_failed"
