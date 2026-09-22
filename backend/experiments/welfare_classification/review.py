"""Predefined spot checks against source facts, not an overall accuracy score."""

import argparse
import json
import re
from pathlib import Path


def numeric_values(value: str) -> list[float]:
    return [float(number) for number in re.findall(r"\d+(?:\.\d+)?", value.replace(",", ""))]


def review(result: dict) -> list[dict]:
    policies = {row["policy_key"]: row for row in result["policies"]}
    checks = [
        ("child_age", "gov24:000000465790", "age", "child", "range", [3, 5],
         "유아 3~5세를 신청 보호자의 나이와 구분"),
        ("household_assets", "gov24:105100000001", "assets", "household", "lt", [240000000],
         "가구원 전체 재산 2억4천만원 미만"),
        ("parent_income", "gov24:116010000001", "income", "parents", "lte", [60000000],
         "부모 소득 6천만원 이하를 신청자 소득과 구분"),
        ("bokjiro_age", "bokjiro:WLF00000026", "age", "applicant", "gte", [19],
         "등록장애인 지원대상의 19세 이상"),
        ("income_lower_exclusive", "bokjiro:WLF00000026", "income", "household", "gt", [50],
         "가구 소득인정액의 중위소득 비율 50% 초과"),
        ("income_upper_inclusive", "bokjiro:WLF00000026", "income", "household", "lte", [100],
         "가구 소득인정액의 중위소득 비율 100% 이하"),
    ]
    results = []
    for name, key, field, subject, operator, numbers, description in checks:
        found = any(
            candidate["field"] == field and candidate["subject"] == subject
            and candidate["operator"] == operator and numeric_values(candidate["value"]) == numbers
            for candidate in policies.get(key, {}).get("conditions", [])
        )
        results.append({"check": name, "policy_key": key, "expected": description,
                        "passed": found})
    for name, key, relation, description in [
        ("priority_not_eligibility", "gov24:119200000001", "priority", "장비 지원 우선순위 구분"),
        ("alternative_criteria", "gov24:119200000007", "any", "해양사고 지원 기준 어느 하나 구분"),
    ]:
        found = any(group["relation"] == relation
                    for group in policies.get(key, {}).get("groups", []))
        results.append({"check": name, "policy_key": key, "expected": description,
                        "passed": found})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("result", type=Path)
    args = parser.parse_args()
    checks = review(json.loads(args.result.read_text(encoding="utf-8")))
    report = {"checks": checks, "passed": sum(item["passed"] for item in checks),
              "total": len(checks), "scope": "8 selected facts; not full-policy correctness"}
    args.result.with_name("spot-checks.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
