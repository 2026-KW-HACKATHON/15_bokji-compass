"""Controlled dotenv editing; secrets are write-only and runtime effects are explicit.

The host supplies a trusted APP_CONFIG_FILE path. This module never connects to a
database, collects data, changes authentication or launches an executable.
"""

import hashlib
import json
import math
import os
import re
import stat
import tempfile
import time
from contextlib import contextmanager
from io import StringIO
from pathlib import Path
from typing import get_args, get_origin

from dotenv import dotenv_values
from dotenv.parser import parse_stream
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from app.core.config import Settings
from app.modules.discovery.models import normalize_domains

MAX_CONFIG_BYTES = 512_000
SECRET_FIELDS = frozenset({"db_password", "data_go_kr_api_key", "bokjiro_api_key"})
RESTART_FIELDS = frozenset({
    "db_enabled", "db_host", "db_port", "db_name", "db_user", "db_password", "db_ssl_ca",
})
MODEL_FIELDS = frozenset({
    "codex_model", "codex_fallback_model", "codex_reasoning_effort", "codex_timeout_seconds",
    "parsing_max_input_chars",
})
INGESTION_FIELDS = frozenset({
    "ingestion_enabled",
    "ingestion_page_size", "ingestion_max_pages", "ingestion_max_jobs", "ingestion_max_seconds",
    "ingestion_max_http_calls", "ingestion_max_response_bytes", "ingestion_http_interval_seconds",
    "ingestion_max_model_calls", "ingestion_max_tokens", "ingestion_daily_model_calls",
    "ingestion_daily_bokjiro_calls", "ingestion_daily_gov24_calls", "ingestion_daily_notice_calls",
    "ingestion_scan_interval_seconds", "ingestion_recheck_seconds", "ingestion_queue_limit",
    "ingestion_max_attempts", "ingestion_min_available_memory_mb", "ingestion_min_free_disk_mb",
    "ingestion_discovery_enabled", "ingestion_discovery_domains", "ingestion_discovery_query",
})
EDITABLE_FIELDS = (
    RESTART_FIELDS | MODEL_FIELDS | INGESTION_FIELDS | SECRET_FIELDS | {"policy_auto_publish"}
)
LABELS = {
    "ingestion_enabled": "새 공고 수집 회차 허용",
    "db_enabled": "MySQL 사용", "db_host": "MySQL 주소", "db_port": "MySQL 포트",
    "db_name": "데이터베이스 이름", "db_user": "MySQL 사용자", "db_password": "MySQL 비밀번호",
    "db_ssl_ca": "MySQL CA 인증서 경로", "data_go_kr_api_key": "정부24 API 키",
    "bokjiro_api_key": "복지로 API 키", "codex_model": "기본 모델",
    "codex_fallback_model": "검증 실패 시 모델", "codex_reasoning_effort": "모델 추론 수준",
    "codex_timeout_seconds": "모델 호출 제한 시간(초)",
    "parsing_max_input_chars": "공고 입력 최대 글자 수", "ingestion_page_size": "페이지당 공고 수",
    "ingestion_max_pages": "한 번에 조회할 페이지 수",
    "ingestion_max_jobs": "한 번에 처리할 작업 수",
    "ingestion_max_seconds": "한 번의 수집 제한 시간(초)",
    "ingestion_max_http_calls": "한 번의 HTTP 호출 한도",
    "ingestion_max_response_bytes": "응답 최대 크기(바이트)",
    "ingestion_http_interval_seconds": "HTTP 호출 간격(초)",
    "ingestion_max_model_calls": "한 번의 모델 호출 한도",
    "ingestion_max_tokens": "한 번의 보고된 토큰 한도",
    "ingestion_daily_model_calls": "하루 모델 호출 한도",
    "ingestion_daily_bokjiro_calls": "하루 복지로 호출 한도",
    "ingestion_daily_gov24_calls": "하루 정부24 호출 한도",
    "ingestion_daily_notice_calls": "하루 외부 원문 호출 한도",
    "ingestion_scan_interval_seconds": "전체 목록 재조회 간격(초)",
    "ingestion_recheck_seconds": "기존 공고 수정 확인 간격(초)",
    "ingestion_queue_limit": "대기 작업 최대 개수", "ingestion_max_attempts": "작업 최대 시도 횟수",
    "ingestion_min_available_memory_mb": "최소 여유 메모리(MB)",
    "ingestion_min_free_disk_mb": "최소 여유 디스크(MB)",
    "ingestion_discovery_enabled": "외부 공고 검색 사용",
    "ingestion_discovery_domains": "검색·원문 조회 허용 기관 도메인",
    "ingestion_discovery_query": "외부 공고 검색어",
    "policy_auto_publish": "검증 통과 공고 자동 공개",
}


class SettingsPatch(BaseModel):
    """Only the editor interprets allowed field names; unknown request keys are rejected."""

    model_config = ConfigDict(extra="forbid", strict=True)
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    changes: dict[str, object] = Field(min_length=1, max_length=len(EDITABLE_FIELDS))


class SettingsError(RuntimeError):
    """Safe metadata: never include the submitted or stored value in an exception."""

    def __init__(self, code: str, fields=()):
        super().__init__(code)
        self.code = code
        self.fields = sorted(set(fields))


class SettingsInputError(SettingsError):
    pass


class SettingsConflict(SettingsError):
    pass


class SettingsWriteError(SettingsError):
    pass


def resolve_config_path() -> Path:
    """Use the same APP_CONFIG_FILE resolution as core.load_settings."""
    from app.core.config import BACKEND_ROOT

    path = Path(os.environ.get("APP_CONFIG_FILE", BACKEND_ROOT / ".env"))
    return path if path.is_absolute() else BACKEND_ROOT / path


def _checked_path(path: Path) -> Path:
    path = Path(path).absolute()
    if path.is_symlink() or not path.parent.is_dir() or (path.exists() and not path.is_file()):
        raise SettingsWriteError("config_path_unavailable")
    return path


def _read(path: Path) -> bytes:
    try:
        with path.open("rb") as stream:
            raw = stream.read(MAX_CONFIG_BYTES + 1)
    except FileNotFoundError:
        raw = b""
    except OSError:
        raise SettingsWriteError("config_read_failed") from None
    if len(raw) > MAX_CONFIG_BYTES:
        raise SettingsWriteError("config_file_too_large")
    return raw


def _parse(raw: bytes) -> tuple[str, list]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeError:
        raise SettingsInputError("config_encoding_invalid") from None
    bindings = list(parse_stream(StringIO(text)))
    if any(item.error for item in bindings):
        raise SettingsInputError("config_syntax_invalid")
    return text, bindings


def _env_overrides() -> list[str]:
    return sorted({key.lower() for key in os.environ if key.lower() in EDITABLE_FIELDS})


def _effective(baseline: Settings, text: str) -> Settings:
    values = baseline.model_dump()
    # Existing host-managed references retain normal dotenv interpolation. New submitted
    # strings containing interpolation syntax are refused rather than expanded secretly.
    for key, value in dotenv_values(stream=StringIO(text)).items():
        name = key.lower()
        if name not in EDITABLE_FIELDS or value is None:
            continue
        if get_origin(Settings.model_fields[name].annotation) is list:
            try:
                value = json.loads(value)
            except (ValueError, TypeError):
                raise SettingsInputError("config_value_invalid", [name]) from None
        values[name] = value
    for name in _env_overrides():
        values[name] = getattr(baseline, name)
    try:
        return Settings.model_validate(values)
    except ValidationError:
        raise SettingsInputError("config_value_invalid") from None


def configured_settings(config_path: Path, baseline: Settings) -> Settings:
    """Internal validated desired settings; never serialize this result into an API response."""
    text, _ = _parse(_read(_checked_path(config_path)))
    return _effective(baseline, text)


def _field_metadata(name: str) -> dict:
    field = Settings.model_fields[name]
    annotation = field.annotation
    options = list(get_args(annotation)) if get_origin(annotation) is not list else []
    kind = ("secret" if name in SECRET_FIELDS else "boolean" if annotation is bool
            else "integer" if annotation is int else "number" if annotation is float
            else "domains" if get_origin(annotation) is list
            else "select" if options else "text")
    group = ("database" if name in RESTART_FIELDS else "keys" if name in SECRET_FIELDS
             else "model" if name in MODEL_FIELDS else "ingestion")
    result = {"name": name, "env_name": name.upper(), "label": LABELS[name], "group": group,
              "kind": kind, "restart_required": name in RESTART_FIELDS}
    if options:
        result["options"] = options
    for constraint in field.metadata:
        if getattr(constraint, "ge", None) is not None:
            result["minimum"] = constraint.ge
        if getattr(constraint, "le", None) is not None:
            result["maximum"] = constraint.le
    return result


def _view(raw: bytes, baseline: Settings) -> dict:
    text, _ = _parse(raw)
    settings = _effective(baseline, text)
    return {
        "revision": hashlib.sha256(raw).hexdigest(),
        "values": {name: getattr(settings, name)
                   for name in sorted(EDITABLE_FIELDS - SECRET_FIELDS)},
        "secret_configured": {name: bool(getattr(settings, name).get_secret_value())
                              for name in sorted(SECRET_FIELDS)},
        "fields": [_field_metadata(name) for name in sorted(EDITABLE_FIELDS)],
        "env_overrides": _env_overrides(),
        "restart_fields": sorted(name for name in RESTART_FIELDS
                                 if getattr(settings, name) != getattr(baseline, name)),
    }


def get_view(config_path: Path, baseline: Settings) -> dict:
    """Return desired values, metadata and a revision without revealing secret values."""
    return _view(_read(_checked_path(config_path)), baseline)


def _changes(changes: dict) -> dict:
    if not isinstance(changes, dict) or not changes or set(changes) - EDITABLE_FIELDS:
        raise SettingsInputError("setting_not_editable")
    values = {}
    for name, value in changes.items():
        annotation = Settings.model_fields[name].annotation
        try:
            if name in SECRET_FIELDS:
                if not isinstance(value, str):
                    raise ValueError
            else:
                value = TypeAdapter(annotation).validate_python(value, strict=True)
            if isinstance(value, str):
                limit = (8192 if name in SECRET_FIELDS else 2000
                         if name == "ingestion_discovery_query" else 1024)
                if (len(value) > limit or "${" in value
                        or any(ord(char) < 32 or ord(char) == 127 for char in value)):
                    raise ValueError
                if name not in SECRET_FIELDS:
                    value = value.strip()
                if name == "ingestion_discovery_query" and not value:
                    raise ValueError
                if name == "db_host" and ("/" in value or any(c.isspace() for c in value)):
                    raise ValueError
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError
            if name == "ingestion_discovery_domains":
                if not value:
                    raise ValueError
                value = normalize_domains([domain.strip() for domain in value])
            values[name] = value
        except (ValueError, TypeError, ValidationError):
            raise SettingsInputError("setting_value_invalid", [name]) from None
    return values


def _quoted(value) -> str:
    if isinstance(value, list):
        value = json.dumps(value, ensure_ascii=False)
    elif isinstance(value, bool):
        value = "true" if value else "false"
    else:
        value = str(value)
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _assignment_parts(original: str) -> tuple[str, str]:
    match = re.match(r"(?P<prefix>\s*)(?:export[ \t]+)?[^=\s]+[ \t]*=[ \t]*", original)
    if match is None:
        raise SettingsInputError("config_syntax_invalid")
    tail = original[match.end():]
    suffix = ""
    if tail.startswith(("'", '"')):
        quote, escaped = tail[0], False
        for index, char in enumerate(tail[1:], 1):
            if char == quote and not escaped:
                suffix = tail[index + 1:]
                break
            escaped = char == "\\" and not escaped
    else:
        comment = re.search(r"[ \t]+#[^\r\n]*", tail)
        if comment:
            suffix = comment.group(0)
    return match.group("prefix"), suffix.rstrip("\r\n")


def _render(raw: bytes, changes: dict) -> bytes:
    text, bindings = _parse(raw)
    newline = "\r\n" if "\r\n" in text else "\n"
    rendered, replaced = [], set()
    for binding in bindings:
        name = binding.key.lower() if binding.key else None
        if name in changes:
            prefix, suffix = _assignment_parts(binding.original.string)
            if name not in replaced:
                rendered.append(prefix + name.upper() + "=" + _quoted(changes[name])
                                + suffix + newline)
                replaced.add(name)
            elif suffix.strip().startswith("#"):
                rendered.append(prefix + suffix.strip() + newline)
        else:
            rendered.append(binding.original.string)
    result = "".join(rendered)
    if result and not result.endswith(("\r", "\n")):
        result += newline
    for name in sorted(changes.keys() - replaced):
        result += name.upper() + "=" + _quoted(changes[name]) + newline
    encoded = result.encode("utf-8")
    if len(encoded) > MAX_CONFIG_BYTES:
        raise SettingsInputError("config_file_too_large")
    return encoded


@contextmanager
def _file_lock(path: Path):
    lock_path = path.with_name(path.name + ".server-admin.lock")
    descriptor, locked = None, False
    try:
        if lock_path.is_symlink():
            raise SettingsWriteError("config_lock_unavailable")
        flags = os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(lock_path, flags, 0o600)
        deadline = time.monotonic() + 3
        while True:
            try:
                if os.name == "nt":
                    import msvcrt

                    os.lseek(descriptor, 0, os.SEEK_SET)
                    msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise SettingsConflict("config_writer_busy") from None
                time.sleep(0.03)
        # Windows permits locking beyond EOF but rejects writes into another handle's
        # locked byte. Initialize only after acquisition, including on first creation.
        if os.fstat(descriptor).st_size == 0:
            os.write(descriptor, b"\0")
        yield
    except OSError:
        raise SettingsWriteError("config_lock_unavailable") from None
    finally:
        if descriptor is not None:
            if locked:
                if os.name == "nt":
                    import msvcrt

                    os.lseek(descriptor, 0, os.SEEK_SET)
                    msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)


def _replace(path: Path, raw: bytes):
    temporary = None
    try:
        mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
        descriptor, temporary = tempfile.mkstemp(prefix=".server-settings-", dir=path.parent)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
        temporary = None
    except OSError:
        raise SettingsWriteError("config_write_failed") from None
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except OSError:
                pass


def save_changes(config_path: Path, baseline: Settings, revision: str, changes: dict) -> dict:
    """Validate, compare revision and atomically persist only the explicit allowlist.

    A fresh worker loads ingestion/model/key settings. Existing application DB connections
    need a server restart. Environment-managed settings are readonly to avoid silent shadows.
    """
    if not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9]{64}", revision):
        raise SettingsInputError("config_revision_invalid")
    values = _changes(changes)
    overridden = set(values).intersection(_env_overrides())
    if overridden:
        raise SettingsInputError("setting_managed_by_environment", overridden)
    path = _checked_path(config_path)
    with _file_lock(path):
        raw = _read(_checked_path(path))
        if hashlib.sha256(raw).hexdigest() != revision:
            raise SettingsConflict("config_changed")
        rendered = _render(raw, values)
        candidate = _effective(baseline, rendered.decode("utf-8"))
        try:
            normalize_domains(candidate.ingestion_discovery_domains)
            if (not candidate.ingestion_discovery_query.strip()
                    or len(candidate.ingestion_discovery_query) > 2000):
                raise ValueError
        except ValueError:
            raise SettingsInputError("setting_value_invalid") from None
        _replace(path, rendered)
        result = _view(rendered, baseline)
    result.update({"changed_fields": sorted(values),
                   "restart_required": bool(result["restart_fields"]),
                   "worker_reload_fields": sorted(set(values) - RESTART_FIELDS)})
    return result
