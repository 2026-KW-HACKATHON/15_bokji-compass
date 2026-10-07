"""Presentation helpers for public service data."""

from typing import Any

from app.modules.presentation.policy import format_notice_text, payment_schedule, policy_description
from app.modules.presentation.signals import load_popularity, policy_signals

__all__ = ["format_notice_text", "format_public_services", "payment_schedule", "policy_description",
           "load_popularity", "policy_signals"]


def format_public_services(services: list[dict[str, Any]]) -> str:
    """Format service names and identifiers for a concise console output."""

    lines = []
    for index, service in enumerate(services, start=1):
        service_id = service.get("serviceId", service.get("서비스ID", "-"))
        service_name = service.get("serviceNm", service.get("서비스명", "이름 없음"))
        lines.append(f"{index}. {service_name} ({service_id})")
    return "\n".join(lines)
