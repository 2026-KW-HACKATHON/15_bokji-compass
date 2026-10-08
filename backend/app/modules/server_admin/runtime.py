"""Fixed Windows process operations with persisted results across API restarts."""

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict

from app.core.config import BACKEND_ROOT

CONTROL_ROOT = BACKEND_ROOT / "data/server-control"
SCRIPT = BACKEND_ROOT / "scripts/process-control.ps1"


class RuntimeErrorCode(RuntimeError):
    pass


class ControlInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    target: Literal["backend", "frontend", "all"]
    action: Literal["stop", "restart"]


def command(action, *, target="backend", job_id=None):
    if action not in {"Status", "Stop", "Restart"} or target not in {"backend", "frontend", "all"}:
        raise RuntimeErrorCode("invalid_command")
    if job_id is not None:
        try:
            if not isinstance(job_id, str) or str(UUID(job_id)) != job_id:
                raise ValueError
        except ValueError:
            raise RuntimeErrorCode("invalid_command") from None
    executable = Path(os.environ.get("SystemRoot", "C:/Windows")) / (
        "System32/WindowsPowerShell/v1.0/powershell.exe")
    args = [str(executable), "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", str(SCRIPT), "-Action", action, "-Target", target,
            "-ServerProcessId", str(os.getpid())]
    if job_id:
        args.extend(["-JobId", job_id])
    return args


def status():
    if os.name != "nt":
        return {"supported": False, "mode": "unsupported"}
    result = subprocess.run(command("Status"), capture_output=True, timeout=15,
                            creationflags=subprocess.CREATE_NO_WINDOW, shell=False)
    if result.returncode or len(result.stdout) > 65536:
        raise RuntimeErrorCode("inspection_failed")
    try:
        value = json.loads(result.stdout.decode("utf-8-sig"))
        if not isinstance(value, dict) or value.get("mode") not in {
                "development", "shared", "unmanaged"}:
            raise ValueError
        value["operation"] = latest_job()
        return value
    except (ValueError, UnicodeError):
        raise RuntimeErrorCode("inspection_failed") from None


def read_job(job_id):
    try:
        normalized = str(UUID(job_id))
    except ValueError:
        raise RuntimeErrorCode("job_missing") from None
    path = CONTROL_ROOT / (normalized + ".json")
    try:
        if path.stat().st_size > 65536:
            raise ValueError
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict) or data.get("id") != normalized:
            raise ValueError
    except (OSError, ValueError):
        raise RuntimeErrorCode("job_missing") from None
    keys = {"id", "target", "action", "status", "started_at", "finished_at", "error_code",
            "source_pid"}
    return {key: value for key, value in data.items() if key in keys}


def latest_job():
    if not CONTROL_ROOT.exists():
        return None
    files = sorted(CONTROL_ROOT.glob("*.json"), key=lambda path: path.stat().st_mtime,
                   reverse=True)
    for path in files[:5]:
        try:
            return read_job(path.stem)
        except RuntimeErrorCode:
            continue
    return None


def refresh_pending(state):
    job_id = getattr(state, "server_control_job", None)
    if job_id:
        try:
            job = read_job(job_id)
            if job["status"] in {"completed", "failed"}:
                state.server_control_pending = False
        except RuntimeErrorCode:
            pass


def start(state, data: ControlInput):
    if os.name != "nt":
        raise RuntimeErrorCode("windows_required")
    with state.server_config_lock:
        operation = state.server_operations.snapshot()["operation"]
        if (data.target in {"backend", "all"} and operation
                and operation["status"] == "running"):
            raise RuntimeErrorCode("collection_busy")
        view = status()
        if view["mode"] == "unmanaged":
            raise RuntimeErrorCode("unmanaged_runtime")
        CONTROL_ROOT.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid4())
        lock_path = CONTROL_ROOT / "active.lock"
        try:
            with lock_path.open("x", encoding="ascii") as lock:
                lock.write(job_id)
        except FileExistsError:
            try:
                active_id = lock_path.read_text(encoding="ascii")
                active = read_job(active_id)
                if active["status"] not in {"completed", "failed"}:
                    raise RuntimeErrorCode("control_busy")
                if lock_path.read_text(encoding="ascii") != active_id:
                    raise RuntimeErrorCode("control_busy")
                lock_path.unlink()
                with lock_path.open("x", encoding="ascii") as lock:
                    lock.write(job_id)
            except (OSError, RuntimeErrorCode):
                raise RuntimeErrorCode("control_busy") from None
        path = CONTROL_ROOT / (job_id + ".json")
        job = {"id": job_id, "target": data.target, "action": data.action,
               "status": "accepted", "started_at": time.time(), "finished_at": None,
               "error_code": None, "source_pid": os.getpid(), "port": state.settings.server_port,
               "host": state.settings.server_host}
        try:
            path.write_text(json.dumps(job), encoding="utf-8")
            state.server_control_job = job_id
            state.server_control_pending = data.target in {"backend", "all"}
            subprocess.Popen(
                command(data.action.title(), target=data.target, job_id=job_id),
                cwd=BACKEND_ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
                creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
            )
        except (OSError, subprocess.SubprocessError):
            state.server_control_pending = False
            job.update(status="failed", error_code="launch_failed", finished_at=time.time())
            try:
                path.write_text(json.dumps(job), encoding="utf-8")
            finally:
                lock_path.unlink(missing_ok=True)
            raise RuntimeErrorCode("launch_failed") from None
    return {"operation": read_job(job_id)}
