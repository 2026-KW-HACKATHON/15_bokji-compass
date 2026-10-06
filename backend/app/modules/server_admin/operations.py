"""Explicit console operations; reuse the bounded worker and its database lease."""

import json
import os
import subprocess
import sys
import time
from copy import deepcopy
from pathlib import Path
from threading import Lock, Thread
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import BACKEND_ROOT, Settings
from app.modules.ingestion.public import run_tick
from app.modules.ingestion.repository import IngestionRepository
from app.modules.pipeline.public import processing_signature
from app.modules.server_admin import settings as configuration
from app.modules.server_admin.runtime import refresh_pending
from app.modules.storage.public import PolicyRepository

PRESETS = {
    "raw": {"page_size": 5, "max_pages": 1, "max_jobs": 0, "max_seconds": 120,
            "max_http_calls": 2, "max_model_calls": 0, "max_tokens": 0},
    "analysis": {"page_size": 5, "max_pages": 1, "max_jobs": 2, "max_seconds": 300,
                 "max_http_calls": 4, "max_model_calls": 2, "max_tokens": 40000},
}


class OperationError(RuntimeError):
    pass


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    action: Literal["check", "tick", "seed", "schedule-enable", "schedule-remove"]
    mode: Literal["raw", "analysis", "custom"] = "raw"
    page_size: int = Field(default=5, ge=1, le=100)
    max_pages: int = Field(default=1, ge=0, le=30)
    max_jobs: int = Field(default=0, ge=0, le=100)
    max_seconds: int = Field(default=120, ge=15, le=600)
    max_http_calls: int = Field(default=2, ge=0, le=100)
    max_model_calls: int = Field(default=0, ge=0, le=100)
    max_tokens: int = Field(default=0, ge=0, le=1000000)
    limit: int = Field(default=100, ge=1, le=100)


def desired_settings(state) -> Settings:
    with state.server_config_lock:
        view = configuration.get_view(state.server_config_path, state.settings)
        if view["restart_fields"]:
            raise OperationError("restart_required")
        return configuration.configured_settings(state.server_config_path, state.settings)


def prepare_settings(state, data: RunInput) -> Settings:
    if data.action == "schedule-remove":
        if os.name != "nt":
            raise OperationError("windows_required")
        return state.settings
    settings = desired_settings(state)
    if data.action.startswith("schedule-"):
        if os.name != "nt":
            raise OperationError("windows_required")
        if data.action == "schedule-enable":
            # The registered CLI reads the default .env, rather than this API's environment.
            with state.server_config_lock:
                view = configuration.get_view(state.server_config_path, state.settings)
            if (Path(state.server_config_path).resolve() != (BACKEND_ROOT / ".env").resolve()
                    or view["env_overrides"]):
                raise OperationError("schedule_configuration_mismatch")
            if not settings.db_enabled or not settings.ingestion_enabled:
                raise OperationError("collection_disabled")
            if settings.ingestion_max_seconds > 600:
                raise OperationError("schedule_time_limit")
        return settings
    if not settings.db_enabled or state.database_engine is None:
        raise OperationError("database_disabled")
    if data.action != "tick":
        return settings
    if not settings.ingestion_enabled:
        raise OperationError("collection_disabled")
    defaults = PRESETS.get(data.mode, {
        key: getattr(settings, "ingestion_" + key) for key in PRESETS["raw"]})
    overrides = {"ingestion_" + key: getattr(data, key) if key in data.model_fields_set
                 else defaults[key] for key in PRESETS["raw"]}
    overrides["ingestion_max_seconds"] = min(600, overrides["ingestion_max_seconds"])
    if data.mode == "raw":
        # A raw-only run never processes queued jobs or performs model-based discovery.
        overrides.update(ingestion_max_jobs=0, ingestion_max_model_calls=0,
                         ingestion_max_tokens=0)
    if data.mode in {"raw", "analysis"}:
        overrides["ingestion_discovery_enabled"] = False
    return Settings.model_validate({**settings.model_dump(), **overrides})


def scheduler(action: Literal["Status", "Install", "Remove"]) -> dict:
    if os.name != "nt":
        return {"supported": False, "state": "unsupported"}
    executable = Path(os.environ.get("SystemRoot", "C:/Windows")) / (
        "System32/WindowsPowerShell/v1.0/powershell.exe")
    command = [str(executable), "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
               "-File", str(BACKEND_ROOT / "scripts/ingestion-schedule.ps1"),
               "-Action", action, "-Json"]
    if action == "Install":
        command.extend(["-EnableLiveCollection", "-PythonExecutable", sys.executable])
    result = subprocess.run(command, cwd=BACKEND_ROOT, capture_output=True, timeout=30,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode or len(result.stdout) > 65536:
        raise OperationError("schedule_failed")
    try:
        data = json.loads(result.stdout.decode("utf-8-sig"))
        if not isinstance(data, dict):
            raise ValueError
    except (UnicodeError, ValueError):
        raise OperationError("schedule_failed") from None
    return {
        "supported": True,
        "state": data.get("State", "Ready"),
        "enabled": bool(data.get("LiveCollectionEnabled", False)),
        "interval_minutes": 10,
        "last_task_result": data.get("LastTaskResult"),
    }


def execute(state, data: RunInput, settings: Settings) -> dict:
    if data.action.startswith("schedule-"):
        result = scheduler("Install" if data.action == "schedule-enable" else "Remove")
        return {"status": "completed", "schedule": result}
    store = IngestionRepository(state.database_engine)
    store.check_schema()
    policies = PolicyRepository(state.database_engine, auto_publish=settings.policy_auto_publish)
    if data.action == "check":
        return {"status": "database_ready", "gov24_key_configured": bool(
            settings.data_go_kr_api_key.get_secret_value()), "bokjiro_key_configured": bool(
            settings.bokjiro_api_key.get_secret_value()), "codex_login_verified": False}
    if data.action == "tick":
        return run_tick(settings, store, policies)
    signature, token = processing_signature(settings), str(uuid4())
    if not store.acquire_worker(token, time.time(), settings.ingestion_max_seconds + 60):
        return {"status": "busy", "reason": "another_worker"}
    try:
        return {"status": "completed", **store.seed_existing(
            policies, signature, time.time(), limit=data.limit, worker_token=token,
            adopt_legacy=False)}
    finally:
        store.release_worker(token)


def safe_result(result: dict) -> dict:
    # No provider responses, source documents, CLI stderr or exception text in this endpoint.
    fields = {"status", "reason", "pages", "jobs_completed", "new", "changed", "unchanged",
              "http_calls", "model_calls", "tokens", "elapsed_seconds", "indexed", "reused",
              "scanned", "complete", "gov24_key_configured", "bokjiro_key_configured",
              "codex_login_verified"}
    output = {key: value for key, value in result.items() if key in fields
              and (isinstance(value, (int, float, bool)) or value is None
                   or key in {"status", "reason"} and isinstance(value, str)
                   and len(value) <= 80)}
    output["error_count"] = len(result.get("errors", []))
    if "schedule" in result:
        output["schedule"] = result["schedule"]
    return output


class Operations:
    def __init__(self):
        self.lock = Lock()
        self.latest = None
        self.worker = None
        self.closed = False

    def close(self):
        with self.lock:
            self.closed = True
            worker = self.worker
        if worker is not None and worker.ident is not None:
            worker.join()

    def snapshot(self) -> dict:
        with self.lock:
            return {"operation": deepcopy(self.latest), "presets": deepcopy(PRESETS)}

    def start(self, state, data: RunInput) -> dict:
        with state.server_config_lock:
            refresh_pending(state)
            if getattr(state, "server_control_pending", False):
                raise OperationError("operation_busy")
            settings = prepare_settings(state, data)
            with self.lock:
                if self.closed:
                    raise OperationError("operation_failed")
                if self.latest and self.latest["status"] == "running":
                    raise OperationError("operation_busy")
                self.latest = {"id": str(uuid4()), "action": data.action, "status": "running",
                               "started_at": time.time(), "finished_at": None, "result": None}
                snapshot = deepcopy(self.latest)
                worker = Thread(target=self._work, args=(state, data, settings), daemon=True)
                self.worker = worker
                try:
                    worker.start()
                except RuntimeError:
                    self.latest["status"] = "failed"
                    raise OperationError("operation_failed") from None
        return {"operation": snapshot}

    def _work(self, state, data, settings):
        try:
            result = safe_result(execute(state, data, settings))
            failed = result.get("status") == "failed"
        except Exception:
            # Operational failures may include secrets in their original exception messages.
            result, failed = {"status": "failed", "reason": "operation_failed"}, True
        with self.lock:
            self.latest.update(status="failed" if failed else "finished",
                               finished_at=time.time(), result=result)
