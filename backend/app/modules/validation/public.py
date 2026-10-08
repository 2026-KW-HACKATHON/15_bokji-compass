"""Validate extraction structure and exact source evidence before draft storage."""

from app.contracts.conditions import CanonicalPolicy
from app.contracts.parsing import (
    LegacyPolicyOverview,
    PeriodPolicyOverview,
    PolicyExtraction,
    PolicyOverview,
    SourcePolicy,
    StoredPolicyOverview,
)
from app.modules.regions.public import RegionCatalog, default_catalog
from app.modules.storage.schedule_rules import build_calendar_rule


def validate_extraction(result: PolicyExtraction, source: SourcePolicy) -> None:
    if result.policy_key != source.policy_key:
        raise ValueError("Policy ID mismatch")
    ids = [c.condition_id for c in result.conditions]
    group_ids = [g.group_id for g in result.groups]
    if len(ids) != len(set(ids)) or len(group_ids) != len(set(group_ids)):
        raise ValueError("Duplicate condition/group ID")
    if not result.conditions:
        raise ValueError("Empty extraction; missing data must be explicit")
    for item in [*result.groups, *result.conditions]:
        if item.source_field not in source.fields:
            raise ValueError("Unknown source field")
        if item.evidence_quote and item.evidence_quote not in source.fields[item.source_field]:
            raise ValueError("Evidence is absent from source")
    for condition in result.conditions:
        if condition.group_id is not None and condition.group_id not in group_ids:
            raise ValueError("Unknown condition group")
        if condition.state_code in (0, 1) and condition.group_id is None:
            raise ValueError("Known condition requires a scope group")


def validate_canonical(
    result: CanonicalPolicy, source: SourcePolicy, *, catalog: RegionCatalog | None = None
) -> None:
    """Structural validation plus source evidence and official-master membership."""
    catalog = catalog or default_catalog()
    if result.policy_key != source.policy_key:
        raise ValueError("Canonical policy ID mismatch")
    if result.region_snapshot_version != catalog.version:
        raise ValueError("Canonical region snapshot mismatch")
    for condition in result.conditions:
        if condition.source_field not in source.fields:
            raise ValueError("Unknown canonical source field")
        if (
            condition.evidence_quote
            and condition.evidence_quote not in source.fields[condition.source_field]
        ):
            raise ValueError("Canonical evidence absent from source")
        value = condition.value
        if value is not None and value.kind == "REGION":
            region = catalog.validate_code(value.system, value.code, value.snapshot_version)
            if value.name != region.name:
                raise ValueError("Official region code/name mismatch")


def validate_overview(result: LegacyPolicyOverview, source: SourcePolicy) -> None:
    """Require overview title and citations to match the original source."""
    if result.title != source.title:
        raise ValueError("Overview title differs from source")
    if result.source_url != source.source_url:
        raise ValueError("Overview source URL differs from source")
    evidence_items = [*result.category_evidence]
    for section in (
        result.region_conditions,
        result.gender_conditions,
        result.age_conditions,
        result.benefits,
    ):
        evidence_items.extend(section.evidence)
    for item in result.other_conditions:
        evidence_items.extend(item.evidence)
    if isinstance(result, PeriodPolicyOverview):
        evidence_items.extend(result.application_period.evidence)
    if isinstance(result, PolicyOverview):
        if (
            result.calendar_expression is not None
            and build_calendar_rule(
                result.application_period.model_dump(), result.calendar_expression, source.fields
            )
            is None
        ):
            raise ValueError("Application calendar expression is not supported by the cited source")
        for field_name in (
            "application_method",
            "application_url",
            "contact",
            "published_date",
            "modified_date",
        ):
            evidence_items.extend(getattr(result, field_name).evidence)
    for evidence in evidence_items:
        if evidence.source_field == "title":
            original = source.title
        elif evidence.source_field == "organization":
            original = source.organization
        else:
            original = source.fields.get(evidence.source_field, "")
        if evidence.quote not in original:
            raise ValueError("Overview evidence is absent from source")
    for requirement in (
        result.policy_requirements if isinstance(result, StoredPolicyOverview) else []
    ):
        if requirement.information_state == "not_stated":
            if requirement.evidence_text != "지원 대상 및 선정 기준 원문 미기재":
                raise ValueError("Not-stated requirement must use the standard explanation")
        elif not any(requirement.evidence_text in text for text in source.fields.values()):
            raise ValueError("Policy requirement evidence is absent from source")
