"""Collector for the Ministry of the Interior and Safety Gov24 services API."""

import json
from typing import Any, Literal

from app.modules.collectors.data_go_kr import (
    DEFAULT_MAX_RESPONSE_BYTES,
    CollectionAPIError,
    request_data_go_kr,
)
from app.modules.collectors.pages import CollectionPage, page_number

DEFAULT_GOV24_SERVICE_LIST_URL = (
    "https://api.odcloud.kr/api/gov24/v3/serviceList"
)
DEFAULT_GOV24_API_BASE_URL = "https://api.odcloud.kr/api/gov24/v3"


def fetch_gov24_page(
    *, page: int = 1, per_page: int = 10,
    endpoint: Literal["serviceList", "serviceDetail", "supportConditions"] = "serviceList",
    api_key: str | None = None,
    api_base_url: str = DEFAULT_GOV24_API_BASE_URL,
    timeout: float = 15,
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    deadline: float | None = None,
) -> CollectionPage:
    """Fetch one independent endpoint page. Joining by service ID belongs to the worker."""
    if endpoint not in {"serviceList", "serviceDetail", "supportConditions"}:
        raise ValueError("Unsupported Gov24 endpoint")
    if not isinstance(page, int) or not isinstance(per_page, int):
        raise ValueError("page and per_page must be positive integers")
    page_number(page, "page")
    page_number(per_page, "per_page")
    raw = request_data_go_kr(
        f"{api_base_url.rstrip('/')}/{endpoint}", api_key=api_key,
        params={"page": page, "perPage": per_page, "returnType": "JSON"},
        timeout=timeout, max_response_bytes=max_response_bytes, deadline=deadline,
    )
    return _parse_page(raw, page, per_page)


def _parse_page(raw: bytes, requested_page: int, requested_per_page: int) -> CollectionPage:
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeError, json.JSONDecodeError):
        raise ValueError("Invalid Gov24 JSON response") from None
    if not isinstance(payload, dict):
        raise ValueError("Gov24 response must be an object")
    if "code" in payload:
        code = payload["code"]
        if isinstance(code, bool) or not isinstance(code, (int, str)):
            raise ValueError("Invalid Gov24 result code")
        if code not in {0, "0", 200, "200"}:
            raise CollectionAPIError("gov24_api_error")
    rows = payload.get("data")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Gov24 response must contain a data list of records")
    page = page_number(payload.get("page", requested_page), "page")
    per_page = page_number(payload.get("perPage", requested_per_page), "perPage")
    if page != requested_page or per_page > requested_per_page or len(rows) > per_page:
        raise ValueError("Gov24 response page does not match the requested bounds")
    total = payload.get("totalCount")
    total_count = None if total is None else page_number(total, "totalCount", allow_zero=True)
    return CollectionPage(rows, page, per_page, total_count, raw)


def fetch_recent_public_services(
    *,
    limit: int = 10,
    api_key: str | None = None,
    api_url: str = DEFAULT_GOV24_SERVICE_LIST_URL,
) -> list[dict[str, Any]]:
    """Fetch the first page in the provider's order; latest-first order is not guaranteed."""

    if limit < 1:
        raise ValueError("limit must be a positive integer")

    response = request_data_go_kr(
        api_url,
        api_key=api_key,
        params={"page": 1, "perPage": limit, "returnType": "JSON"},
    )
    payload = json.loads(response.decode("utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ValueError("Gov24 serviceList response must contain a data list")
    return [item for item in payload["data"] if isinstance(item, dict)][:limit]
