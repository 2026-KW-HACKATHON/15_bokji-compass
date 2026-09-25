"""Boundaries that affect code/LLM routing and the meaning of eligibility conditions."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.contracts.conditions import CanonicalPolicy, LogicNode, unknown_logic
from app.contracts.parsing import PolicyExtraction, SourcePolicy
from app.core.config import Settings
from app.modules.normalization.conditions import normalize_conditions
from app.modules.normalization.raw import normalize_record
from app.modules.parsers.conditions import extract_conditions
from app.modules.pipeline import public as pipeline
from app.modules.validation.logic import evaluate_logic
from app.modules.validation.public import validate_canonical, validate_extraction


def source(text, **fields):
    return normalize_record({"서비스ID": "condition-test", "서비스명": "합성 조건 검증",
                             "지원대상": text, **fields})


def normalized(text):
    raw = source(text)
    code = extract_conditions(raw)
    assert code.extraction is not None
    validate_extraction(code.extraction, raw)
    result = normalize_conditions(code.extraction, logic=code.logic)
    validate_canonical(result, raw)
    return result


@pytest.mark.parametrize(("text", "field", "operator", "number"), [
    ("신청자 만 19세 이상", "age", "GTE", "19.0"),
    ("만 35세 미만", "age", "LT", "35.0"),
    ("월소득 1,500,000원 이하", "monthly_income", "LTE", "1500000.0"),
    ("부모 연소득 6000만원 이하", "annual_income", "LTE", "60000000.0"),
    ("총자산 1.5억원 미만", "total_assets", "LT", "150000000.0"),
    ("소득인정액 기준 중위소득 50.5% 초과", "recognized_income_median_ratio", "GT", "50.5"),
])
def test_numeric_rules_preserve_units_and_boundaries(text, field, operator, number):
    result = normalized(text)
    condition = result.conditions[0]
    assert (condition.field_key, condition.operator, condition.value.number) == (
        field, operator, number)
    assert result.coverage == "complete"
    if text.startswith("부모"):
        assert condition.subject == "parents"


def test_zero_false_unrestricted_and_unknown_are_distinct():
    no_income = normalized("무소득자").conditions[0]
    no_house = normalized("무주택자").conditions[0]
    unrestricted = normalized("성별 무관").conditions[0]
    assert no_income.state_code == 1 and no_income.value.number == "0.0"
    assert no_house.state_code == 1 and no_house.value.boolean is False
    assert unrestricted.state_code == 0 and unrestricted.value is None
    unknown = normalized("중구 거주자").conditions[0]
    assert unknown.state_code == 9 and unknown.unknown_reason == "REGION_AMBIGUOUS"
    assert unknown.value is None and unknown.evidence_quote == "중구 거주자"


def test_age_range_keeps_open_upper_boundary():
    age = normalized("만 19세 이상 35세 미만").conditions[0]
    assert age.operator == "RANGE"
    assert age.value.minimum == "19.0" and age.value.maximum == "35.0"
    assert age.value.min_inclusive and not age.value.max_inclusive
    assert extract_conditions(source("만 35세 이상 19세 이하")).extraction is None


@pytest.mark.parametrize("text", [
    "만 19세 이상 또는 등록장애인", "만 19세 이상, 무주택자",
    "만 19세 이상\n무주택자", "만 19세 이상. 다만 학생은 제외",
    "다음 조건 모두 충족: 부모 연소득 6000만원 이하이며 만 19세 이상",
])
def test_complex_scope_never_invents_and_or_subject_inheritance(text):
    code = extract_conditions(source(text))
    assert not code.complete and code.logic.op == "unknown"


def test_simple_complete_policy_skips_llm(tmp_path, monkeypatch):
    def unexpected(*args):
        raise AssertionError("Complete deterministic extraction must not call LLM")
    monkeypatch.setattr(pipeline, "extract_policy", unexpected)
    text = "다음 조건 모두 충족:\n- 만 19세 이상\n- 무주택자\n- 서울특별시 주민등록자"
    result = pipeline.parse_policy(source(text), Settings(_env_file=None), tmp_path)
    assert result["method"] == "code_rules" and result["attempts"] == []
    assert result["canonical"]["coverage"] == "complete"
    assert result["matching_enabled"] is False and result["review_status"] == "draft"
    region = next(c for c in result["canonical"]["conditions"] if "region" in c["field_key"])
    assert region["value"]["code"] == "1100000000"
    assert region["value"]["system"] == "ADMIN"


def test_partial_code_facts_survive_cli_failure(tmp_path, monkeypatch):
    def fail(*args):
        raise pipeline.CodexRunError("codex_timeout")
    monkeypatch.setattr(pipeline, "extract_policy", fail)
    result = pipeline.parse_policy(
        source("다음 조건 모두 충족:\n만 19세 이상\n공고별 특별요건 만족"),
        Settings(_env_file=None), tmp_path)
    assert result["status"] == "failed" and result["analysis"] is None
    assert result["code_analysis"]["conditions"][0]["field_key"] == "age"
    assert result["code_canonical"]["coverage"] == "partial"
    assert result["code_canonical"]["logic"]["op"] == "unknown"


def test_ambiguous_region_uses_llm_but_does_not_trust_unrelated_region(tmp_path, monkeypatch):
    code = extract_conditions(source("중구 거주자"))
    candidate = code.extraction.model_copy(deep=True)
    candidate.conditions[0].value.text = "서울특별시 중구"
    calls = []
    def llm(*args):
        calls.append(args[0].fields["eligibility"])
        return candidate, {}
    monkeypatch.setattr(pipeline, "extract_policy", llm)
    result = pipeline.parse_policy(source("중구 거주자"), Settings(_env_file=None), tmp_path)
    assert calls == ["중구 거주자"]
    condition = result["canonical"]["conditions"][0]
    assert condition["state_code"] == 9
    assert condition["unknown_reason"] == "REGION_NAME_WITHOUT_EVIDENCE"


def test_unregistered_field_wrong_unit_and_large_float_are_preserved_as_unknown():
    code = extract_conditions(source("만 19세 이상")).extraction
    for field, unit, number in [("mystery", "YEARS", 19), ("age", "KRW", 19),
                                ("income", "KRW", 2**53)]:
        candidate = code.model_copy(deep=True)
        candidate.conditions[0].field_key = field
        candidate.conditions[0].unit = unit
        candidate.conditions[0].value.number = float(number)
        result = normalize_conditions(candidate)
        assert result.conditions[0].state_code == 9 and result.coverage == "partial"
        assert result.conditions[0].source_field_key == field
        assert result.conditions[0].evidence_quote == "만 19세 이상"


def test_legacy_unregistered_not_stated_keeps_missing_evidence_semantics():
    candidate = extract_conditions(source("만 19세 이상")).extraction
    condition = candidate.conditions[0]
    condition.field_key = "guarantor_eligibility"
    condition.state_code = 9
    condition.operator = None
    condition.value = None
    condition.unknown_reason = "NOT_STATED"
    condition.evidence_quote = None
    result = normalize_conditions(candidate)
    assert result.conditions[0].field_key == "unmapped"
    assert result.conditions[0].unknown_reason == "NOT_STATED"
    assert "UNREGISTERED_FIELD" in result.conditions[0].review_note


def test_official_code_with_nine_remains_a_value_and_forged_codes_fail():
    result = normalized("경기도 시흥시 거주자")
    region = result.conditions[0]
    assert region.state_code == 1 and region.value.code == "4139000000"
    region.value.code = "9999999999"
    with pytest.raises(ValueError, match="absent"):
        validate_canonical(result, source("경기도 시흥시 거주자"))


def leaf(identity):
    return LogicNode(op="condition", condition_id=identity, children=[], reason=None)


def node(op, *children):
    return LogicNode(op=op, condition_id=None, children=list(children), reason=None)


@pytest.mark.parametrize(("op", "values", "expected"), [
    ("all", ("PASS", "UNKNOWN"), "UNKNOWN"),
    ("all", ("FAIL", "UNKNOWN"), "FAIL"),
    ("any", ("FAIL", "UNKNOWN"), "UNKNOWN"),
    ("any", ("PASS", "UNKNOWN"), "PASS"),
    ("all", ("PASS", "PASS"), "PASS"),
    ("any", ("FAIL", "FAIL"), "FAIL"),
])
def test_three_valued_logic(op, values, expected):
    assert evaluate_logic(node(op, leaf("a"), leaf("b")), dict(zip("ab", values))) == expected


def test_not_and_missing_information():
    tree = node("all", leaf("age"), node("not", leaf("excluded")))
    assert evaluate_logic(tree, {"age": "PASS"}) == "UNKNOWN"
    assert evaluate_logic(tree, {"age": "PASS", "excluded": "PASS"}) == "FAIL"
    assert evaluate_logic(tree, {"age": "PASS", "excluded": "FAIL"}) == "PASS"


def test_logic_references_coverage_and_arity_are_validated():
    base = normalized("만 19세 이상").model_dump()
    for logic in [leaf("absent"), node("all", leaf("code_1"), unknown_logic("unknown branch"))]:
        with pytest.raises(ValidationError):
            CanonicalPolicy.model_validate({**base, "logic": logic.model_dump()})
    for op, children in [("all", []), ("not", [leaf("a"), leaf("b")])]:
        with pytest.raises(ValidationError):
            node(op, *children)


def test_extraction_does_not_infer_region_from_organization_or_benefits():
    record = source("무주택자", 소관기관명="서울특별시", 지원내용="서울특별시 소재 기관 상담")
    result = extract_conditions(record)
    assert [c.field_key for c in result.extraction.conditions] == ["home_ownership"]


def test_explicit_application_period_and_cross_field_scope():
    record = source("만 19세 이상", 신청기한="2026-01-01 ~ 2026-12-31")
    code = extract_conditions(record)
    assert code.complete
    assert code.extraction.conditions[-1].role == "application"
    assert len(code.logic.children) == 1
    combined = extract_conditions(source("만 19세 이상", 선정기준="무주택자"))
    assert not combined.complete and "cross_field_scope" in combined.unresolved_fields


def test_json_schema_export_matches_runtime_contract():
    schema = CanonicalPolicy.model_json_schema()
    path = Path(__file__).resolve().parents[1] / "schemas/welfare-conditions-v2.schema.json"
    assert json.loads(path.read_text(encoding="utf-8")) == schema


def test_public_cli_fixtures_keep_all_conditions_and_block_unreviewed_logic():
    path = Path(__file__).parent / "fixtures/conditions/public_extractions.json"
    cases = json.loads(path.read_text(encoding="utf-8"))["cases"]
    assert len(cases) == 2
    for case in cases:
        raw = SourcePolicy.model_validate(case["source"])
        extraction = PolicyExtraction.model_validate(case["extraction"])
        validate_extraction(extraction, raw)
        code = extract_conditions(raw)
        assert not code.complete
        result = normalize_conditions(extraction)
        validate_canonical(result, raw)
        assert len(result.conditions) == len(extraction.conditions)
        assert {c.condition_id for c in result.conditions} == {
            c.condition_id for c in extraction.conditions}
        assert result.coverage == "partial" and result.logic.op == "unknown"
        assert any(c.state_code == 9 for c in result.conditions)
