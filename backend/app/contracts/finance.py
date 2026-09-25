"""Raw, self-reported financial facts. Missing values are never zero."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Money = Annotated[int, Field(strict=True, ge=0, le=1_000_000_000_000)]


class FinanceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IncomeMember(FinanceModel):
    age: int | None = Field(default=None, strict=True, ge=0, le=120)
    earned_income: Money | None = None
    earned_income_basis: Literal["gross", "net", "unknown"] = "unknown"
    business_income: Money | None = None
    business_income_basis: Literal["net_expenses", "revenue", "unknown"] = "unknown"
    other_income: Money | None = None
    private_transfer_income: Money | None = None
    deduction: Literal[
        "ordinary",
        "student",
        "registered_disabled",
        "north_korean_defector",
        "rehabilitation",
        "other",
        "unknown",
    ] = "unknown"


class Assets(FinanceModel):
    housing: Money | None = None
    rental_deposit: Money | None = None
    general: Money | None = None
    financial: Money | None = None


class Debts(FinanceModel):
    bank: Money | None = None
    public: Money | None = None
    other: Money | None = None


class Vehicle(FinanceModel):
    value: Money | None = None
    ownership: Literal["household_full", "joint", "leased", "other", "unknown"] = "unknown"
    registration_use: Literal["non_commercial", "commercial", "unknown"] = "unknown"
    value_basis: Literal["official", "market", "unknown"] = "unknown"
    eco_subsidy: Literal["none", "received", "unknown"] = "unknown"
    kind: Literal["passenger", "small_van", "small_truck", "other", "unknown"] = "unknown"
    use: Literal["ordinary", "livelihood", "disability", "veteran", "unknown"] = "unknown"
    displacement_cc: int | None = Field(default=None, strict=True, ge=0, le=20000)
    age_years: int | None = Field(default=None, strict=True, ge=0, le=100)
    seats: int | None = Field(default=None, strict=True, ge=1, le=100)


class FinancialProfile(FinanceModel):
    schema_version: Literal[1] = 1
    reference_year: int = Field(default=2026, strict=True, ge=2000, le=2100)
    household_size: int = Field(default=1, strict=True, ge=1, le=12)
    region: Literal["seoul", "gyeonggi", "metropolitan", "other", "unknown"] = "unknown"
    household_scope_confirmed: bool = Field(default=False, strict=True)
    minor_children: int | None = Field(default=None, strict=True, ge=0, le=12)
    recipient_status: Literal["none", "near_poor", "basic", "unknown"] = "unknown"
    members: list[IncomeMember] = Field(min_length=1, max_length=12)
    assets: Assets = Field(default_factory=Assets)
    debts: Debts = Field(default_factory=Debts)
    vehicle_status: Literal["none", "owned", "unknown"] = "unknown"
    vehicles: list[Vehicle] = Field(default_factory=list, max_length=10)
    additional_review: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def coherent_household(self):
        if len(self.members) != self.household_size:
            raise ValueError("가구원 수와 소득 입력 인원이 다릅니다.")
        if self.minor_children is not None and self.minor_children > self.household_size:
            raise ValueError("자녀 수를 확인해 주세요.")
        if self.vehicle_status == "owned" and not self.vehicles:
            raise ValueError("차량 정보를 입력해 주세요.")
        if self.vehicle_status != "owned" and self.vehicles:
            raise ValueError("차량 보유 여부를 확인해 주세요.")
        return self


class CalculationInput(FinanceModel):
    profile: FinancialProfile


class SaveFinancialProfile(CalculationInput):
    consent: Literal[True]


class PolicyFinancialCriteria(FinanceModel):
    """Only server-reviewed mappings can be used for a policy comparison."""

    policy_id: str = Field(min_length=1, max_length=128)
    review_status: Literal["draft", "reviewed"] = "draft"
    rule_id: str = Field(min_length=1, max_length=100)
    reference_year: int = Field(strict=True, ge=2000, le=2100)
    household_scope: Literal["household", "self", "couple", "parents", "unknown"] = "unknown"
    income_basis: Literal[
        "gross_monthly_median", "recognized_monthly_median", "urban_worker_monthly", "unknown"
    ] = "unknown"
    income_limit_percent: int | None = Field(default=None, strict=True, ge=1, le=1000)
    asset_basis: Literal["including_vehicles", "excluding_vehicles", "none", "unknown"] = "unknown"
    asset_limit: Money | None = None
    vehicle_limit: Money | None = None
    debt_treatment: Literal["bank_public", "none", "unknown"] = "unknown"
    vehicle_basis: Literal[
        "all_individual_max", "passenger_max", "non_commercial_passenger_max", "none", "unknown"
    ] = "unknown"
    near_poor_treatment: Literal["none", "separate_review", "unknown"] = "unknown"
    source_url: str = Field(default="", max_length=2048)
    evidence: str = Field(default="", max_length=5000)
