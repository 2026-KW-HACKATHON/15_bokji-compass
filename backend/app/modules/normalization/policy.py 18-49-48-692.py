"""Convert collected policy JSON into the database policy contract."""

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PolicyRequirementRecord:
    condition_type: str
    information_state: str
    evidence_text: str


@dataclass(frozen=True)
class PolicyRecord:
    title: str
    organization: str
    source_url: str
    source_text: str
    application_start: str | None
    application_end: str | None
    requirements: tuple[PolicyRequirementRecord, ...]


def normalize_policy_json(payload: dict[str, Any]) -> PolicyRecord:
    """Map Gov24 or RawDocument-style JSON to the database contract."""

    title = _first_text(payload, "서비스명", "serviceNm", "title")
    if not title:
        raise ValueError("policy JSON requires 서비스명, serviceNm, or title")

    organization = _first_text(
        payload, "소관기관명", "organization", "orgNm", "deptNm"
    ) or "미상"
    source_url = _first_text(payload, "source_url", "상세URL", "onlineUrl")
    service_id = _first_text(payload, "서비스ID", "serviceId", "document_id")
    source_url = source_url or f"gov24://service/{service_id or title}"
    source_text = _first_text(payload, "source_text", "text") or json.dumps(
        payload, ensure_ascii=False, indent=2
    )
    requirements = _requirements_from_payload(payload)

    return PolicyRecord(
        title=title,
        organization=organization,
        source_url=source_url,
        source_text=source_text,
        application_start=_date_value(payload, "application_start", "신청시작일"),
        application_end=_date_value(payload, "application_end", "신청종료일"),
        requirements=tuple(requirements),
    )


def _requirements_from_payload(
    payload: dict[str, Any],
) -> list[PolicyRequirementRecord]:
    requirements = []
    for key in ("지원대상", "선정기준", "지원조건", "requirements"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            requirements.append(
                PolicyRequirementRecord("other", "specified", value.strip())
            )
        elif isinstance(value, list):
            requirements.extend(
                PolicyRequirementRecord("other", "specified", str(item).strip())
                for item in value
                if str(item).strip()
            )
    return requirements


def _first_text(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _date_value(payload: dict[str, Any], *keys: str) -> str | None:
    value = _first_text(payload, *keys)
    return value if value and len(value) == 10 else None