"""Explicit console operations; reuse the bounded worker and its database lease."""

import json
import os
import subprocess
import sys
import time
from copy import deepcopy
from pathlib import Path
from threading import Event, Lock, Thread
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT, Settings
from app.modules.ingestion.analysis import analysis_settings, run_analysis
from app.modules.ingestion.profiles import PROFILES, apply_profile
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
RUN_FIELDS = tuple(PRESETS["raw"])
PRESETS.update({name: {key: values["ingestion_" + key] for key in RUN_FIELDS}
                for name, values in PROFILES.items()})


class OperationError(RuntimeError):
    pass


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    action: Literal["check", "tick", "seed", "analyze-all", "schedule-enable", "schedule-remove"]
    mode: Literal["raw", "analysis", "custom", "bootstrap", "steady"] = "raw"
    analysis_mode: Literal["standard", "bulk"] = "standard"
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
    if data.action == "analyze-all":
        return analysis_settings(settings, data.analysis_mode)
    if data.action != "tick":
        return settings
    if not settings.ingestion_enabled:
        raise OperationError("collection_disabled")
    if data.mode in PROFILES:
        settings = apply_profile(settings, data.mode)
    defaults = PRESETS.get(data.mode, {
        key: getattr(settings, "ingestion_" + key) for key in PRESETS["raw"]})
    overrides = {"ingestion_" + key: getattr(data, key) if key in data.model_fields_set
                 else defaults[key] for key in PRESETS["raw"]}
    overrides["ingestion_max_seconds"] = min(600, overrides["ingestion_max_seconds"])
    if data.mode in {"raw", "analysis"}:
        overrides["ingestion_profile"] = "custom"
    if data.mode == "raw":
        # A raw-only run never processes queued jobs or performs model-based discovery.
        overrides.update(ingestion_max_jobs=0, ingestion_max_model_calls=0,
                         ingestion_max_tokens=0)
    if data.mode in {"raw", "analysis"}:
        overrides["ingestion_discovery_enabled"] = False
    return Settings.model_validate({**settings.model_dump(), **overrides})


def scheduler(action: Literal["Status", "Install", "Remove"]) -> dict:
    if action not in {"Status", "Install", "Remove"}:
        raise OperationError("invalid_command")
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
                            creationflags=subprocess.CREATE_NO_WINDOW, shell=False)
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


def execute(state, data: RunInput, settings: Settings, progress=None, stop=None,
            operation_id=None) -> dict:
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
    if data.action == "analyze-all":
        return run_analysis(settings, store, policies, progress=progress, stop=stop,
                            run_id=operation_id, mode=data.analysis_mode)
    signature, token = processing_signature(settings), str(uuid4())
    if not store.acquire_worker(token, time.time(), settings.ingestion_max_seconds + 60):
        return {"status": "busy", "reason": "another_worker"}
    try:
        return {"status": "completed", **store.seed_all_existing(
            policies, signature, limit=data.limit, worker_token=token, progress=progress)}
    finally:
        store.release_worker(token)


def safe_result(result: dict) -> dict:
    # No provider responses, source documents, CLI stderr or exception text in this endpoint.
    fields = {"status", "reason", "pages", "jobs_completed", "new", "changed", "unchanged",
              "http_calls", "model_calls", "tokens", "elapsed_seconds", "indexed", "reused",
              "scanned", "batches", "complete", "batch_calls", "profile", "phase",
              "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_tokens",
              "failed_jobs", "jobs_remaining", "waiting_until", "unlimited", "model",
              "analysis_mode", "batch_size", "batch_input_chars",
              "gov24_key_configured", "bokjiro_key_configured",
              "codex_login_verified"}
    output = {key: value for key, value in result.items() if key in fields
              and (isinstance(value, (int, float, bool)) or value is None
                   or key in {"status", "reason", "profile", "phase", "model", "analysis_mode"}
                   and isinstance(value, str)
                   and len(value) <= 80)}
    # Older ticks also put normal quota deferrals in errors; classify them on read.
    deferred = list(result.get("deferrals", []))
    errors = []
    for error in result.get("errors", []):
        (deferred if error.get("code", "").startswith(
            ("daily_calls_", "provider_blocked_")) else errors).append(error)
    output["error_count"] = len(errors)
    output["deferred_count"] = sum("job_id" in item for item in deferred)
    allowed = {prefix + provider for prefix in ("daily_calls_", "provider_blocked_")
               for provider in ("bokjiro", "gov24", "notice")}
    output["limit_reasons"] = sorted({item.get("code") for item in deferred
                                      if item.get("code") in allowed})
    if "schedule" in result:
        output["schedule"] = result["schedule"]
    return output


class Operations:
    def __init__(self):
        self.lock = Lock()
        self.latest = None
        self.worker = None
        self.closed = False
        self.stop_event = Event()

    def close(self):
        with self.lock:
            self.closed = True
            self.stop_event.set()
            worker = self.worker
        if worker is not None and worker.ident is not None:
            worker.join()

    def snapshot(self, state=None) -> dict:
        with self.lock:
            operation = deepcopy(self.latest)
        saved = analysis_snapshot(state) if state is not None else None
        if saved and (saved["status"] == "running" or not operation
                      or saved["started_at"] > operation["started_at"]):
            operation = saved
        return {"operation": operation, "presets": deepcopy(PRESETS),
                "profiles": deepcopy(PROFILES)}

    def stop(self, state, operation_id):
        operation = self.snapshot(state)["operation"]
        if not operation or operation["id"] != operation_id:
            raise OperationError("operation_missing")
        if operation["action"] != "analyze-all":
            raise OperationError("operation_not_stoppable")
        if operation["status"] == "running":
            with self.lock:
                if self.latest and self.latest["id"] == operation_id:
                    self.stop_event.set()
                    self.latest["stop_requested"] = True
            if getattr(state.database_engine, "dialect", None):
                IngestionRepository(state.database_engine).set_state(
                    "analysis_stop:" + operation_id, {"requested": True})
        return self.snapshot(state)

    def start(self, state, data: RunInput) -> dict:
        with state.server_config_lock:
            current = self.snapshot(state)["operation"]
            if current and current["status"] == "running":
                raise OperationError("operation_busy")
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
                if data.action == "analyze-all":
                    self.latest["analysis_mode"] = data.analysis_mode
                snapshot = deepcopy(self.latest)
                self.stop_event.clear()
                worker = Thread(target=self._work, args=(state, data, settings), daemon=True)
                self.worker = worker
                try:
                    worker.start()
                except RuntimeError:
                    self.latest["status"] = "failed"
                    raise OperationError("operation_failed") from None
        return {"operation": snapshot}

    def _work(self, state, data, settings):
        def progress(result):
            with self.lock:
                self.latest["result"] = safe_result(result)
        try:
            if data.action == "analyze-all":
                raw = execute(state, data, settings, progress=progress, stop=self.stop_event,
                              operation_id=self.latest["id"])
            elif data.action == "seed":
                raw = execute(state, data, settings, progress=progress)
            else:
                raw = execute(state, data, settings)
            result = safe_result(raw)
            failed = result.get("status") == "failed"
        except Exception:
            # Operational failures may include secrets in their original exception messages.
            result, failed = {"status": "failed", "reason": "operation_failed"}, True
        with self.lock:
            self.latest.update(status="failed" if failed else "finished",
                               finished_at=time.time(), result=result)


def analysis_snapshot(state):
    engine = getattr(state, "database_engine", None)
    if not getattr(engine, "dialect", None):
        return None
    try:
        store = IngestionRepository(engine)
        operation = store.get_state("analysis_run")
        if not operation:
            return None
        operation["result"] = safe_result(operation["result"])
        if operation["status"] == "running":
            if not store.worker_owned(operation["id"], time.time()):
                operation["status"] = "finished"
                operation["result"].update(status="paused", reason="worker_interrupted")
            operation["stop_requested"] = store.get_state(
                "analysis_stop:" + operation["id"]).get("requested", False)
        return operation
    except (ValueError, RuntimeError, SQLAlchemyError):
        return None
