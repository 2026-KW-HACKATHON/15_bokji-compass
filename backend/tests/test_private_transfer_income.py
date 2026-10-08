"""2026 guide pp.118-119: household aggregation and incomplete-history safeguards."""

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.contracts.finance import FinancialProfile
from app.modules.finance.public import calculate


def history(**changes):
    data = {
        "as_of_month": (datetime.now(UTC) + timedelta(hours=9)).strftime("%Y-%m"),
        "status": "received",
        "source": "family_friends",
        "purpose": "living",
        "unentered_months_zero": True,
        "months": [{"amount": None, "count": None} for _ in range(12)],
    }
    data.update(changes)
    return data


def profile(transfer=None, size=1, **changes):
    member = {
        "age": 40,
        "earned_income": 0,
        "business_income": 0,
        "other_income": 0,
        "private_transfer_income": 0,
        "deduction": "ordinary",
    }
    data = {
        "household_size": size,
        "household_scope_confirmed": True,
        "region": "seoul",
        "members": [dict(member) for _ in range(size)],
        "private_transfer_history": transfer,
        "assets": {"housing": 0, "rental_deposit": 0, "general": 0, "financial": 0},
        "debts": {"bank": 0, "public": 0, "other": 0},
        "vehicle_status": "none",
    }
    data.update(changes)
    return FinancialProfile.model_validate(data)


def result(data):
    return calculate(data)["assessments"][0]


def test_official_two_person_example_is_5027_not_650000():
    transfer = history()
    # A: two 300,000 payments; B: one 200,000; C: three 650,000.
    transfer["months"][:6] = [
        {"amount": amount, "count": 1}
        for amount in [300_000, 300_000, 200_000, 650_000, 650_000, 650_000]
    ]
    assessment = result(profile(transfer, size=2))
    assert assessment["checks"][0]["value"] == 5027
    assert assessment["status"] == "estimated"
    assert (
        next(
            part["amount"]
            for part in assessment["breakdown"]
            if part["label"] == "최근 12개월 가족·지인 지원금 반영 대상 합계"
        )
        == 60_318
    )


@pytest.mark.parametrize("amount,expected", [(200_000, 0), (384_636, 0), (1_000_000, 615_364)])
def test_regular_support_uses_household_allowance_and_does_not_double_count(amount, expected):
    transfer = history(months=[{"amount": amount, "count": 2} for _ in range(12)])
    data = profile(transfer)
    data.members[0].private_transfer_income = amount
    assessment = result(data)
    assert assessment["checks"][0]["value"] == expected
    assert assessment["checks"][0]["state"] == "within"
    assert calculate(data)["median"]["monthly_income"] == amount


def test_six_receipts_in_one_month_are_regular_and_allowance_is_used_once():
    transfer = history()
    transfer["months"][0] = {"amount": 984_636, "count": 6}
    assert result(profile(transfer))["checks"][0]["value"] == 50_000


def test_fewer_than_six_small_receipts_are_not_assessed():
    transfer = history()
    transfer["months"][0] = {"amount": 500_000, "count": 1}
    assert result(profile(transfer))["checks"][0]["value"] == 0
    assert result(profile(transfer))["status"] == "estimated"


def test_fewer_than_six_large_receipts_require_exception_review():
    transfer = history()
    transfer["months"][0] = {"amount": 5_000_000, "count": 1}
    assessment = result(profile(transfer))
    assert assessment["checks"][0]["state"] == "unknown"
    assert any("50%" in reason for reason in assessment["missing"])


@pytest.mark.parametrize(
    "change",
    [
        {"unentered_months_zero": False},
        {"source": "foreign_spouse"},
        {"source": "unknown"},
        {"purpose": "restricted"},
        {"purpose": "mixed"},
        {"as_of_month": "2020-01"},
        {"status": "unknown"},
    ],
)
def test_unverified_history_preserves_base_amount_but_cannot_pass(change):
    transfer = history(**change)
    transfer["months"][0] = {"amount": 1_000_000, "count": 1}
    data = profile(transfer)
    data.members[0].other_income = 670_000
    assessment = result(data)
    assert assessment["checks"][0]["value"] == 670_000
    assert assessment["checks"][0]["state"] == "unknown"
    assert assessment["comparison_note"] == "지원금 반영 후 비교 필요"
    assert "반영되지" in assessment["notice"]


def test_amount_and_count_must_agree_and_unknown_is_not_zero():
    transfer = history()
    transfer["months"][0] = {"amount": 1_000_000, "count": None}
    assert result(profile(transfer))["checks"][0]["state"] == "unknown"
    transfer["months"][0] = {"amount": 0, "count": 2}
    assert result(profile(transfer))["checks"][0]["state"] == "unknown"


def test_no_support_cannot_override_positive_current_amount():
    data = profile(history(status="none"))
    data.members[0].private_transfer_income = 1_000_000
    assert result(data)["checks"][0]["state"] == "unknown"
    data.members[0].private_transfer_income = None
    assert result(data)["checks"][0]["state"] == "within"


def test_legacy_nonzero_support_shows_partial_amount_and_near_poor_remains_separate():
    data = profile()
    data.members[0].other_income = 670_000
    data.members[0].private_transfer_income = 200_000
    results = calculate(data)["assessments"]
    assert results[0]["checks"][0]["value"] == 670_000
    assert results[0]["checks"][0]["state"] == "unknown"
    assert results[1]["checks"][0]["value"] == 670_000


@pytest.mark.parametrize(
    "change",
    [
        {"as_of_month": "2026-13"},
        {"months": []},
        {"months": [{"amount": -1, "count": True}] * 12},
    ],
)
def test_invalid_history_is_rejected_at_the_contract(change):
    with pytest.raises(ValidationError):
        profile(history(**change))
