"""Typed, evidence-backed extraction drafts; never eligibility decisions."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class NumberValue(StrictModel):
    kind: Literal["NUMBER"]
    number: float


class NumberRangeValue(StrictModel):
    kind: Literal["NUMBER_RANGE"]
    minimum: float
    maximum: float
    min_inclusive: bool
    max_inclusive: bool

    @model_validator(mode="after")
    def validate_value(self):
        low, high = self.minimum, self.maximum
        if low > high or (low == high and not (self.min_inclusive and self.max_inclusive)):
            raise ValueError("Empty or reversed range")
        return self


class TextValue(StrictModel):
    kind: Literal["TEXT"]
    text: str = Field(min_length=1)


class BooleanValue(StrictModel):
    kind: Literal["BOOLEAN"]
    boolean: bool


class DateRangeValue(StrictModel):
    kind: Literal["DATE_RANGE"]
    date_min: str
    date_max: str
    min_inclusive: bool
    max_inclusive: bool

    @model_validator(mode="after")
    def validate_dates(self):
        low, high = date.fromisoformat(self.date_min), date.fromisoformat(self.date_max)
        if low > high or (low == high and not (self.min_inclusive and self.max_inclusive)):
            raise ValueError("Empty or reversed date range")
        return self


ConditionValue = NumberValue | NumberRangeValue | TextValue | BooleanValue | DateRangeValue


class ParsedCondition(StrictModel):
    condition_id: str = Field(min_length=1, max_length=80)
    field_key: str = Field(pattern=r"^[a-z][a-z0-9_]*$", max_length=80)
    subject: Literal[
        "applicant", "child", "parents", "couple", "household", "guarantor",
        "dependent_child", "lineal_ascendant", "other", "unknown",
    ]
    state_code: Literal[0, 1, 9]
    operator: Literal["EQ", "GT", "GTE", "LT", "LTE", "RANGE"] | None
    value: ConditionValue | None
    unit: str | None
    reference_basis: str | None
    role: Literal["eligibility", "exclusion", "priority", "application", "reference"]
    group_id: str | None
    source_field: str
    evidence_quote: str | None
    unknown_reason: Literal["NOT_STATED", "AMBIGUOUS", "CONFLICTING", "SOURCE_INCOMPLETE"] | None
    review_note: str

    @model_validator(mode="after")
    def validate_state(self):
        if self.state_code == 1:
            if self.value is None or self.operator is None or self.unknown_reason is not None:
                raise ValueError("Specified state requires value/operator and no unknown reason")
            kind = self.value.kind
            if (self.operator == "RANGE") != (kind in {"NUMBER_RANGE", "DATE_RANGE"}):
                raise ValueError("Range operator/value mismatch")
            if kind in {"TEXT", "BOOLEAN"} and self.operator != "EQ":
                raise ValueError("Text/boolean values require EQ")
        elif self.value is not None or self.operator is not None:
            raise ValueError("ANY/UNKNOWN cannot carry a value or operator")
        if (self.state_code == 9) != (self.unknown_reason is not None):
            raise ValueError("Unknown state/reason mismatch")
        if not self.evidence_quote and not (
            self.state_code == 9 and self.unknown_reason == "NOT_STATED"
        ):
            raise ValueError("Evidence required")
        # Official region IDs require a separate verified master. Preserve names only.
        if "region" in self.field_key and self.value and self.value.kind != "TEXT":
            raise ValueError("Unverified region code: retain source region name as TEXT")
        return self


class ConditionGroup(StrictModel):
    group_id: str = Field(min_length=1, max_length=80)
    relation: Literal["all", "any", "exception", "priority", "reference", "unresolved"]
    scope_text: str = Field(min_length=1)
    source_field: str
    evidence_quote: str = Field(min_length=1)


class PolicyExtraction(StrictModel):
    policy_key: str
    conditions: list[ParsedCondition] = Field(max_length=128)
    groups: list[ConditionGroup] = Field(max_length=64)
    coverage: Literal["partial", "complete"]
    unresolved: list[str]


PolicyCategory = Literal["생활·금융", "주거", "일자리", "교육", "건강·돌봄", "문화"]


class SourceEvidence(StrictModel):
    source_field: str = Field(min_length=1, max_length=80)
    quote: str = Field(min_length=1, max_length=500)


class OverviewSection(StrictModel):
    status: Literal["specified", "unrestricted", "not_stated", "unclear"]
    text: str | None
    evidence: list[SourceEvidence] = Field(max_length=8)
    unresolved_reason: str | None

    @model_validator(mode="after")
    def validate_status(self):
        if self.status in {"specified", "unrestricted"}:
            if not self.text or not self.evidence or self.unresolved_reason is not None:
                raise ValueError("Known overview section requires text and evidence")
        elif self.status == "not_stated":
            if self.text is not None or self.evidence or self.unresolved_reason is not None:
                raise ValueError("Not-stated overview section cannot contain inferred data")
        elif not self.unresolved_reason:
            raise ValueError("Unclear overview section requires a reason")
        return self


class OverviewItem(StrictModel):
    text: str = Field(min_length=1, max_length=300)
    evidence: list[SourceEvidence] = Field(min_length=1, max_length=8)


class PolicyRequirementDraft(StrictModel):
    condition_type: Literal["age", "birth_region", "residence_region", "other"]
    information_state: Literal["specified", "unrestricted", "unknown", "not_stated"]
    evidence_text: str = Field(min_length=1)


class LegacyPolicyOverview(StrictModel):
    """Read-only validation of stored welfare-overview-v1 results."""
    title: str = Field(min_length=1, max_length=300)
    source_url: str | None
    category: PolicyCategory | None
    category_reason: str = Field(min_length=1, max_length=240)
    category_evidence: list[SourceEvidence] = Field(min_length=1, max_length=8)
    region_conditions: OverviewSection
    gender_conditions: OverviewSection
    age_conditions: OverviewSection
    other_conditions: list[OverviewItem] = Field(max_length=24)
    benefits: OverviewSection
    unresolved: list[str] = Field(max_length=20)

    @model_validator(mode="after")
    def require_reason_when_uncategorized(self):
        if self.category is None and not self.unresolved:
            raise ValueError("Uncategorized overview requires an unresolved reason")
        return self


class PolicyOverview(LegacyPolicyOverview):
    """Fresh model output must include the v2 requirements; legacy imports stay intact."""

    policy_requirements: list[PolicyRequirementDraft] = Field(min_length=1, max_length=128)


class SourcePolicy(StrictModel):
    policy_key: str
    title: str
    organization: str
    source_url: str | None
    fields: dict[str, str]
    source_hash: str
