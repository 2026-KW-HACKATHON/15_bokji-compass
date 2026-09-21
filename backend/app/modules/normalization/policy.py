"""Convert Gov24 API records into database-ready policy rows."""

import json
import re
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

_DATE_PATTERN = re.compile(r"\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b")


@dataclass(frozen=True)
class PolicyRequirementRow:
    """A row for the ``policy_requirements`` table before policy_id is set."""

    condition_type: str
    information_state: str
    evidence_text: str

    def to_dict(self, *, policy_id: int | None = None) -> dict[str, Any]:
        row = asdict(self)
        if policy_id is not None:
            row["policy_id"] = policy_id
        return row


@dataclass(frozen=True)
class NormalizedPolicy:
    """Database-ready policy data and its condition source rows."""

    policy: dict[str, Any]
    requirements: tuple[PolicyRequirementRow, ...]


def normalize_gov24_service(service: dict[str, Any]) -> NormalizedPolicy:
    """Map one Gov24 service response into ``policies`` and requirements rows."""

    service_id = _value(service, "서비스ID", "serviceId", "서비스 아이디")
    title = _required_value(service, "서비스명", "serviceNm", "title")
    organization = _value(service, "소관기관명", "orgNm", "deptNm") or "미상"
    if service_id:
        source_url = f"gov24://service/{service_id}"
    else:
        source_url = "gov24://service/unknown"

    application_start, application_end = _application_dates(
        _value(service, "신청기한", "applicationPeriod", "applyDeadline")
    )
    source_text = json.dumps(service, ensure_ascii=False, indent=2, sort_keys=True)
    policy = {
        "title": title,
        "organization": organization,
        "source_url": source_url,
        "source_text": source_text,
        "application_start": application_start,
        "application_end": application_end,
        "review_status": "draft",
        "is_synthetic": False,
    }
    requirements = _requirements(service)
    return NormalizedPolicy(policy=policy, requirements=tuple(requirements))


def _requirements(service: dict[str, Any]) -> list[PolicyRequirementRow]:
    requirements = []
    for field_name in ("지원대상", "선정기준"):
        evidence = _value(service, field_name)
        if evidence:
            requirements.append(
                PolicyRequirementRow(
                    condition_type=_condition_type(evidence),
                    information_state="specified",
                    evidence_text=evidence,
                )
            )
    if not requirements:
        requirements.append(
            PolicyRequirementRow(
                condition_type="other",
                information_state="not_stated",
                evidence_text="지원 대상 및 선정 기준 원문 미기재",
            )
        )
    return requirements


def _condition_type(evidence: str) -> str:
    if re.search(r"연령|만\s*\d+세|나이|청년|아동|어르신", evidence):
        return "age"
    if re.search(r"출생|출신 지역|출신지역", evidence):
        return "birth_region"
    if re.search(r"거주|주민등록|주소지|지역", evidence):
        return "residence_region"
    return "other"


def _application_dates(value: str | None) -> tuple[date | None, date | None]:
    if not value:
        return None, None
    dates = []
    for year, month, day in _DATE_PATTERN.findall(value):
        parsed = date(int(year), int(month), int(day))
        if parsed not in dates:
            dates.append(parsed)
    if len(dates) >= 2:
        return dates[0], dates[1]
    return None, None


def _value(service: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = service.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def _required_value(service: dict[str, Any], *keys: str) -> str:
    value = _value(service, *keys)
    if not value:
        raise ValueError("Gov24 service must contain a service name")
    return value