"""Official examples and boundary cases for advisory financial comparisons."""

import pytest
from pydantic import ValidationError

from app.contracts.finance import FinancialProfile, PolicyFinancialCriteria
from app.modules.finance.public import calculate, evaluate_policy


def facts(**changes):
    data = {
        "household_size": 1,
        "region": "seoul",
        "household_scope_confirmed": True,
        "minor_children": 0,
        "recipient_status": "none",
        "members": [
            {
                "age": 40,
                "earned_income": 0,
                "earned_income_basis": "gross",
                "business_income": 0,
                "business_income_basis": "net_expenses",
                "other_income": 0,
                "private_transfer_income": 0,
                "deduction": "ordinary",
            }
        ],
        "assets": {"housing": 0, "rental_deposit": 0, "general": 0, "financial": 0},
        "debts": {"bank": 0, "public": 0, "other": 0},
        "vehicle_status": "none",
    }
    data.update(changes)
    return FinancialProfile.model_validate(data)


def assessment(profile, index=0):
    return calculate(profile)["assessments"][index]


def test_occupation_does_not_implicitly_apply_student_deductions():
    profile = facts()
    profile.members[0].age = 40
    profile.members[0].earned_income = 1_000_000
    baseline = calculate(profile)
    profile.members[0].occupation = "student"
    assert calculate(profile) == baseline
    assert profile.members[0].deduction == "ordinary"
    assert facts().members[0].occupation == "unknown"


@pytest.mark.parametrize("size", [12, 13, 100])
def test_large_households_use_actual_count(size):
    member = facts().members[0].model_dump()
    profile = facts(household_size=size, members=[member.copy() for _ in range(size)])
    result = calculate(profile)
    assert result["median"]["base"] == 9_515_150 + (size - 7) * (9_515_150 - 8_555_952)
    assert len(profile.members) == size
    with pytest.raises(ValidationError):
        facts(household_size=101, members=[member.copy() for _ in range(101)])


def test_unified_region_requires_review_without_assuming_regional_allowance():
    result = calculate(facts(region="jeonnam_gwangju"))
    assert result["median"]["ratio_percent"] == 0
    assert result["assets"]["gross_total"] == 0
    for index in (0, 1):
        item = result["assessments"][index]
        assert item["status"] == "needs_review"
        assert any("전남광주통합특별시" in message for message in item["missing"])


@pytest.mark.parametrize(
    ("subdivision", "expected_allowance"),
    [("gwangju", 77_000_000), ("other", 53_000_000)],
)
def test_unified_region_uses_selected_subdivision_allowance(subdivision, expected_allowance):
    profile = facts(region="jeonnam_gwangju", region_subdivision=subdivision)
    result = assessment(profile)
    allowance = next(
        item["amount"]
        for item in result["breakdown"]
        if item["label"] == "지역별 기본재산 공제 한도"
    )
    assert allowance == expected_allowance


def car(**changes):
    return {
        "value": 4_999_999,
        "ownership": "household_full",
        "registration_use": "non_commercial",
        "value_basis": "official",
        "eco_subsidy": "none",
        "kind": "passenger",
        "use": "ordinary",
        "displacement_cc": 1999,
        "age_years": 9,
        "seats": 5,
        **changes,
    }


def criteria(**changes):
    return PolicyFinancialCriteria.model_validate(
        {
            "policy_id": "fixture",
            "review_status": "reviewed",
            "rule_id": "gross-median-2026",
            "reference_year": 2026,
            "household_scope": "household",
            "income_basis": "gross_monthly_median",
            "income_limit_percent": 100,
            "asset_basis": "excluding_vehicles",
            "asset_limit": 100_000_000,
            "near_poor_treatment": "none",
            "debt_treatment": "bank_public",
            "source_url": "https://www.mohw.go.kr/",
            "evidence": "Test-only reviewed upper-bound comparison",
            **changes,
        }
    )


def test_zero_and_missing_are_distinct():
    complete = calculate(facts())
    assert complete["median"]["ratio_percent"] == 0
    assert complete["assessments"][0]["checks"][0] == {
        "label": "소득인정액 (월)",
        "value": 0,
        "limit": 820_556,
        "state": "within",
    }
    unknown = calculate(facts(assets={}))
    assert unknown["assets"]["net_total"] is None
    assert unknown["assessments"][0]["status"] == "needs_review"
    assert unknown["assessments"][0]["checks"][0]["state"] == "unknown"
    member = facts().members[0].model_dump()
    member["earned_income"] = 1_172_223  # After 30%: 820,556.1, close to the 820,556 limit.
    boundary = assessment(facts(members=[member]))
    assert boundary["checks"][0]["state"] == "unknown"
    assert any("1원 미만" in item for item in boundary["missing"])


@pytest.mark.parametrize(
    "size,median,limit",
    [
        (1, 2_564_238, 820_556),
        (4, 6_494_738, 2_078_316),
        (8, 10_474_348, 3_351_791),
        (9, 11_433_546, 3_658_734),
    ],
)
def test_published_median_and_rounded_large_household_limits(size, median, limit):
    profile = facts()
    profile = facts(household_size=size, members=[profile.members[0].model_dump()] * size)
    result = calculate(profile)
    assert result["median"]["base"] == median
    assert result["assessments"][0]["checks"][0]["limit"] == limit


@pytest.mark.parametrize(
    "age,deduction,expected",
    [
        (34, "ordinary", 280_000),
        (35, "ordinary", 700_000),
        (64, "ordinary", 700_000),
        (65, "ordinary", 560_000),
        (40, "registered_disabled", 560_000),
        (25, "registered_disabled", 280_000),
    ],
)
def test_individual_income_deductions_do_not_stack(age, deduction, expected):
    member = facts().members[0].model_dump()
    member.update(age=age, deduction=deduction, earned_income=1_000_000)
    assert assessment(facts(members=[member]))["checks"][0]["value"] == expected


def test_youth_fixed_deduction_is_per_person_not_household():
    member = facts().members[0].model_dump()
    member.update(age=25, earned_income=1_000_000)
    result = assessment(facts(household_size=2, members=[member, member]))
    assert result["checks"][0]["value"] == 560_000


def test_rehabilitation_cannot_deduct_unidentified_non_participation_income():
    member = facts().members[0].model_dump()
    member.update(deduction="rehabilitation", earned_income=1_000_000)
    result = assessment(facts(members=[member]))
    assert result["checks"][0]["value"] is None
    assert result["status"] == "needs_review"


def test_allowance_and_debt_are_consumed_once_in_order():
    profile = facts(
        assets={
            "housing": 200_000_000,
            "rental_deposit": 0,
            "general": 30_000_000,
            "financial": 20_000_000,
        },
        debts={"bank": 80_000_000, "public": 0, "other": 0},
    )
    # Housing: cap 172m - 99m allowance - 73m debt = 0.
    # General: 28m overflow + 30m - remaining 7m debt = 51m.
    # Financial: 20m - 5m reserve = 15m. No allowance/debt is reused.
    assert assessment(profile)["checks"][0]["value"] == 3_065_700


def test_rental_deposit_is_95_percent_only_for_basic_recognition():
    profile = facts(
        assets={"housing": 0, "rental_deposit": 100_000_000, "general": 0, "financial": 0}
    )
    result = calculate(profile)
    assert result["assets"]["gross_total"] == 100_000_000
    assert result["assessments"][0]["checks"][0]["value"] == 0
    assert result["assessments"][2]["checks"][1]["value"] == 100_000_000


@pytest.mark.parametrize(
    "vehicle,expected",
    [
        (car(), 0),
        (car(value=5_000_000), 5_000_000),
        (car(value=5_000_000, age_years=10), 0),
        (car(displacement_cc=2000), 4_999_999),
        (car(displacement_cc=2500, age_years=10), 4_999_999),
        (car(kind="small_truck", displacement_cc=None), 0),
    ],
)
def test_vehicle_age_value_and_displacement_boundaries(vehicle, expected):
    assert (
        assessment(facts(vehicle_status="owned", vehicles=[vehicle]))["checks"][0]["value"]
        == expected
    )


def test_general_rate_car_uses_allowance_but_100_percent_car_does_not_use_debt():
    profile = facts(
        vehicle_status="owned",
        vehicles=[car(value=10_000_000, displacement_cc=2000)],
        debts={"bank": 50_000_000, "public": 0, "other": 0},
    )
    assert assessment(profile)["checks"][0]["value"] == 10_000_000


def test_multi_child_car_and_near_poor_ambiguity():
    member = facts().members[0].model_dump()
    profile = facts(
        household_size=3,
        members=[member] * 3,
        minor_children=2,
        vehicle_status="owned",
        vehicles=[car(displacement_cc=2400, seats=7)],
    )
    assert assessment(profile)["checks"][0]["value"] == 0
    assert assessment(profile, 1)["checks"][0]["value"] is None


@pytest.mark.parametrize(
    "vehicles",
    [[car(use="disability")], [car(displacement_cc=0)], [car(), car()], [car(value=None)]],
)
def test_unverified_car_exemptions_and_missing_values_never_pass(vehicles):
    result = assessment(facts(vehicle_status="owned", vehicles=vehicles))
    assert result["status"] == "needs_review"
    assert result["checks"][0]["state"] == "unknown"


def test_near_poor_uses_separate_finance_rate_and_still_requires_expense_review():
    profile = facts(
        assets={"housing": 0, "rental_deposit": 0, "general": 0, "financial": 200_000_000}
    )
    assert assessment(profile)["checks"][0]["value"] == 6_009_600
    near_poor = assessment(profile, 1)
    assert near_poor["checks"][0]["value"] == 4_003_200
    assert near_poor["checks"][0]["state"] == "unknown"
    assert near_poor["status"] == "needs_review"
    member = profile.members[0].model_dump()
    member["private_transfer_income"] = 1_000_000
    with_transfer = facts(members=[member])
    assert assessment(with_transfer)["checks"][0]["value"] is None
    assert assessment(with_transfer, 1)["checks"][0]["value"] == 0


def test_rental_does_not_use_median_or_basic_deductions_and_checks_max_passenger_car():
    profile = facts(vehicle_status="owned", vehicles=[car(value=30_000_000), car(value=20_000_000)])
    result = assessment(profile, 2)
    assert result["checks"][0]["limit"] == 3_432_027
    assert result["checks"][1]["value"] == 50_000_000
    assert result["checks"][1]["limit"] == 345_000_000
    assert result["checks"][2]["value"] == 30_000_000
    assert result["checks"][2]["limit"] == 45_420_000


def test_unknown_year_has_no_current_year_fallback():
    result = calculate(facts(reference_year=2027))
    assert result["median"]["base"] is None
    assert result["median"]["thresholds"] == []
    for item in result["assessments"]:
        assert item["status"] == "needs_review"
        assert item["breakdown"] == []
        assert all(check["limit"] is None and check["value"] is None for check in item["checks"])


def test_saved_recipient_status_does_not_raise_the_median():
    assert calculate(facts())["median"] == calculate(facts(recipient_status="near_poor"))["median"]


def test_reviewed_policy_uses_original_asset_components_for_vehicle_inclusion():
    profile = facts(
        assets={"housing": 0, "rental_deposit": 0, "general": 95_000_000, "financial": 0},
        vehicle_status="owned",
        vehicles=[car(value=10_000_000)],
    )
    excluded = evaluate_policy(profile, criteria())
    included = evaluate_policy(profile, criteria(asset_basis="including_vehicles"))
    assert excluded["checks"][1]["value"] == 95_000_000
    assert excluded["checks"][1]["state"] == "within"
    assert included["checks"][1]["value"] == 105_000_000
    assert included["checks"][1]["state"] == "over"
    assert included["eligibility_decision"] is None


def test_policy_debt_deduction_requires_explicit_reviewed_treatment():
    profile = facts(
        assets={"housing": 0, "rental_deposit": 0, "general": 110_000_000, "financial": 0},
        debts={"bank": 20_000_000, "public": 0, "other": 0},
    )
    assert evaluate_policy(profile, criteria())["checks"][1]["value"] == 90_000_000
    assert (
        evaluate_policy(profile, criteria(debt_treatment="none"))["checks"][1]["value"]
        == 110_000_000
    )
    assert evaluate_policy(profile, criteria(debt_treatment="unknown"))["status"] == "needs_review"


@pytest.mark.parametrize(
    "change",
    [
        {"review_status": "draft"},
        {"evidence": ""},
        {"source_url": "http://example.com"},
        {"source_url": "https://["},
        {"source_url": "https://user:pass@example.com"},
        {"reference_year": 2025},
        {"household_scope": "parents"},
        {"near_poor_treatment": "separate_review"},
        {"income_basis": "unknown"},
        {"asset_basis": "unknown"},
        {"income_limit_percent": None},
    ],
)
def test_unreviewed_or_incompatible_policy_cannot_make_comparisons(change):
    result = evaluate_policy(facts(), criteria(**change))
    assert result["status"] == "needs_review"
    assert all(check["state"] == "unknown" for check in result["checks"])


@pytest.mark.parametrize(
    "change",
    [{"earned_income": -1}, {"earned_income": True}, {"earned_income": 1.5}, {"age": "40"}],
)
def test_money_and_age_reject_coercion(change):
    member = facts().members[0].model_dump()
    member.update(change)
    with pytest.raises(ValidationError):
        facts(members=[member])


@pytest.mark.parametrize(
    "change",
    [
        {"earned_income": 1_000_000, "earned_income_basis": "net"},
        {"earned_income": 1_000_000, "earned_income_basis": "unknown"},
        {"business_income": 1_000_000, "business_income_basis": "revenue"},
        {"business_income": 1_000_000, "business_income_basis": "unknown"},
    ],
)
def test_unconfirmed_income_basis_is_not_summed_or_compared(change):
    member = facts().members[0].model_dump()
    member.update(change)
    profile = facts(members=[member])
    result = calculate(profile)
    assert result["median"]["monthly_income"] is None
    assert result["median"]["ratio_percent"] is None
    for item in result["assessments"]:
        assert item["status"] == "needs_review"
        assert item["checks"][0]["value"] is None
        assert item["checks"][0]["state"] == "unknown"
        assert any("차감하기 전" in reason or "차감 전" in reason for reason in item["missing"])
    reviewed = evaluate_policy(profile, criteria())
    assert reviewed["status"] == "needs_review"
    assert reviewed["checks"][0]["value"] is None
    assert all(item["state"] == "unknown" for item in reviewed["checks"])


def test_confirmed_income_bases_use_salary_and_business_profit_before_personal_taxes():
    member = facts().members[0].model_dump()
    member.update(earned_income=2_000_000, business_income=1_000_000)
    result = calculate(facts(members=[member]))
    assert result["median"]["monthly_income"] == 3_000_000
    assert result["assessments"][0]["checks"][0]["value"] == 2_100_000
    assert result["assessments"][2]["checks"][0]["value"] == 3_000_000


@pytest.mark.parametrize(
    "earned_basis,business_basis", [("unknown", "unknown"), ("net", "revenue")]
)
def test_zero_income_does_not_require_basis_confirmation(earned_basis, business_basis):
    member = facts().members[0].model_dump()
    member.update(earned_income_basis=earned_basis, business_income_basis=business_basis)
    result = calculate(facts(members=[member]))
    assert result["median"]["monthly_income"] == 0
    assert result["assessments"][0]["status"] == "estimated"
    assert result["assessments"][0]["checks"][0]["state"] == "within"


def test_old_profile_defaults_new_evidence_to_unknown_without_losing_original_values():
    profile = facts(vehicle_status="owned", vehicles=[car()]).model_dump()
    profile["members"][0]["earned_income"] = 1_000_000
    for field in ("earned_income_basis", "business_income_basis"):
        profile["members"][0].pop(field)
    for field in ("ownership", "registration_use", "value_basis", "eco_subsidy"):
        profile["vehicles"][0].pop(field)
    loaded = FinancialProfile.model_validate(profile)
    assert loaded.schema_version == 1
    assert loaded.members[0].earned_income == 1_000_000
    assert loaded.members[0].earned_income_basis == "unknown"
    assert loaded.vehicles[0].value == 4_999_999
    assert loaded.vehicles[0].ownership == "unknown"
    result = calculate(loaded)
    assert result["median"]["monthly_income"] is None
    assert result["assets"]["vehicle_total"] == 4_999_999
    assert all(item["status"] == "needs_review" for item in result["assessments"])


@pytest.mark.parametrize(
    "change",
    [
        {"ownership": "joint"},
        {"ownership": "leased"},
        {"ownership": "other"},
        {"ownership": "unknown"},
        {"value_basis": "market"},
        {"value_basis": "unknown"},
        {"registration_use": "unknown"},
        {"eco_subsidy": "received"},
        {"eco_subsidy": "unknown"},
    ],
)
def test_unconfirmed_vehicle_evidence_preserves_raw_sum_but_stops_rule_comparisons(change):
    profile = facts(vehicle_status="owned", vehicles=[car(value=10_000_000, **change)])
    result = calculate(profile)
    assert result["assets"]["vehicle_total"] == 10_000_000
    assert result["assets"]["net_total"] == 10_000_000
    for item in result["assessments"]:
        assert item["status"] == "needs_review"
        assert all(check["state"] == "unknown" for check in item["checks"])
    assert result["assessments"][0]["checks"][0]["value"] is None
    assert result["assessments"][2]["checks"][2]["value"] is None
    reviewed = evaluate_policy(
        profile,
        criteria(
            asset_basis="including_vehicles",
            vehicle_limit=45_420_000,
            vehicle_basis="all_individual_max",
        ),
    )
    assert reviewed["status"] == "needs_review"
    assert all(check["state"] == "unknown" for check in reviewed["checks"])


def test_commercial_car_counts_in_rental_total_but_not_noncommercial_passenger_limit():
    profile = facts(
        vehicle_status="owned",
        vehicles=[
            car(value=350_000_000, registration_use="commercial"),
            car(value=20_000_000),
        ],
    )
    result = assessment(profile, 2)
    assert result["status"] == "estimated"
    assert result["checks"][1]["value"] == 370_000_000
    assert result["checks"][1]["state"] == "over"
    assert result["checks"][2]["value"] == 20_000_000
    assert result["checks"][2]["state"] == "within"
    only_commercial = facts(
        vehicle_status="owned", vehicles=[car(value=50_000_000, registration_use="commercial")]
    )
    assert assessment(only_commercial, 2)["checks"][2]["value"] == 0
    assert assessment(only_commercial)["checks"][0]["value"] is None
    assert assessment(only_commercial)["status"] == "needs_review"


def test_livelihood_use_does_not_exclude_a_car_from_rental_assets():
    profile = facts(vehicle_status="owned", vehicles=[car(value=50_000_000, use="livelihood")])
    result = assessment(profile, 2)
    assert result["checks"][1]["value"] == 50_000_000
    assert result["checks"][1]["state"] == "unknown"
    assert result["status"] == "needs_review"


def rental_criteria(**changes):
    return criteria(
        **{
            "rule_id": "national-rental-2026",
            "income_basis": "urban_worker_monthly",
            "income_limit_percent": 70,
            "asset_basis": "including_vehicles",
            "asset_limit": 345_000_000,
            "vehicle_limit": 45_420_000,
            "debt_treatment": "bank_public",
            "vehicle_basis": "non_commercial_passenger_max",
            **changes,
        }
    )


def test_reviewed_rental_requires_matching_debt_and_registered_vehicle_scope():
    profile = facts(
        assets={"housing": 0, "rental_deposit": 0, "general": 310_000_000, "financial": 0},
        debts={"bank": 20_000_000, "public": 0, "other": 0},
        vehicle_status="owned",
        vehicles=[car(value=50_000_000, registration_use="commercial")],
    )
    result = evaluate_policy(profile, rental_criteria())
    assert result["status"] == "estimated"
    assert result["checks"][1]["value"] == 340_000_000
    assert result["checks"][1]["state"] == "within"
    assert result["checks"][2]["value"] == 0
    assert result["checks"][2]["state"] == "within"


@pytest.mark.parametrize(
    "change",
    [
        {"debt_treatment": "none"},
        {"debt_treatment": "unknown"},
        {"vehicle_basis": "all_individual_max"},
        {"vehicle_basis": "passenger_max"},
        {"vehicle_basis": "unknown"},
    ],
)
def test_reviewed_rental_rejects_incompatible_or_unknown_debt_and_vehicle_scope(change):
    profile = facts(
        vehicle_status="owned", vehicles=[car(value=50_000_000, registration_use="commercial")]
    )
    result = evaluate_policy(profile, rental_criteria(**change))
    assert result["status"] == "needs_review"
    assert all(item["state"] == "unknown" for item in result["checks"])


def test_generic_rule_does_not_inherit_rental_vehicle_scope():
    profile = facts(vehicle_status="owned", vehicles=[car()])
    result = evaluate_policy(
        profile,
        criteria(vehicle_limit=45_420_000, vehicle_basis="non_commercial_passenger_max"),
    )
    assert result["status"] == "needs_review"
    assert all(item["state"] == "unknown" for item in result["checks"])
