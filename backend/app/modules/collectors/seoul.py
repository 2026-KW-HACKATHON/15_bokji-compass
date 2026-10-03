"""Collector for Seoul Open Data Plaza JSON APIs."""

import hashlib
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request

from app.contracts.public import RawDocument
from app.modules.collectors.data_go_kr import CollectionAPIError
from app.modules.collectors.http import read_response, urlopen, validate_url
from app.modules.collectors.public import collect_notice_text
from app.modules.storage.public import DEFAULT_STORAGE_PATH

DEFAULT_SEOUL_API_BASE_URL = "http://openapi.seoul.go.kr:8088"


def collect_seoul_open_api(
    *,
    service_name: str,
    api_key: str | None = None,
    start: int = 1,
    end: int = 1000,
    base_url: str = DEFAULT_SEOUL_API_BASE_URL,
    storage_path: Path = DEFAULT_STORAGE_PATH,
) -> list[RawDocument]:
    """Fetch Seoul Open API rows and save them as raw documents.

    Seoul APIs commonly return ``{service_name: {row: [...]}}``. Field names
    vary by service, so the adapter keeps the full row as raw text while using
    common title, URL, and publication-date fields when available.
    """

    _validate_service_name(service_name)
    validate_url(base_url, hosts={"openapi.seoul.go.kr"})
    if start < 1 or end < start:
        raise ValueError("start must be at least 1 and end must be >= start")

    resolved_key = api_key or os.getenv("SEOUL_OPEN_API_KEY")
    if not resolved_key or not resolved_key.strip():
        raise ValueError("api_key or SEOUL_OPEN_API_KEY must be provided")

    url = (
        f"{base_url.rstrip('/')}/{quote(resolved_key.strip(), safe='')}/json/"
        f"{quote(service_name.strip(), safe='')}/{start}/{end}/"
    )
    request = Request(url, headers={"User-Agent": "bokji-compass/0.1"})
    with urlopen(request, timeout=15) as response:
        payload = json.loads(read_response(response).decode("utf-8"))

    service_payload = _get_service_payload(payload, service_name)
    result = service_payload.get("RESULT")
    if isinstance(result, dict) and result.get("CODE") not in {None, "INFO-000"}:
        raise CollectionAPIError("seoul_api_error")

    rows = service_payload.get("row", [])
    if not isinstance(rows, list):
        raise ValueError("Seoul Open API response row must be a list")

    documents = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        source_url = _source_url(row, service_name)
        title = _first_value(row, "TITLE", "title", "NAME", "name") or service_name
        published_at = _first_value(
            row, "PUBLISHED_AT", "published_at", "REG_DATE", "reg_date", "DATE"
        )
        documents.append(
            collect_notice_text(
                title=str(title),
                text=json.dumps(row, ensure_ascii=False, indent=2),
                source_url=source_url,
                published_at=str(published_at) if published_at else None,
                storage_path=storage_path,
            )
        )
    return documents


def _get_service_payload(payload: Any, service_name: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or not isinstance(payload.get(service_name), dict):
        raise ValueError(f"Seoul Open API response does not contain {service_name}")
    return payload[service_name]


def _source_url(row: dict[str, Any], service_name: str) -> str:
    explicit_url = _first_value(row, "URL", "url", "HOMEPAGE", "homepage")
    if explicit_url:
        return str(explicit_url)

    identity = _first_value(row, "ID", "id", "SEQ", "seq", "시설ID", "시설명")
    if identity is None:
        identity = hashlib.sha256(
            json.dumps(row, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()[:16]
    return f"seoul-open-api://{service_name}/{identity}"


def _first_value(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return value
    return None


def _validate_service_name(service_name: str) -> None:
    if not isinstance(service_name, str) or not service_name.strip():
        raise ValueError("service_name must be a non-empty string")
