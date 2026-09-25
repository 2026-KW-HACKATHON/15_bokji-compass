"""Canonicalize candidates locally; LLMs never choose official code identifiers."""

from decimal import Decimal

from app.contracts.conditions import (
    FIELD_REGISTRY,
    CanonicalCondition,
    CanonicalPolicy,
    LogicNode,
    unknown_logic,
)
from app.contracts.parsing import ParsedCondition, PolicyExtraction
from app.modules.regions.public import RegionCatalog, default_catalog

CATEGORIES = {
    "gender": {"남성": "MALE", "남자": "MALE", "여성": "FEMALE", "여자": "FEMALE"},
    "employment_status": {"취업자": "EMPLOYED", "미취업자": "UNEMPLOYED",
                          "자영업자": "SELF_EMPLOYED"},
}
FIELD_ALIASES = {"disability_registration": "disability_registered"}


def _number(number: float) -> str:
    # v1 provider values are floats. Reject amounts outside the exact integer envelope.
    if abs(number) > 2**53 - 1:
        raise ValueError("UNSAFE_NUMERIC_PRECISION")
    return format(Decimal(str(number)), "f")


def normalize_condition(condition: ParsedCondition, catalog: RegionCatalog) -> CanonicalCondition:
    data = condition.model_dump()
    data["source_field_key"] = condition.field_key
    data["field_key"] = FIELD_ALIASES.get(condition.field_key, condition.field_key)
    reason = None
    value = condition.value
    if data["field_key"] not in FIELD_REGISTRY:
        data["field_key"] = "unmapped"
        reason = "UNREGISTERED_FIELD"
    elif condition.state_code == 1:
        try:
            if "region" in condition.field_key:
                if value.kind != "TEXT":
                    raise ValueError("REGION_NAME_REQUIRED")
                if value.text not in (condition.evidence_quote or ""):
                    raise ValueError("REGION_NAME_WITHOUT_EVIDENCE")
                resolution = catalog.resolve(value.text)
                region = resolution.region
                if region is None:
                    raise ValueError("REGION_" + resolution.status.upper())
                data["value"] = {"kind": "REGION", "system": region.system,
                                 "code": region.code, "name": region.name,
                                 "snapshot_version": catalog.version,
                                 "include_descendants": True}
            elif value.kind == "NUMBER":
                data["value"] = {"kind": "DECIMAL", "number": _number(value.number)}
            elif value.kind == "NUMBER_RANGE":
                data["value"] = {"kind": "DECIMAL_RANGE", "minimum": _number(value.minimum),
                                 "maximum": _number(value.maximum),
                                 "min_inclusive": value.min_inclusive,
                                 "max_inclusive": value.max_inclusive}
            elif value.kind == "TEXT" and condition.field_key in CATEGORIES:
                code = CATEGORIES[condition.field_key].get(value.text)
                if code is None:
                    raise ValueError("UNRESOLVED_CATEGORY")
                data["value"] = {"kind": "CATEGORY", "code": code}
            CanonicalCondition.model_validate(data)
        except ValueError as error:
            reason = str(error) if str(error).isupper() else "FIELD_TYPE_OR_UNIT_UNRESOLVED"
    if reason:
        unknown_reason = condition.unknown_reason if condition.state_code == 9 else reason
        data.update(state_code=9, operator=None, value=None, unit=None,
                    unknown_reason=unknown_reason,
                    review_note="; ".join(filter(None, [condition.review_note, reason])))
    return CanonicalCondition.model_validate(data)


def normalize_conditions(extraction: PolicyExtraction, *, logic: LogicNode | None = None,
                         catalog: RegionCatalog | None = None) -> CanonicalPolicy:
    catalog = catalog or default_catalog()
    conditions = [normalize_condition(c, catalog) for c in extraction.conditions]
    unresolved = list(extraction.unresolved)
    for condition in conditions:
        if condition.state_code == 9:
            unresolved.append(f"{condition.condition_id}: {condition.unknown_reason}")
        if condition.subject == "unknown":
            unresolved.append(f"{condition.condition_id}: SUBJECT_UNKNOWN")
    logic = logic or unknown_logic("LLM 그룹 간 논리는 검토 후 명시적으로 연결 필요")
    if logic.op == "unknown":
        unresolved.append(logic.reason)
    return CanonicalPolicy(
        policy_key=extraction.policy_key, region_snapshot_version=catalog.version,
        conditions=sorted(conditions, key=lambda c: (c.field_key, c.subject, c.condition_id)),
        logic=logic, coverage="partial" if unresolved or extraction.coverage == "partial"
        else "complete", unresolved=list(dict.fromkeys(unresolved)),
    )
