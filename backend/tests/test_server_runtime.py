"""Offline lifecycle requests use temporary files and subprocess doubles."""

import json
import os
import subprocess
from threading import RLock
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.modules.server_admin import runtime
from app.modules.server_admin.operations import OperationError, Operations, RunInput


@pytest.fixture
def state(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime, "CONTROL_ROOT", tmp_path / "control")
    monkeypatch.setattr(runtime, "status", lambda: {
        "supported": True, "mode": "development", "current_pid": os.getpid(),
        "mysql": {"controllable": True}, "tunnel": {"controllable": False}})
    monkeypatch.setattr(runtime.subprocess, "Popen", lambda *args, **kw: SimpleNamespace(pid=123))
    return SimpleNamespace(settings=Settings(_env_file=None), server_config_lock=RLock(),
                           server_operations=Operations())


@pytest.mark.skipif(os.name != "nt", reason="Windows process adapter")
def test_detached_helper_uses_fixed_arguments_and_persists_job(state, monkeypatch):
    calls = []
    monkeypatch.setattr(runtime.subprocess, "Popen", lambda args, **kw: (
        calls.append((args, kw)) or SimpleNamespace(pid=123)))
    response = runtime.start(state, runtime.ControlInput(target="backend", action="restart"))
    job = response["operation"]
    assert job["status"] == "accepted"
    assert runtime.read_job(job["id"]) == job
    args, options = calls[0]
    assert args[args.index("-File") + 1] == str(runtime.SCRIPT)
    assert args[args.index("-ServerProcessId") + 1] == str(os.getpid())
    assert args[args.index("-Target") + 1] == "backend"
    assert not options.get("shell", False)
    assert options["creationflags"] & subprocess.CREATE_NO_WINDOW
    assert options["creationflags"] & subprocess.CREATE_NEW_PROCESS_GROUP
    assert state.server_control_pending is True
    # Reads never release an in-flight command or lose its persisted identity.
    runtime.refresh_pending(state)
    assert state.server_control_pending is True
    assert runtime.latest_job() == job


@pytest.mark.skipif(os.name != "nt", reason="Windows process adapter")
def test_duplicate_control_requests_are_rejected_across_states(state):
    runtime.start(state, runtime.ControlInput(target="frontend", action="restart"))
    other = SimpleNamespace(settings=state.settings, server_config_lock=RLock(),
                            server_operations=Operations())
    with pytest.raises(runtime.RuntimeErrorCode, match="control_busy"):
        runtime.start(other, runtime.ControlInput(target="backend", action="stop"))


@pytest.mark.skipif(os.name != "nt", reason="Windows process adapter")
def test_backend_stop_does_not_interrupt_collection_and_frontend_remains_independent(state):
    state.server_operations.latest = {"status": "running"}
    with pytest.raises(runtime.RuntimeErrorCode, match="collection_busy"):
        runtime.start(state, runtime.ControlInput(target="all", action="stop"))
    assert not runtime.CONTROL_ROOT.exists()
    assert runtime.start(state, runtime.ControlInput(
        target="frontend", action="restart"))["operation"]["status"] == "accepted"


@pytest.mark.skipif(os.name != "nt", reason="Windows process adapter")
def test_failed_helper_launch_releases_lock_and_does_not_leak_exception(state, monkeypatch):
    def fail(*args, **kwargs):
        raise OSError("private-process-arguments")

    monkeypatch.setattr(runtime.subprocess, "Popen", fail)
    with pytest.raises(runtime.RuntimeErrorCode, match="launch_failed"):
        runtime.start(state, runtime.ControlInput(target="backend", action="restart"))
    assert state.server_control_pending is False
    assert not (runtime.CONTROL_ROOT / "active.lock").exists()
    assert "private" not in json.dumps(runtime.latest_job())


def test_job_lookup_rejects_paths_and_returns_only_safe_metadata(state):
    with pytest.raises(runtime.RuntimeErrorCode, match="job_missing"):
        runtime.read_job("../../private-file")
    runtime.CONTROL_ROOT.mkdir()
    job_id = str(uuid4())
    (runtime.CONTROL_ROOT / (job_id + ".json")).write_text(json.dumps({
        "id": job_id, "status": "completed", "private": "private-password"}), encoding="utf-8")
    assert runtime.read_job(job_id) == {"id": job_id, "status": "completed"}


@pytest.mark.skipif(os.name != "nt", reason="Windows process adapter")
def test_finished_job_clears_collection_gate_and_stale_terminal_lock(state):
    response = runtime.start(state, runtime.ControlInput(target="backend", action="restart"))
    job = response["operation"]
    job["status"] = "completed"
    (runtime.CONTROL_ROOT / (job["id"] + ".json")).write_text(json.dumps(job), encoding="utf-8")
    runtime.refresh_pending(state)
    assert state.server_control_pending is False
    # Recover a leftover lock only when its matching job has already finished.
    next_job = runtime.start(state, runtime.ControlInput(target="frontend", action="restart"))
    assert next_job["operation"]["id"] != job["id"]


def test_collection_cannot_start_after_backend_control_is_accepted(state):
    state.server_control_pending = True
    with pytest.raises(OperationError, match="operation_busy"):
        state.server_operations.start(state, RunInput(action="check"))
    assert state.server_operations.snapshot()["operation"] is None


def test_corrupt_job_is_not_exposed(state):
    runtime.CONTROL_ROOT.mkdir()
    job_id = str(uuid4())
    (runtime.CONTROL_ROOT / (job_id + ".json")).write_text('[]', encoding="utf-8")
    with pytest.raises(runtime.RuntimeErrorCode, match="job_missing"):
        runtime.read_job(job_id)


@pytest.mark.skipif(os.name != "nt", reason="Windows process adapter")
def test_database_control_shares_collection_gate_and_preserves_recovery_job(state):
    state.server_operations.latest = {"status": "running"}
    with pytest.raises(runtime.RuntimeErrorCode, match="collection_busy"):
        runtime.start(state, runtime.ControlInput(target="mysql", action="restart"))
    state.server_operations.latest = None
    job = runtime.start(state, runtime.ControlInput(target="mysql", action="start"))["operation"]
    assert job["target"] == "mysql" and job["action"] == "start"
    assert state.server_control_pending is True
    with pytest.raises(OperationError, match="operation_busy"):
        state.server_operations.start(state, RunInput(action="check"))


@pytest.mark.parametrize("target,code", [("mysql", "mysql_unmanaged"),
                                       ("all", "mysql_unmanaged"),
                                       ("tunnel", "tunnel_unmanaged")])
def test_unmanaged_dependencies_cannot_launch_a_control_job(state, monkeypatch, target, code):
    monkeypatch.setattr(runtime, "status", lambda: {"mode": "development"})
    with pytest.raises(runtime.RuntimeErrorCode, match=code):
        runtime.start(state, runtime.ControlInput(target=target, action="stop"))
    assert not runtime.CONTROL_ROOT.exists()


def test_api_restart_recovers_the_persisted_collection_gate(state):
    runtime.CONTROL_ROOT.mkdir()
    job_id = str(uuid4())
    (runtime.CONTROL_ROOT / (job_id + ".json")).write_text(json.dumps({
        "id": job_id, "target": "all", "status": "running"}), encoding="utf-8")
    (runtime.CONTROL_ROOT / "active.lock").write_text(job_id, encoding="ascii")
    runtime.refresh_pending(state)
    assert state.server_control_pending is True
    assert state.server_control_job == job_id
