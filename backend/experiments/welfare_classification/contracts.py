"""Experimental candidate contract, separate from production policy schemas."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Tag = Literal[
    "age", "income", "assets", "residence", "household", "disability", "employment",
    "occupation", "education", "nationality", "other",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Candidate(StrictModel):
    field: Tag
    subject: Literal["applicant", "child", "parents", "couple", "household", "other", "unknown"]
    operator: Literal["eq", "gt", "gte", "lt", "lte", "range", "unknown"]
    value: str
    unit: str
    role: Literal["eligibility", "exclusion", "priority", "application", "reference"]
    logic_group: str
    reference_date: str
    source_field: str
    evidence_quote: str = Field(min_length=1, max_length=500)


class Group(StrictModel):
    group_id: str
    relation: Literal["all", "any", "exception", "priority", "reference", "unresolved"]
    description: str
    source_field: str
    evidence_quote: str = Field(min_length=1, max_length=500)


class PolicyAnalysis(StrictModel):
    policy_key: str
    tags: list[Tag]
    conditions: list[Candidate] = Field(max_length=10)
    groups: list[Group] = Field(max_length=6)
    coverage: Literal["partial", "complete"]
    unresolved: list[str]


class BatchAnalysis(StrictModel):
    policies: list[PolicyAnalysis]


def validate_evidence(result: BatchAnalysis, records: list[dict]) -> None:
    """Reject invented quotes/IDs; this does not prove semantic correctness."""
    by_key = {record["policy_key"]: record for record in records}
    actual = [policy.policy_key for policy in result.policies]
    if len(actual) != len(set(actual)) or set(actual) != set(by_key):
        raise ValueError("Missing, duplicated or unknown policy ID")
    for policy in result.policies:
        fields = by_key[policy.policy_key]["fields"]
        group_ids = [group.group_id for group in policy.groups]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError("Duplicate logic group")
        for item in [*policy.conditions, *policy.groups]:
            if (
                item.source_field not in fields
                or item.evidence_quote not in fields[item.source_field]
            ):
                raise ValueError("Evidence quote is absent from its source field")
        if any(item.logic_group not in group_ids for item in policy.conditions):
            raise ValueError("Condition refers to an unknown logic group")
