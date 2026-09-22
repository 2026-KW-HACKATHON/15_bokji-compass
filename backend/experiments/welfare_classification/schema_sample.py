"""Export a reviewed snapshot example; not a production normalizer or DB migration."""

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from .contracts import BatchAnalysis, validate_evidence

# Explicit mapping for this six-policy snapshot only. Indices refer to saved candidates.
# A production pipeline needs a field registry and validated structured LLM output.
FIELDS = {
    "gov24:000000465790": {
        2: ("age", "YEARS"), 3: ("birth_date", "DATE"),
        5: ("support_duration", "YEARS"), 9: ("overseas_stay_duration", "DAYS"),
    },
    "gov24:105100000001": {
        2: ("annual_total_income", "KRW_PER_YEAR"),
        3: ("annual_total_income", "KRW_PER_YEAR"),
        4: ("annual_total_income", "KRW_PER_YEAR"),
        5: ("annual_total_income", "KRW_PER_YEAR"),
        6: ("total_assets", "KRW"),
    },
    "gov24:116010000001": {
        1: ("rental_deposit", "KRW"), 2: ("monthly_rent", "KRW_PER_MONTH"),
        3: ("age", "YEARS"), 4: ("income", "KRW"), 5: ("income", "KRW"),
        6: ("time_since_employment", "YEARS"), 7: ("age", "YEARS"),
        8: ("annual_income", "KRW_PER_YEAR"), 9: ("annual_income", "KRW_PER_YEAR"),
    },
    "gov24:119200000001": {7: ("engine_power_increase", "PERCENT")},
    "gov24:119200000007": {
        4: ("age", "YEARS"), 6: ("median_income_ratio", "PERCENT"),
    },
    "bokjiro:WLF00000026": {
        1: ("recognized_income_median_ratio", "PERCENT"),
        2: ("recognized_income_median_ratio", "PERCENT"),
        3: ("age", "YEARS"), 5: ("recognized_income", "KRW"),
        6: ("recognized_income", "KRW"),
        10: ("median_income_ratio", "PERCENT"),
    },
}


def build_sample(folder: Path) -> dict:
    expected = {
        "input.json": "754c90a26c61f8f63bee92302248439e56bf56e9f1e226b8b6cdf318a2ccd9f9",
        "llm-output.json": "b4046c342f82ee0c79fc210c8e857670049c79d92c3e6974dbfa01cc21242611",
    }
    for filename, digest in expected.items():
        if hashlib.sha256((folder / filename).read_bytes()).hexdigest() != digest:
            raise ValueError("This reviewed mapping requires the original six-policy snapshot")
    records = json.loads((folder / "input.json").read_text(encoding="utf-8"))
    analysis = BatchAnalysis.model_validate_json(
        (folder / "llm-output.json").read_text(encoding="utf-8")
    )
    validate_evidence(analysis, records)
    source = {r["policy_key"]: r for r in records}
    policies, conditions, groups = [], [], []
    for policy in sorted(analysis.policies, key=lambda p: p.policy_key):
        key = policy.policy_key
        record = source[key]
        policies.append({
            "policy_key": key, "title": record["title"],
            "organization": record["organization"], "source_hash": record["source_hash"],
            "review_status": "draft", "coverage": policy.coverage,
            "matching_enabled": False, "unresolved": policy.unresolved,
            "source_fields": record["fields"],
        })
        for group in policy.groups:
            groups.append({"policy_key": key, **group.model_dump(),
                           "scope_status": "text_only", "parent_group_id": None})
        for index, candidate in enumerate(policy.conditions, 1):
            c = candidate.model_dump()
            typed = FIELDS.get(key, {}).get(index)
            unknown = c["operator"] == "unknown"
            field_key, unit = typed or (c["field"], None)
            row = {
                "condition_id": f"{key}:c{index:02}", "policy_key": key,
                "field_key": field_key, "subject": c["subject"],
                "state_code": 9 if unknown else 1,
                "operator": None if unknown else c["operator"].upper(),
                "value_type": None if unknown else "TEXT",
                "value_number": None, "value_min": None, "value_max": None,
                "min_inclusive": None, "max_inclusive": None,
                "value_text": None if unknown else c["value"],
                "value_boolean": None, "value_date_min": None, "value_date_max": None,
                "value_code": None, "region_id": None, "unit": unit,
                "reference_basis": None if c["reference_date"] == "unknown"
                else c["reference_date"],
                "role": c["role"], "logic_group": c["logic_group"],
                "source_field": c["source_field"], "evidence_quote": c["evidence_quote"],
                "unknown_reason": "SOURCE_INCOMPLETE" if unknown else None,
                "raw_candidate": c, "matching_enabled": False,
                "review_note": "논리 그룹 범위·예외 검토 필요",
            }
            if typed:
                row["value_text"] = None
                if unit == "DATE":
                    start, end = c["value"].split("~")
                    row.update(value_type="DATE_RANGE", value_date_min=start,
                               value_date_max=end, min_inclusive=True, max_inclusive=True)
                elif c["operator"] == "range":
                    low, high = map(int, c["value"].split("~"))
                    row.update(value_type="NUMBER_RANGE", value_min=low, value_max=high,
                               min_inclusive=True, max_inclusive=True)
                else:
                    row.update(value_type="NUMBER", value_number=int(c["value"]))
            if key == "gov24:000000465790" and index in (2, 3):
                row["reference_basis"] = None
                row["review_note"] = "학년도 적용기간과 나이 기준일 분리; 출생연도·특례 검토 필요"
            if key == "gov24:116010000001" and index == 5:
                row["review_note"] = "부모 소득 6천만원 이하; 원문에 산정기간 미명시"
            if key == "gov24:119200000007" and index == 6:
                row["review_note"] = "4인가구 기준; 소득 주체 및 수급권자와의 AND/OR 미확정"
            conditions.append(row)

        # Region not stated in inspected eligibility/selection text. Do not infer ANY
        # from a national provider or turn the applying office into a residence rule.
        conditions.append({
            "condition_id": f"{key}:residence", "policy_key": key,
            "field_key": "residence_region", "subject": "applicant",
            "state_code": 9, "operator": None, "value_type": None,
            "value_code": None, "region_id": None, "unknown_reason": "NOT_STATED",
            "source_field": None, "evidence_quote": None, "logic_group": None,
            "role": "eligibility", "matching_enabled": False,
            "review_note": "검토한 지원대상·선정기준에서 거주 자격용 공식 지역 코드 미확정",
        })

    # An actual explicit ANY example, scoped only to the stated disability exception.
    key = "gov24:105100000001"
    quote = (
        "부양자녀 및 직계존속 중 동일주소 거주하거나, 질병 등으로 일시퇴거한 "
        "중증장애인은 연령 제한 없음"
    )
    assert quote in source[key]["fields"]["selection"]
    conditions.append({
        "condition_id": f"{key}:age_exception", "policy_key": key,
        "field_key": "age", "subject": "dependent_child_or_lineal_ascendant",
        "state_code": 0, "operator": None, "value_type": None, "value_number": None,
        "value_code": None, "region_id": None, "unknown_reason": None,
        "source_field": "selection", "evidence_quote": quote,
        "logic_group": "age_exception", "role": "eligibility",
        "matching_enabled": False, "review_note": "조건부 나이 제한 면제; 신청인 전체에 적용 금지",
    })
    groups.append({
        "policy_key": key, "group_id": "age_exception", "relation": "exception",
        "description": quote, "source_field": "selection", "evidence_quote": quote,
        "scope_status": "text_only", "parent_group_id": None,
    })
    conditions.sort(key=lambda r: (r["policy_key"], r["field_key"], r["subject"],
                                   r["logic_group"] or "", r["condition_id"]))
    return {
        "schema_version": "proposal-sample-v1", "snapshot_id": folder.name,
        "input_sha256": hashlib.sha256((folder / "input.json").read_bytes()).hexdigest(),
        "state_codes": {"0": "ANY", "1": "SPECIFIED", "8": "UNPROCESSED", "9": "UNKNOWN"},
        "notes": ["DB 미적용; 실제 수집 스냅샷과 기존 LLM 후보의 검토용 변환",
                  "숫자·날짜 외 복합 표현은 TEXT 보존; 단일 코드로 정규화 미완료",
                  "그룹 간 완전한 논리 트리 미구성; 전체 조건 자동 판정 금지",
                  "지역 마스터 미수집; 공식 코드 임의 생성 없음",
                  "정보 없음은 조건 무관 또는 미충족으로 처리 금지"],
        "policies": policies, "condition_groups": groups, "conditions": conditions,
        "regions": [], "condition_regions": [],
    }


def validate_sample(data: dict) -> None:
    policies = {p["policy_key"]: p for p in data["policies"]}
    groups = {(g["policy_key"], g["group_id"]) for g in data["condition_groups"]}
    assert len({r["condition_id"] for r in data["conditions"]}) == len(data["conditions"])
    for row in data["conditions"]:
        assert row["state_code"] in (0, 1, 8, 9)
        if row["logic_group"]:
            assert (row["policy_key"], row["logic_group"]) in groups
        if row["evidence_quote"]:
            assert row["evidence_quote"] in policies[row["policy_key"]]["source_fields"][
                row["source_field"]
            ]
        if row["state_code"] in (0, 8, 9):
            assert all(value is None for key, value in row.items()
                       if key.startswith("value_") or key == "region_id")
        if row["state_code"] == 1:
            assert any(value is not None for key, value in row.items()
                       if key.startswith("value_") and key != "value_type")
        assert row["matching_enabled"] is False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = build_sample(args.experiment)
    validate_sample(data)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "normalized-sample.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    columns = sorted({k for r in data["conditions"] for k in r if k != "raw_candidate"})
    with (args.output / "conditions.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(data["conditions"])
    lines = ["# 실제 복지 데이터 스키마 적용 샘플", "",
             "DB 미적용 · 검토용 · 정책/항목/주체/그룹 순 정렬", "",
             "0=명시적 제한 없음, 1=값 있음, 8=미처리, 9=정보 없음.", "",
             "TEXT는 원문 의미 보존 단계. 자동 비교용 코드 정규화는 미완료.", ""]
    for policy in data["policies"]:
        lines += [f"## {policy['title']}", "",
                  f"`{policy['policy_key']}` · {policy['organization']}",
                  "", "| 항목 | 주체 | 상태 | 연산 | 값 | 단위 | 그룹 | 역할 |",
                  "|---|---|---:|---|---|---|---|---|"]
        for row in data["conditions"]:
            if row["policy_key"] != policy["policy_key"]:
                continue
            value = row.get("value_number")
            if row.get("value_type") == "NUMBER_RANGE":
                value = f"{row['value_min']}~{row['value_max']} (양끝 포함)"
            elif row.get("value_type") == "DATE_RANGE":
                value = f"{row['value_date_min']}~{row['value_date_max']} (양끝 포함)"
            elif value is None:
                value = row.get("value_text")
            cells = [row["field_key"], row["subject"], row["state_code"], row.get("operator"),
                     value, row.get("unit"), row["logic_group"], row["role"]]
            lines.append("| " + " | ".join(str(c).replace("|", "\\|").replace("\n", " ")
                                           if c is not None else "—" for c in cells) + " |")
        lines += ["", "그룹 적용 범위:", ""]
        lines += [f"- `{g['group_id']}` ({g['relation']}): {g['description']}"
                  for g in data["condition_groups"] if g["policy_key"] == policy["policy_key"]]
        lines += ["", "검토 필요:", ""] + [f"- {x}" for x in policy["unresolved"]] + [""]
    (args.output / "readme.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"policies": len(data["policies"]),
                      "conditions": len(data["conditions"]),
                      "states": dict(Counter(r["state_code"] for r in data["conditions"])),
                      "validation": "passed"}))


if __name__ == "__main__":
    main()
