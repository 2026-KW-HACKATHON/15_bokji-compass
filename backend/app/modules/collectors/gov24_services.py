"""Collector for the Ministry of the Interior and Safety Gov24 services API."""

import json
from typing import Any

from app.modules.collectors.data_go_kr import request_data_go_kr

DEFAULT_GOV24_SERVICE_LIST_URL = (
    "https://api.odcloud.kr/api/gov24/v3/serviceList"
)


def fetch_recent_public_services(
    *,
    limit: int = 10,
    api_key: str | None = None,
    api_url: str = DEFAULT_GOV24_SERVICE_LIST_URL,
) -> list[dict[str, Any]]:
    """Fetch the first page of the latest Gov24 public services."""

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


def format_public_services(services: list[dict[str, Any]]) -> str:
    """Format service names and identifiers for a concise console output."""

    lines = []
    for index, service in enumerate(services, start=1):
        service_id = service.get("serviceId", service.get("서비스ID", "-"))
        service_name = service.get("serviceNm", service.get("서비스명", "이름 없음"))
        lines.append(f"{index}. {service_name} ({service_id})")
    return "\n".join(lines)
