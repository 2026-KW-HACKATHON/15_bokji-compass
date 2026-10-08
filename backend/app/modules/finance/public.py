"""Pure financial estimates. No DB, authentication, network or LLM dependency.

Missing facts stop the affected comparison; calculations never grant eligibility.
Every rule consumes the original profile, rather than another rule's result.
"""

from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from urllib.parse import urlparse

from app.contracts.finance import FinancialProfile, PolicyFinancialCriteria
from app.modules.finance.rules import (
    MEDIAN_2026,
    REGIONAL_ALLOWANCES,
    RENTAL_ASSET_LIMIT,
    RENTAL_INCOME_LIMITS,
    RENTAL_VEHICLE_LIMIT,
    RULES_VERSION,
    SOURCES,
)

D = Decimal
INCOME_BASIS_NOTE = (
    "근로소득은 세금·사회보험료 차감 전 금액, 사업소득은 필요경비를 뺀 뒤 "
    "소득세·개인지방소득세를 차감하기 전 금액이에요. "
    "실제 심사는 공적 자료의 소득 조회 기간과 사업별 비과세·제외 항목도 확인해요."
)


def won(value):
    return int(D(value).quantize(D("1"), rounding=ROUND_HALF_UP))


def known_sum(values):
    values = list(values)
    return None if any(value is None for value in values) else sum(values)


def median_base(size):
    if size <= 7:
        return MEDIAN_2026[size - 1]
    return MEDIAN_2026[-1] + (size - 7) * (MEDIAN_2026[-1] - MEDIAN_2026[-2])


def benefit_limit(size, percent):
    # Official 8+ household benefit limits extend the rounded 6/7-person values.
    if size <= 7:
        return won(D(median_base(size)) * percent / 100)
    sixth = won(D(MEDIAN_2026[5]) * percent / 100)
    seventh = won(D(MEDIAN_2026[6]) * percent / 100)
    return seventh + (size - 7) * (seventh - sixth)


def income_basis_missing(member, index, *, allow_approximation=False):
    missing = []
    if (
        member.earned_income
        and member.earned_income_basis != "gross"
        and not (allow_approximation and member.earned_income_basis == "net")
    ):
        missing.append(
            f"{index}번째 가구원의 근로소득은 실수령액이 아닌 세금·사회보험료 차감 전 "
            "금액인지 확인해 주세요."
        )
    if member.business_income and member.business_income_basis != "net_expenses":
        missing.append(
            f"{index}번째 가구원의 사업소득은 매출에서 필요경비를 뺀 뒤 "
            "소득세·개인지방소득세를 차감하기 전 금액인지 확인해 주세요."
        )
    return missing


def entered_monthly_income(profile, *, include_private=True):
    values = []
    for index, member in enumerate(profile.members, 1):
        values.extend([member.earned_income, member.business_income, member.other_income])
        if include_private:
            values.append(member.private_transfer_income)
    return known_sum(values)


def monthly_income(profile, *, include_private=True, allow_approximation=False):
    if any(
        income_basis_missing(member, index, allow_approximation=allow_approximation)
        for index, member in enumerate(profile.members, 1)
    ):
        return None
    return entered_monthly_income(profile, include_private=include_private)


def asset_summary(profile):
    property_total = known_sum(profile.assets.model_dump().values())
    debt = known_sum(profile.debts.model_dump().values())
    if profile.vehicle_status == "unknown":
        cars = None
    else:
        cars = known_sum(car.value for car in profile.vehicles)
    gross = known_sum([property_total, cars])
    net = None if gross is None or debt is None else max(0, gross - debt)
    without = None if property_total is None or debt is None else max(0, property_total - debt)
    return {
        "gross_total": gross,
        "net_total": net,
        "without_vehicles": without,
        "vehicle_total": cars,
        "debt_total": debt,
    }


def check(label, value, limit, *, ready=True):
    state = "unknown"
    if ready and value is not None and limit is not None:
        state = "within" if value <= limit else "over"
    return {"label": label, "value": value, "limit": limit, "state": state}


def context_missing(profile):
    missing = []
    if profile.reference_year != 2026:
        missing.append("해당 연도의 공식 산정 규칙이 아직 등록되지 않았어요.")
    if not profile.household_scope_confirmed:
        missing.append("이 사업에서 함께 심사하는 가구원 범위를 확인해 주세요.")
    return missing


def assessed_earnings(profile, *, allow_approximation=False):
    total = D(0)
    missing, breakdown = [], []
    for index, member in enumerate(profile.members, 1):
        basis_missing = income_basis_missing(member, index, allow_approximation=allow_approximation)
        if basis_missing:
            missing.extend(basis_missing)
            continue
        earnings = known_sum([member.earned_income, member.business_income])
        if earnings is None or member.other_income is None:
            missing.append(f"{index}번째 가구원의 소득을 입력해 주세요. 없는 항목은 0원이에요.")
            continue
        if earnings and member.age is None:
            missing.append(f"{index}번째 가구원의 만 나이가 필요해요.")
        if earnings and member.deduction in {
            "unknown",
            "other",
            "north_korean_defector",
            "rehabilitation",
        }:
            missing.append(f"{index}번째 가구원의 추가 소득공제 적용 여부를 확인해야 해요.")
        if earnings and member.deduction == "rehabilitation":
            missing.append("직업재활 참여소득과 다른 소득을 구분해야 공제액을 계산할 수 있어요.")
        if earnings and member.deduction == "student" and (member.age is None or member.age > 34):
            missing.append(f"{index}번째 가구원의 학교 유형·재학 기간에 따른 공제를 확인해야 해요.")
        candidates = [(D(earnings) * D("0.7"), "근로·사업소득 30% 공제")]
        if member.age is not None and member.age <= 34:
            candidates.append((D(max(0, earnings - 600_000)) * D("0.7"), "34세 이하 공제"))
        if (
            member.age is not None and member.age >= 65
        ) or member.deduction == "registered_disabled":
            candidates.append((D(max(0, earnings - 200_000)) * D("0.7"), "65세 이상·장애인 공제"))
        evaluated, description = min(candidates, key=lambda item: item[0])
        total += evaluated + member.other_income
        breakdown.append(
            {
                "label": f"가구원 {index} · {description} 후 소득",
                "amount": won(evaluated + member.other_income),
            }
        )
    return (None if missing else total), missing, breakdown


def private_transfer_assessment(profile):
    """Apply the household allowance once, then average the annual excess over 12."""
    history = profile.private_transfer_history
    current = [member.private_transfer_income for member in profile.members]
    if history is None:
        if all(amount == 0 for amount in current):
            return D(0), [], []
        return None, ["가족·지인 지원금의 최근 12개월 내역·횟수·용도를 확인해 주세요."], []
    current_month = (datetime.now(UTC) + timedelta(hours=9)).strftime("%Y-%m")
    if history.as_of_month != current_month:
        return None, ["가족·지인 지원 내역을 이번 달 기준 최근 12개월로 갱신해 주세요."], []
    if history.status == "unknown":
        return None, ["최근 12개월 동안 가구가 받은 가족·지인 지원 여부를 확인해 주세요."], []
    if history.status == "none":
        if any(amount and amount > 0 for amount in current) or any(
            month.amount or month.count for month in history.months
        ):
            return (
                None,
                ["지원금 없음 선택과 입력한 지원 금액·횟수가 달라요. 내역을 확인해 주세요."],
                [],
            )
        return D(0), [], [{"label": "최근 12개월 가족·지인 지원금 없음", "amount": 0}]
    missing = []
    if history.source not in {"family_friends", "sponsor"}:
        missing.append(
            "지원한 사람의 관계를 확인해야 해요. 외국인 배우자 등은 별도 산정이 필요해요."
        )
    if history.purpose != "living":
        missing.append(
            "학비·의료비·보증금 등 용도가 정해진 지원금은 사용처·증빙을 추가 확인해야 해요."
        )
    amounts, counts = [], []
    for month in history.months:
        amount = month.amount
        if amount is None and history.unentered_months_zero:
            amount = 0
        count = month.count
        if amount == 0 and count is None:
            count = 0
        if amount is None or count is None or (amount > 0) != (count > 0):
            missing.append("최근 12개월의 월별 지원금 합계와 받은 횟수를 확인해 주세요.")
            continue
        amounts.append(amount)
        counts.append(count)
    if missing:
        return None, list(dict.fromkeys(missing)), []
    if not sum(counts):
        return None, ["지원받음 선택과 내역이 달라요. 받은 달의 금액·횟수를 입력해 주세요."], []
    # The guide's printed examples use a rounded whole-won 15% allowance.
    allowance = won(D(median_base(profile.household_size)) * D("0.15"))
    annual_excess = sum(max(0, amount - allowance) for amount in amounts)
    if sum(counts) < 6:
        if annual_excess > D(median_base(profile.household_size)) * D("0.5"):
            return None, ["6회 미만의 큰 금액 지원은 중위소득 50% 예외·사용처 확인이 필요해요."], []
        annual_excess = 0
    monthly = D(annual_excess) / 12
    return (
        monthly,
        [],
        [
            {"label": "가구 월별 가족·지인 지원금 공제 기준 (중위소득 15%)", "amount": allowance},
            {"label": "최근 12개월 가족·지인 지원금 반영 대상 합계", "amount": annual_excess},
            {"label": "가족·지인 지원금 월 소득 반영액 (12개월 평균)", "amount": won(monthly)},
        ],
    )


def vehicle_basis_missing(car, index, *, allow_commercial=False):
    missing = []
    if car.ownership != "household_full":
        missing.append(
            f"차량 {index}의 명의를 확인해 주세요. 본인 또는 가구원 한 명의 단독명의가 "
            "아니면 지분·리스 등 소유 관계를 별도로 확인해야 해요."
        )
    if car.value_basis != "official":
        missing.append(f"차량 {index}은 시세·구입가가 아닌 공적 자료의 차량 전체가액이 필요해요.")
    if car.registration_use == "unknown":
        missing.append(f"차량 {index}의 등록상 영업용·비영업용 구분을 확인해 주세요.")
    elif car.registration_use == "commercial" and not allow_commercial:
        missing.append(f"차량 {index}의 영업용 등록과 생업용 재산 적용 조건을 확인해야 해요.")
    if car.eco_subsidy != "none":
        missing.append(
            f"차량 {index}의 전기차 등 저공해차 보조금 여부와 사업별 가액 처리를 "
            "확인해야 해요. 보조금을 임의로 차감하지 않아요."
        )
    return missing


def basic_vehicles(profile):
    """Return general-property cars and 100%-monthly cars separately."""
    missing, breakdown = [], []
    general, monthly = 0, 0
    if profile.vehicle_status == "unknown":
        return None, None, ["차량 보유 여부를 확인해 주세요."], []
    if len(profile.vehicles) > 1:
        return None, None, ["차량이 여러 대이면 가구별 인정 대수와 예외를 확인해야 해요."], []
    for index, car in enumerate(profile.vehicles, 1):
        basis_missing = vehicle_basis_missing(car, index)
        if basis_missing:
            missing.extend(basis_missing)
            continue
        if car.value is None:
            missing.append("차량의 공적 평가액을 입력해 주세요.")
            continue
        if car.use != "ordinary" or car.kind in {"unknown", "other"}:
            missing.append("생업·장애인·보철용 등 차량의 제외 요건과 증빙을 확인해야 해요.")
            continue
        old_or_cheap = car.value < 5_000_000 or (car.age_years is not None and car.age_years >= 10)
        if car.age_years is None and car.value >= 5_000_000:
            missing.append("차량 연식 또는 최초등록연도를 확인해 주세요.")
            continue
        discounted = False
        if car.kind in {"small_van", "small_truck"}:
            discounted = old_or_cheap
        elif car.kind == "passenger":
            if car.displacement_cc is None or car.displacement_cc == 0:
                missing.append(
                    "승용차 배기량이 필요해요. 전기차는 법정 차급을 별도로 확인해 주세요."
                )
                continue
            if car.displacement_cc < 2000 and old_or_cheap:
                discounted = True
            elif car.displacement_cc < 2500 and old_or_cheap:
                large_family = profile.household_size >= 6
                if not large_family and profile.minor_children is None:
                    missing.append("18세 미만 자녀 수를 확인해야 차량 기준을 적용할 수 있어요.")
                    continue
                large_family = large_family or (profile.minor_children or 0) >= 2
                if large_family and car.seats is None:
                    missing.append("다인·다자녀 차량의 승차 정원을 확인해 주세요.")
                    continue
                discounted = large_family and car.seats >= 7
        if discounted:
            general += car.value
            label = f"차량 {index} · 일반재산에 합산 (월 4.17%)"
        else:
            monthly += car.value
            label = f"차량 {index} · 별도 월 100% 환산"
        breakdown.append({"label": label, "amount": car.value})
    return (None, None, missing, breakdown) if missing else (general, monthly, [], breakdown)


def deduct_in_order(balances, amount):
    """Each allowance/debt is consumed once: residential -> general -> financial."""
    result = list(balances)
    for index, balance in enumerate(result):
        deduction = min(balance, amount)
        result[index] -= deduction
        amount -= deduction
    return result


def recognized_assets(profile, *, financial_rate=D("0.0626"), allow_approximation=False):
    missing, breakdown = [], []
    region = profile.region
    approximate_region = False
    if region == "jeonnam_gwangju":
        if profile.region_subdivision == "gwangju":
            region = "metropolitan"
        elif profile.region_subdivision == "other":
            region = "other"
        elif allow_approximation:
            region = "other"
            approximate_region = True
        else:
            region = None
    if region not in REGIONAL_ALLOWANCES:
        missing.append(
            "전남광주통합특별시의 기본재산 공제 기준은 현재 계산에서 지원하지 않아 "
            "재산의 소득환산액을 계산하지 못했어요."
            if profile.region == "jeonnam_gwangju"
            else "기본재산 공제에 사용할 거주 지역을 선택해 주세요."
        )
    if any(value is None for value in profile.assets.model_dump().values()):
        missing.append("재산 금액을 입력해 주세요. 없는 재산은 0원이에요.")
    if any(value is None for value in profile.debts.model_dump().values()):
        missing.append("부채 금액을 입력해 주세요. 없는 부채는 0원이에요.")
    elif profile.debts.other:
        missing.append("기타 부채는 인정 여부와 증빙을 별도로 확인해야 해요.")
    if (profile.assets.housing or 0) > 0 and (profile.assets.rental_deposit or 0) > 0:
        missing.append(
            "주거용재산은 실제 거주 1호 기준이에요. 주택과 보증금의 주거·일반 분류를 확인해 주세요."
        )
    cars, car_monthly, car_missing, car_breakdown = basic_vehicles(profile)
    missing.extend(car_missing)
    if missing:
        return None, missing, car_breakdown
    allowance, cap = REGIONAL_ALLOWANCES[region]
    residence = D(profile.assets.housing) + D(profile.assets.rental_deposit) * D("0.95")
    general = D(profile.assets.general + cars) + max(D(0), residence - cap)
    balances = [min(residence, D(cap)), general, D(max(0, profile.assets.financial - 5_000_000))]
    balances = deduct_in_order(balances, D(allowance))
    debt = profile.debts.bank + profile.debts.public
    balances = deduct_in_order(balances, D(debt))
    converted = [balances[0] * D("0.0104"), balances[1] * D("0.0417"), balances[2] * financial_rate]
    breakdown.extend(
        [
            {"label": "주거용재산 평가액 (임차보증금 95% 반영)", "amount": won(residence)},
            {
                "label": (
                    "지역별 기본재산 공제 한도 (그 밖의 지역 기준 임시 적용)"
                    if approximate_region
                    else "지역별 기본재산 공제 한도"
                ),
                "amount": allowance,
            },
            {"label": "입력한 금융·공공기관 부채", "amount": debt},
            {"label": "공제 후 주거재산 월 환산", "amount": won(converted[0])},
            {"label": "공제 후 일반재산 월 환산", "amount": won(converted[1])},
            {"label": "공제 후 금융재산 월 환산", "amount": won(converted[2])},
        ]
    )
    breakdown.extend(car_breakdown)
    return sum(converted) + car_monthly, [], breakdown


def basic_assessment(profile, *, allow_approximation=False, approximated=False):
    missing = context_missing(profile)
    income, income_missing, income_breakdown = assessed_earnings(
        profile, allow_approximation=allow_approximation
    )
    assets, assets_missing, assets_breakdown = recognized_assets(
        profile, allow_approximation=allow_approximation
    )
    transfer, transfer_missing, transfer_breakdown = private_transfer_assessment(profile)
    missing.extend(income_missing + assets_missing)
    missing.extend(transfer_missing)
    partial = transfer is None
    if income is not None and transfer is not None:
        income += transfer
    value = None if income is None or assets is None else won(income + assets)
    limit = benefit_limit(profile.household_size, 32) if profile.reference_year == 2026 else None
    if income is not None and assets is not None and limit is not None:
        if D(limit) < income + assets < D(limit + 1):
            missing.append(
                "선정 한도와 1원 미만 차이가 있어요. 원 미만 처리 기준은 현재 계산에서 "
                "지원하지 않아 한도 비교를 제공하지 못했어요."
            )
    return {
        "rule_id": "basic-livelihood-2026",
        "label": "생계급여 기본 산식 · 2026",
        "status": "needs_review" if missing or approximated else "estimated",
        "checks": [
            check(
                "지원금 미반영 참고액 (월)" if partial else "소득인정액 (월)",
                value,
                limit,
                ready=not partial
                and not approximated
                and not any("원 미만 차이" in reason for reason in missing),
            )
        ],
        "missing": list(dict.fromkeys(missing)),
        "notes": [
            "소득인정액을 기준 중위소득 32%와 비교한 참고 계산이에요. 수급 자격 확정이 아니에요.",
            "부양의무자·공적 소득 제외항목·장기저축·처분재산 등은 별도 심사가 필요해요.",
            "의료급여·차상위·기초연금에는 이 계산값을 그대로 적용하지 않아요.",
        ],
        "notice": (
            "가족·지인 지원금이 반영되지 않은 참고액이에요. 지원금 반영 후 기준 비교가 필요해요."
            if partial
            else None
        ),
        "comparison_note": "지원금 반영 후 비교 필요" if partial else None,
        "breakdown": income_breakdown + transfer_breakdown + assets_breakdown,
    }


def near_poor_assessment(profile, *, allow_approximation=False):
    missing = context_missing(profile)
    income, income_missing, income_breakdown = assessed_earnings(
        profile, allow_approximation=allow_approximation
    )
    assets, assets_missing, assets_breakdown = recognized_assets(
        profile,
        financial_rate=D("0.0417"),
        allow_approximation=allow_approximation,
    )
    missing.extend(income_missing + assets_missing)
    # This calculator does not collect pension contributions, qualifying tuition,
    # agricultural interest and all expense deductions specific to this program.
    missing.append(
        "현재 계산은 차상위 확인사업의 국민연금 본인부담·학비·농업 대출이자 등 "
        "추가 지출공제를 반영하지 못해요."
    )
    if any(
        car.kind == "passenger"
        and car.displacement_cc is not None
        and 2000 <= car.displacement_cc < 2500
        for car in profile.vehicles
    ):
        assets = None
        missing.append("2,000~2,500cc 차량의 차상위 적용 조건은 현재 계산에서 지원하지 않아요.")
    value = None if income is None or assets is None else won(income + assets)
    limit = benefit_limit(profile.household_size, 50) if profile.reference_year == 2026 else None
    return {
        "rule_id": "near-poor-2026",
        "label": "차상위 확인사업 기본 산식 · 2026",
        "status": "needs_review",
        "checks": [check("추가 지출공제 전 소득인정액 (월)", value, limit, ready=False)],
        "missing": list(dict.fromkeys(missing)),
        "notes": [
            "금융재산은 생계급여의 월 6.26% 대신 4.17%로 환산하고, 사적이전소득은 제외해요.",
            "기준 중위소득 50%를 참고하되, 추가 공제 전 금액으로 "
            "차상위 해당·탈락을 판단하지 않아요.",
        ],
        "breakdown": income_breakdown + assets_breakdown,
    }


def rental_assessment(profile, summary, *, allow_approximation=False, income_approximated=False):
    missing = context_missing(profile)
    for index, member in enumerate(profile.members, 1):
        missing.extend(income_basis_missing(member, index, allow_approximation=allow_approximation))
    income = monthly_income(profile, include_private=False, allow_approximation=allow_approximation)
    if income is None:
        missing.append("가구원 전원의 근로·사업·기타 소득을 입력해 주세요.")
    if summary["net_total"] is None:
        missing.append("재산·부채와 차량 금액을 빠짐없이 입력해 주세요.")
    if profile.household_size > len(RENTAL_INCOME_LIMITS):
        missing.append("8인 이상 국민임대 소득 한도는 해당 모집공고에서 확인해야 해요.")
    if profile.debts.other:
        missing.append("기타 부채의 인정 여부를 해당 모집공고에서 확인해야 해요.")
    vehicle_limit_value = 0 if profile.vehicle_status == "none" else None
    if profile.vehicle_status == "owned":
        vehicle_missing = [
            reason
            for index, car in enumerate(profile.vehicles, 1)
            for reason in vehicle_basis_missing(car, index, allow_commercial=True)
        ]
        missing.extend(vehicle_missing)
        if any(
            car.value is None
            or car.use != "ordinary"
            or car.kind in {"unknown", "other"}
            or car.displacement_cc == 0
            for car in profile.vehicles
        ):
            missing.append("차량 종류·금액·용도와 장애인·보철용 제외 요건을 확인해야 해요.")
            missing.append("전기차 등 저공해차는 차량가액에서 차감할 보조금도 확인해야 해요.")
        elif not vehicle_missing:
            vehicle_limit_value = max(
                (
                    car.value
                    for car in profile.vehicles
                    if car.kind == "passenger" and car.registration_use == "non_commercial"
                ),
                default=0,
            )
    limit = (
        RENTAL_INCOME_LIMITS[profile.household_size - 1]
        if profile.reference_year == 2026 and profile.household_size <= 7
        else None
    )
    comparison_income = entered_monthly_income(profile, include_private=False)
    return {
        "rule_id": "national-rental-2026",
        "label": "국민임대 일반 소득·자산 · 2026",
        "status": "needs_review" if missing or income_approximated else "estimated",
        "checks": [
            check(
                "도시근로자 기준과 비교할 월소득",
                comparison_income,
                limit,
                ready=income is not None and not income_approximated,
            ),
            check(
                "총자산 (차량 포함·부채 차감)",
                summary["net_total"],
                RENTAL_ASSET_LIMIT,
                ready=summary["net_total"] is not None and profile.debts.other == 0,
            ),
            check(
                "비영업용 승용차 중 가장 높은 가액",
                vehicle_limit_value,
                RENTAL_VEHICLE_LIMIT,
                ready=profile.vehicle_status == "none"
                or (profile.vehicle_status == "owned" and not vehicle_missing),
            ),
        ],
        "missing": list(dict.fromkeys(missing)),
        "notes": [
            INCOME_BASIS_NOTE,
            "기준 중위소득 대신 전년도 도시근로자 월평균소득의 70%를 사용해요. "
            "1인 90%, 2인 80% 기준을 반영했어요.",
            "차량은 총자산에 합산하고, 비영업용 승용차의 개별 한도도 따로 비교해요. "
            "임차보증금은 계약액 전액을 반영해요.",
            "공급유형·면적·맞벌이·자녀·우선공급·무주택·모집일에 따라 조건이 달라져요. "
            "공고문 확인이 필요해요.",
        ],
        "breakdown": [],
    }


def rules_catalog():
    return {
        "reference_years": [2026],
        "rules_version": RULES_VERSION,
        "reviewed_at": "2026-09-25",
        "sources": SOURCES,
        "regional_property_rules": [
            {
                "region": region,
                "status": "supported",
                "basic_property_allowance": allowance,
                "residential_property_limit": cap,
            }
            for region, (allowance, cap) in REGIONAL_ALLOWANCES.items()
        ]
        + [
            {
                "region": "jeonnam_gwangju",
                "status": "unavailable",
                "basic_property_allowance": None,
                "residential_property_limit": None,
            }
        ],
        "programs": [
            {"id": "basic-livelihood-2026", "label": "생계급여 기본 산식"},
            {"id": "near-poor-2026", "label": "차상위 확인사업 기본 산식 (추가 지출공제 전)"},
            {"id": "national-rental-2026", "label": "국민임대 일반 소득·자산"},
        ],
    }


def calculate(profile: FinancialProfile, *, allow_approximation=False) -> dict:
    if not isinstance(profile, FinancialProfile):
        profile = FinancialProfile.model_validate(profile)
    apply_approximation = allow_approximation and profile.reference_year == 2026
    approximations = []
    income_approximated = False
    region_approximated = (
        apply_approximation
        and profile.region == "jeonnam_gwangju"
        and profile.region_subdivision not in {"gwangju", "other"}
    )
    if apply_approximation:
        if region_approximated:
            approximations.append(
                "전남광주통합특별시의 기본재산 공제 기준이 없어 "
                "‘그 밖의 지역’ 기준을 임시 적용했어요."
            )
        for index, member in enumerate(profile.members, 1):
            if member.earned_income and member.earned_income_basis == "net":
                income_approximated = True
                approximations.append(
                    f"{index}번째 가구원의 세후 근로소득을 세전으로 환산하지 않고 "
                    "입력액 그대로 참고 산식에 적용했어요."
                )
    approximated = bool(approximations)
    base = median_base(profile.household_size) if profile.reference_year == 2026 else None
    entered_income = entered_monthly_income(profile)
    ratio = (
        float((D(entered_income) * 100 / base).quantize(D("0.01"), rounding=ROUND_HALF_UP))
        if base and entered_income is not None
        else None
    )
    summary = asset_summary(profile)
    assessments = [
        basic_assessment(
            profile, allow_approximation=apply_approximation, approximated=approximated
        ),
        near_poor_assessment(profile, allow_approximation=apply_approximation),
        rental_assessment(
            profile,
            summary,
            allow_approximation=apply_approximation,
            income_approximated=income_approximated,
        ),
    ]
    if profile.reference_year != 2026:
        for assessment in assessments:
            assessment["checks"] = [
                {**item, "value": None, "limit": None, "state": "unknown"}
                for item in assessment["checks"]
            ]
            assessment["breakdown"] = []
    return {
        "reference_year": profile.reference_year,
        "rules_version": RULES_VERSION,
        "approximations": approximations,
        "median": {
            "base": base,
            "monthly_income": entered_income,
            "ratio_percent": ratio,
            "thresholds": [
                {"percent": percent, "amount": won(D(base) * percent / 100)}
                for percent in (32, 40, 48, 50, 60, 80, 100, 120, 150, 180, 200)
            ]
            if base
            else [],
        },
        "assets": summary,
        "assessments": assessments,
        "sources": SOURCES,
        "notes": [
            INCOME_BASIS_NOTE,
            "월소득의 단순 비율과 사업별 소득인정액은 다른 값이에요.",
            "소득인정액의 원 미만 금액은 참고 표시를 위해 반올림했어요. "
            "실제 심사의 처리 방식은 확인이 필요해요.",
            "비율표는 단순 산술값이에요. 8인 이상 가구의 사업별 선정 한도는 "
            "공식 반올림 방식에 따라 차이가 날 수 있어요.",
            "차량 포함·제외 자산은 입력값을 합산한 참고 금액이며, "
            "공고별 공제 결과와 다를 수 있어요.",
            "차상위 여부는 입력한 자격 정보예요. "
            "차상위라는 이유로 중위소득 기준표를 높이지 않아요.",
            "모르는 금액은 0원으로 처리하지 않아요.",
        ],
    }


def evaluate_policy(profile: FinancialProfile, criteria: PolicyFinancialCriteria) -> dict:
    """Integration point for reviewed policy ingestion/recommendation code.

    Deliberately not a public endpoint accepting caller-asserted review status.
    The service must load criteria from its own reviewed policy repository.
    """
    missing = context_missing(profile)
    try:
        url = urlparse(criteria.source_url)
        valid_url = bool(
            url.scheme == "https" and url.hostname and not url.username and not url.password
        )
    except ValueError:
        valid_url = False
    if criteria.review_status != "reviewed" or not criteria.evidence.strip():
        missing.append("공고의 재무 조건이 아직 검토되지 않았어요.")
    if not valid_url:
        missing.append("공고의 공식 근거 주소를 확인해야 해요.")
    if criteria.reference_year != profile.reference_year:
        missing.append("입력 정보와 공고의 기준연도가 달라요.")
    if criteria.household_scope != "household":
        missing.append("본인·부부·부모 등 이 공고의 심사 대상 범위를 확인해야 해요.")
    if criteria.near_poor_treatment != "none":
        missing.append("차상위 우대·별도 자격 여부를 공고에서 확인해야 해요.")
    checks, notes = [], []
    if (
        criteria.rule_id == "basic-livelihood-2026"
        and criteria.income_basis == "recognized_monthly_median"
    ):
        assessment = basic_assessment(profile)
        missing.extend(assessment["missing"])
        if (
            criteria.income_limit_percent != 32
            or criteria.asset_basis != "none"
            or criteria.asset_limit is not None
            or criteria.vehicle_limit is not None
        ):
            missing.append("생계급여 산식을 다른 사업에 재사용할 수 없어요.")
        checks = assessment["checks"]
    elif (
        criteria.rule_id == "national-rental-2026"
        and criteria.income_basis == "urban_worker_monthly"
    ):
        if (
            criteria.income_limit_percent != 70
            or criteria.asset_basis != "including_vehicles"
            or criteria.asset_limit != RENTAL_ASSET_LIMIT
            or criteria.vehicle_limit != RENTAL_VEHICLE_LIMIT
            or criteria.debt_treatment != "bank_public"
            or criteria.vehicle_basis != "non_commercial_passenger_max"
        ):
            missing.append("국민임대 일반 기준과 다른 모집 조건은 별도 규칙이 필요해요.")
        assessment = rental_assessment(profile, asset_summary(profile))
        missing.extend(assessment["missing"])
        checks = assessment["checks"]
    elif (
        criteria.rule_id == "gross-median-2026" and criteria.income_basis == "gross_monthly_median"
    ):
        for index, member in enumerate(profile.members, 1):
            missing.extend(income_basis_missing(member, index))
        for index, car in enumerate(profile.vehicles, 1):
            missing.extend(vehicle_basis_missing(car, index, allow_commercial=True))
        income = monthly_income(profile)
        limit = (
            won(D(median_base(profile.household_size)) * criteria.income_limit_percent / 100)
            if criteria.income_limit_percent and profile.reference_year == 2026
            else None
        )
        checks.append(check("공고의 월소득 기준", income, limit))
        summary = asset_summary(profile)
        if criteria.asset_basis in {"including_vehicles", "excluding_vehicles"}:
            amount = known_sum(profile.assets.model_dump().values())
            if criteria.asset_basis == "including_vehicles":
                amount = known_sum([amount, summary["vehicle_total"]])
            if criteria.debt_treatment == "bank_public":
                debt = known_sum([profile.debts.bank, profile.debts.public])
                amount = None if amount is None or debt is None else max(0, amount - debt)
                if profile.debts.other != 0:
                    missing.append("기타 부채의 공고별 인정 여부가 확인되지 않았어요.")
            elif criteria.debt_treatment != "none":
                amount = None
                missing.append("공고에서 인정하는 부채 범위를 확인해야 해요.")
            checks.append(check("공고의 자산 기준", amount, criteria.asset_limit))
            notes.append("차량 포함 여부는 검토된 공고 규칙을 적용했어요.")
        elif criteria.asset_basis != "none":
            missing.append("공고의 차량·자산 포함 범위가 확인되지 않았어요.")
        if criteria.vehicle_limit is not None:
            if criteria.vehicle_basis not in {"all_individual_max", "passenger_max"}:
                missing.append("개별 차량 한도의 적용 대상을 확인해야 해요.")
            vehicles = profile.vehicles
            if criteria.vehicle_basis == "passenger_max":
                if any(car.kind in {"unknown", "other"} for car in vehicles):
                    missing.append("승용차 구분이 확인되지 않았어요.")
                vehicles = [car for car in vehicles if car.kind == "passenger"]
            maximum = (
                None
                if profile.vehicle_status == "unknown"
                else max((car.value for car in vehicles if car.value is not None), default=0)
            )
            if any(car.value is None for car in vehicles):
                maximum = None
            checks.append(check("공고의 개별 차량 기준", maximum, criteria.vehicle_limit))
    else:
        missing.append("지원하지 않는 산정 기준이에요. LLM이 임의로 산식을 선택하지 않아요.")
    if any(item["state"] == "unknown" for item in checks):
        missing.append("비교에 필요한 금액 또는 한도가 빠져 있어요.")
    if missing:
        checks = [{**item, "state": "unknown"} for item in checks]
    return {
        "policy_id": criteria.policy_id,
        "rules_version": RULES_VERSION,
        "status": "needs_review" if missing else "estimated",
        "checks": checks,
        "missing": list(dict.fromkeys(missing)),
        "notes": [INCOME_BASIS_NOTE, *notes],
        "source_url": criteria.source_url if valid_url else None,
        "eligibility_decision": None,
    }
