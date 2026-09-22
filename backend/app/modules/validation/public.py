"""Validate extraction structure and exact source evidence before draft storage."""

from app.contracts.parsing import PolicyExtraction, SourcePolicy


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
