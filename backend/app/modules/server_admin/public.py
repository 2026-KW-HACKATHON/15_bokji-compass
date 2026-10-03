"""Read-only operational checks and controlled settings writes for the server console."""

import os
import shutil
import time
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT
from app.modules.ingestion.public import available_memory_mb
from app.modules.ingestion.repository import IngestionRepository
from app.modules.server_admin import settings as configuration


def configuration_path() -> Path:
    value = Path(os.environ.get("APP_CONFIG_FILE", BACKEND_ROOT / ".env"))
    return value if value.is_absolute() else BACKEND_ROOT / value


def read_settings(state) -> dict:
    with state.server_config_lock:
        return configuration.get_view(state.server_config_path, state.settings)


def update_settings(state, revision: str, changes: dict) -> dict:
    """Persist first; existing DB/auth engines stay bound to their startup configuration."""
    with state.server_config_lock:
        result = configuration.save_changes(
            state.server_config_path, state.settings, revision, changes)
        configured = configuration.configured_settings(state.server_config_path, state.settings)
        hot = {name: getattr(configured, name) for name in configuration.EDITABLE_FIELDS
               if name not in configuration.RESTART_FIELDS}
        state.settings = state.settings.model_copy(update=hot)
        return result


def collection_repository(state) -> IngestionRepository:
    if state.database_engine is None:
        raise RuntimeError("database_disabled")
    return IngestionRepository(state.database_engine)


def read_collection(state, kind: str, *, limit: int = 20) -> dict:
    store = collection_repository(state)
    if kind == "status":
        return store.status(limit)
    if kind == "changes":
        return {"items": store.changes(limit)}
    if kind == "candidates":
        return {"items": store.list_candidates(limit)}
    raise ValueError("Unknown collection view")


def get_overview(state) -> dict:
    """Only local files, memory and SELECTs; no collector, model or scheduler execution."""
    settings = state.settings
    engine = state.database_engine
    database = {"enabled": engine is not None, "status": "disabled"}
    collection = {"available": False, "reason": "database_disabled"}
    if engine is not None:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            database["status"] = "reachable"
            try:
                collection = {"available": True, **read_collection(state, "status")}
            except (SQLAlchemyError, ValueError, RuntimeError):
                collection = {"available": False, "reason": "collection_unavailable"}
        except SQLAlchemyError:
            database["status"] = "unavailable"
            collection = {"available": False, "reason": "database_unavailable"}
    try:
        free_disk = shutil.disk_usage(BACKEND_ROOT).free // (1024 * 1024)
    except OSError:
        free_disk = None
    try:
        restart_fields = read_settings(state).get("restart_fields", [])
        config_status = "ready"
    except (ValueError, OSError, RuntimeError):
        restart_fields = []
        config_status = "unavailable"
    return {
        "server": {"status": "running", "started_at": state.server_started_at,
                   "uptime_seconds": max(0, int(time.time() - state.server_started_at)),
                   "app_env": settings.app_env, "host": settings.server_host,
                   "port": settings.server_port,
                   "auth_database": "mysql" if settings.auth_uses_mysql else "sqlite"},
        "database": database, "collection": collection,
        "resources": {"available_memory_mb": available_memory_mb(), "free_disk_mb": free_disk},
        "configuration": {"status": config_status, "restart_required": restart_fields},
    }
