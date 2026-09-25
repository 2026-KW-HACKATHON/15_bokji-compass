"""Versioned canonical condition contract. IDs/status/typed values never share a slot."""

from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from app.contracts.parsing import DateRangeValue, StrictModel


class DecimalValue(StrictModel):
    kind: Literal["DECIMAL"]
    number: str = Field(pattern=r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$")


class DecimalRangeValue(StrictModel):
    kind: Literal["DECIMAL_RANGE"]
    minimum: str = Field(pattern=r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$")
    maximum: str = Field(pattern=r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$")
    min_inclusive: bool
    max_inclusive: bool

    @model_validator(mode="after")
    def bounds(self):
        low, high = Decimal(self.minimum), Decimal(self.maximum)
        if low > high or (low == high and not (self.min_inclusive and self.max_inclusive)):
            raise ValueError("Empty canonical range")
        return self


class CategoryValue(StrictModel):
    kind: Literal["CATEGORY"]
    code: str = Field(min_length=1)


class BooleanValue(StrictModel):
    kind: Literal["BOOLEAN"]
    boolean: bool


class RegionValue(StrictModel):
    kind: Literal["REGION"]
    system: Literal["ADMIN", "LEGAL"]
    code: str = Field(pattern=r"^[0-9]{10}$")
    name: str = Field(min_length=1)
    snapshot_version: str = Field(min_length=1)
    include_descendants: bool


CanonicalValue = (DecimalValue | DecimalRangeValue | CategoryValue | BooleanValue
                  | RegionValue | DateRangeValue)

# Each entry is (allowed kinds, allowed units, category values). No implicit unit coercion.
FIELD_REGISTRY = {
    "age": ({"DECIMAL", "DECIMAL_RANGE"}, {"YEARS"}, set()),
    "gender": ({"CATEGORY"}, {None}, {"MALE", "FEMALE"}),
    "home_ownership": ({"BOOLEAN"}, {None}, set()),
    "employment_status": ({"CATEGORY"}, {None}, {"EMPLOYED", "UNEMPLOYED", "SELF_EMPLOYED"}),
    "disability_registered": ({"BOOLEAN"}, {None}, set()),
    "income": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW"}, set()),
    "monthly_income": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW_PER_MONTH"}, set()),
    "annual_income": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW_PER_YEAR"}, set()),
    "annual_total_income": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW_PER_YEAR"}, set()),
    "total_assets": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW"}, set()),
    **{key: ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW"}, set()) for key in (
        "deposit_amount", "recognized_income_amount", "loan_amount", "existing_loan_amount",
        "guaranteed_loan_amount")},
    "monthly_rent": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW_PER_MONTH"}, set()),
    "annual_property_tax": ({"DECIMAL", "DECIMAL_RANGE"}, {"KRW_PER_YEAR"}, set()),
    "interest_rate": ({"DECIMAL", "DECIMAL_RANGE"}, {"PERCENT"}, set()),
    "guaranteed_amount_ratio": ({"DECIMAL", "DECIMAL_RANGE"}, {"PERCENT"}, set()),
    **{key: ({"BOOLEAN"}, {None}, set()) for key in (
        "employment_preparation_status", "child_tax_credit_recipient",
        "earned_income_tax_credit_recipient", "housing_benefit_recipient",
        "housing_benefit_recipient_certificate_issuance", "hope_keyum_account_membership")},
    "recognized_income_median_ratio": ({"DECIMAL", "DECIMAL_RANGE"}, {"PERCENT"}, set()),
    "household_size": ({"DECIMAL", "DECIMAL_RANGE"}, {"PERSONS"}, set()),
    "residence_duration": ({"DECIMAL", "DECIMAL_RANGE"}, {"DAYS", "MONTHS", "YEARS"}, set()),
    "application_period": ({"DATE_RANGE"}, {None}, set()),
    "birth_date": ({"DATE_RANGE"}, {None}, set()),
    **{key: ({"REGION"}, {None}, set()) for key in (
        "residence_region", "registered_residence_region", "actual_residence_region",
        "work_region", "school_region", "birth_region")},
    "unmapped": (set(), {None}, set()),
    "eligibility": (set(), {None}, set()),
}


class CanonicalCondition(StrictModel):
    condition_id: str = Field(min_length=1)
    field_key: str = Field(json_schema_extra={"enum": list(FIELD_REGISTRY)})
    source_field_key: str
    subject: Literal["applicant", "child", "parents", "couple", "household", "guarantor",
                     "dependent_child", "lineal_ascendant", "other", "unknown"]
    state_code: Literal[0, 1, 9]
    operator: Literal["EQ", "GT", "GTE", "LT", "LTE", "RANGE"] | None
    value: CanonicalValue | None
    unit: str | None
    reference_basis: str | None
    role: Literal["eligibility", "exclusion", "priority", "application", "reference"]
    group_id: str | None
    source_field: str
    evidence_quote: str | None
    unknown_reason: str | None
    review_note: str

    @model_validator(mode="after")
    def check_registry(self):
        if self.field_key not in FIELD_REGISTRY:
            raise ValueError("Unregistered field")
        kinds, units, categories = FIELD_REGISTRY[self.field_key]
        if self.state_code == 1:
            if self.value is None or self.operator is None or self.unknown_reason is not None:
                raise ValueError("Specified condition requires value/operator")
            if self.value.kind not in kinds or self.unit not in units:
                raise ValueError("Field value kind/unit mismatch")
            if (self.operator == "RANGE") != (
                self.value.kind in {"DECIMAL_RANGE", "DATE_RANGE"}
            ):
                raise ValueError("Range operator mismatch")
            if self.value.kind in {"CATEGORY", "BOOLEAN", "REGION"} and self.operator != "EQ":
                raise ValueError("Categorical values require EQ")
            if self.value.kind == "CATEGORY" and self.value.code not in categories:
                raise ValueError("Unknown category")
            numbers = ([self.value.number] if self.value.kind == "DECIMAL" else
                       [self.value.minimum, self.value.maximum]
                       if self.value.kind == "DECIMAL_RANGE" else [])
            for raw in numbers:
                number = Decimal(raw)
                if number < 0 or len(number.as_tuple().digits) > 18:
                    raise ValueError("Negative or excessive numeric value")
                if self.unit != "PERCENT" and number != number.to_integral_value():
                    raise ValueError("Integer unit requires integral value")
        elif self.operator is not None or self.value is not None:
            raise ValueError("ANY/UNKNOWN cannot contain values")
        if self.field_key in {"unmapped", "eligibility"} and self.state_code != 9:
            raise ValueError("Unmapped fields must remain unknown")
        if (self.state_code == 9) != (self.unknown_reason is not None):
            raise ValueError("Unknown reason mismatch")
        if not self.evidence_quote and not (
            self.state_code == 9 and self.unknown_reason == "NOT_STATED"
        ):
            raise ValueError("Evidence required")
        return self


class LogicNode(StrictModel):
    op: Literal["all", "any", "not", "condition", "unknown"]
    condition_id: str | None
    children: list["LogicNode"] = Field(max_length=128)
    reason: str | None

    @model_validator(mode="after")
    def check_shape(self):
        if self.op == "condition":
            valid = bool(self.condition_id) and not self.children and self.reason is None
        elif self.op == "unknown":
            valid = bool(self.reason) and not self.children and self.condition_id is None
        else:
            valid = (self.condition_id is None and self.reason is None and bool(self.children)
                     and (self.op != "not" or len(self.children) == 1))
        if not valid:
            raise ValueError("Invalid logic node shape")
        return self


def unknown_logic(reason: str) -> LogicNode:
    return LogicNode(op="unknown", condition_id=None, children=[], reason=reason)


class CanonicalPolicy(StrictModel):
    schema_version: Literal["welfare-conditions-v2"] = "welfare-conditions-v2"
    policy_key: str
    region_snapshot_version: str
    conditions: list[CanonicalCondition] = Field(min_length=1, max_length=128)
    logic: LogicNode
    coverage: Literal["complete", "partial"]
    unresolved: list[str]

    @model_validator(mode="after")
    def check_references(self):
        ids = {c.condition_id: c for c in self.conditions}
        if len(ids) != len(self.conditions):
            raise ValueError("Duplicate canonical condition ID")
        visited = set()
        count = 0
        has_unknown = False

        def visit(node: LogicNode, depth: int):
            nonlocal count, has_unknown
            count += 1
            if depth > 16 or count > 256:
                raise ValueError("Logic tree too large")
            if node.op == "unknown":
                has_unknown = True
            if node.op == "condition":
                if node.condition_id not in ids:
                    raise ValueError("Dangling condition reference")
                if ids[node.condition_id].role not in {"eligibility", "exclusion"}:
                    raise ValueError("Non-eligibility fact in eligibility logic")
                visited.add(node.condition_id)
            for child in node.children:
                visit(child, depth + 1)
        visit(self.logic, 0)
        relevant = {c.condition_id for c in self.conditions
                    if c.role in {"eligibility", "exclusion"}}
        if self.logic.op != "unknown" and not relevant <= visited:
            raise ValueError("Eligibility logic omits conditions")
        if self.coverage == "complete" and (
            self.unresolved or any(c.state_code == 9 for c in self.conditions)
            or has_unknown or any(c.subject == "unknown" for c in self.conditions)
        ):
            raise ValueError("Incomplete normalization cannot claim complete coverage")
        return self
