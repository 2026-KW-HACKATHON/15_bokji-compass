"""Validate extraction structure and exact source evidence before draft storage."""

from app.contracts.conditions import CanonicalPolicy
from app.contracts.parsing import PolicyExtraction, PolicyOverview, SourcePolicy
from app.modules.regions.public import RegionCatalog, default_catalog


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


def validate_canonical(result: CanonicalPolicy, source: SourcePolicy,
                       *, catalog: RegionCatalog | None = None) -> None:
    """Structural validation plus source evidence and official-master membership."""
    catalog = catalog or default_catalog()
    if result.policy_key != source.policy_key:
        raise ValueError("Canonical policy ID mismatch")
    if result.region_snapshot_version != catalog.version:
        raise ValueError("Canonical region snapshot mismatch")
    for condition in result.conditions:
        if condition.source_field not in source.fields:
            raise ValueError("Unknown canonical source field")
        if condition.evidence_quote and condition.evidence_quote not in source.fields[
            condition.source_field
        ]:
            raise ValueError("Canonical evidence absent from source")
        value = condition.value
        if value is not None and value.kind == "REGION":
            region = catalog.validate_code(value.system, value.code, value.snapshot_version)
            if value.name != region.name:
                raise ValueError("Official region code/name mismatch")


def validate_overview(result: PolicyOverview, source: SourcePolicy) -> None:
    """Require every summary/category citation to be an exact source substring."""
    for evidence in result.evidence:
        if evidence.source_field == "title":
            original = source.title
        elif evidence.source_field == "organization":
            original = source.organization
        else:
            original = source.fields.get(evidence.source_field, "")
        if evidence.quote not in original:
            raise ValueError("Overview evidence is absent from source")
