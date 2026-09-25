"""Conservative whole-clause rules. Complex scopes are handed to the LLM intact."""

import re
from dataclasses import dataclass
from decimal import Decimal

from app.contracts.conditions import LogicNode, unknown_logic
from app.contracts.parsing import ConditionGroup, ParsedCondition, PolicyExtraction, SourcePolicy

RULE_VERSION = "conditions-rules-v1"
OPERATORS = {"이상": "GTE", "초과": "GT", "이하": "LTE", "미만": "LT"}
SUBJECTS = {"신청자": "applicant", "신청인": "applicant", "본인": "applicant",
            "자녀": "child", "부모": "parents", "부부": "couple", "가구": "household"}
COMPLEX = re.compile(r"또는|이거나|중 하나|어느 하나|제외|다만|단,|예외|우선|해당하는 경우|각각")


@dataclass
class CodeExtraction:
    extraction: PolicyExtraction | None
    logic: LogicNode
    unresolved_fields: list[str]

    @property
    def complete(self) -> bool:
        return self.extraction is not None and self.extraction.coverage == "complete"


def _numeric(field: str, amount: Decimal, operator: str, unit: str) -> dict:
    if abs(amount) > 2**53 - 1:
        raise ValueError("Number outside provider precision envelope")
    return {"field_key": field, "operator": operator,
            "value": {"kind": "NUMBER", "number": float(amount)}, "unit": unit}


def _clause(text: str) -> dict | None:
    text = text.strip().removesuffix(".")
    subject = "applicant"
    match = re.match(r"^(신청자|신청인|본인|자녀|부모|부부|가구)(?:는|의)?\s+", text)
    if match:
        subject = SUBJECTS[match[1]]
        text = text[match.end():]
    base = {"subject": subject, "state_code": 1, "unit": None,
            "reference_basis": None, "unknown_reason": None, "review_note": ""}
    match = re.fullmatch(r"(연령|나이|성별|거주지역|소득)\s*(?:제한\s*없음|무관)", text)
    if match:
        field = {"연령": "age", "나이": "age", "성별": "gender",
                 "거주지역": "residence_region", "소득": "income"}[match[1]]
        return {**base, "field_key": field, "state_code": 0, "operator": None, "value": None}
    match = re.fullmatch(r"만\s*(\d{1,3})\s*세\s*(이상|초과|이하|미만)(?:인 자)?", text)
    if match:
        return {**base, **_numeric("age", Decimal(match[1]), OPERATORS[match[2]], "YEARS")}
    match = re.fullmatch(
        r"만\s*(\d{1,3})\s*세\s*(이상|초과)\s*(?:만\s*)?(\d{1,3})\s*세\s*(이하|미만)", text)
    if match:
        return {**base, "field_key": "age", "operator": "RANGE", "unit": "YEARS",
                "value": {"kind": "NUMBER_RANGE", "minimum": float(match[1]),
                          "maximum": float(match[3]), "min_inclusive": match[2] == "이상",
                          "max_inclusive": match[4] == "이하"}}
    match = re.fullmatch(r"만\s*(\d{1,3})\s*(?:세)?\s*[~～]\s*(?:만\s*)?(\d{1,3})\s*세", text)
    if match:
        return {**base, "field_key": "age", "operator": "RANGE", "unit": "YEARS",
                "value": {"kind": "NUMBER_RANGE", "minimum": float(match[1]),
                          "maximum": float(match[2]), "min_inclusive": True,
                          "max_inclusive": True}}
    if text in {"남성", "남자", "여성", "여자", "취업자", "미취업자", "자영업자"}:
        field = "gender" if text in {"남성", "남자", "여성", "여자"} else "employment_status"
        return {**base, "field_key": field, "operator": "EQ",
                "value": {"kind": "TEXT", "text": text}}
    if text in {"무주택자", "주택 소유자", "등록장애인"}:
        return {**base, "field_key": "disability_registered" if text == "등록장애인"
                else "home_ownership", "operator": "EQ",
                "value": {"kind": "BOOLEAN", "boolean": text != "무주택자"}}
    if text in {"무소득자", "소득 없음"}:
        return {**base, **_numeric("income", Decimal(0), "EQ", "KRW")}
    match = re.fullmatch(
        r"(월소득|연소득|총자산|소득)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*"
        r"(억\s*원|만\s*원|원)\s*(이상|초과|이하|미만)", text)
    if match:
        field, unit = {"월소득": ("monthly_income", "KRW_PER_MONTH"),
                       "연소득": ("annual_income", "KRW_PER_YEAR"),
                       "총자산": ("total_assets", "KRW"), "소득": ("income", "KRW")}[match[1]]
        scale = {"억원": 100_000_000, "만원": 10_000, "원": 1}[match[3].replace(" ", "")]
        amount = Decimal(match[2].replace(",", "")) * scale
        return {**base, **_numeric(field, amount, OPERATORS[match[4]], unit)}
    match = re.fullmatch(r"소득인정액\s*기준\s*중위소득\s*(\d+(?:\.\d+)?)\s*%\s*"
                         r"(이상|초과|이하|미만)", text)
    if match:
        return {**base, **_numeric("recognized_income_median_ratio", Decimal(match[1]),
                                   OPERATORS[match[2]], "PERCENT")}
    match = re.fullmatch(r"([가-힣0-9·. ]+?)(?:에)?\s+주민등록(?:을 둔 자|자)", text)
    field = "registered_residence_region"
    if not match:
        match = re.fullmatch(r"([가-힣0-9·. ]+?)(?:에)?\s+(?:거주자|거주하는 자)", text)
        field = "residence_region"
    if match:
        return {**base, "field_key": field, "operator": "EQ",
                "value": {"kind": "TEXT", "text": match[1].strip()}}
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})", text)
    if match:
        return {**base, "field_key": "application_period", "operator": "RANGE",
                "value": {"kind": "DATE_RANGE", "date_min": match[1], "date_max": match[2],
                          "min_inclusive": True, "max_inclusive": True}}
    return None


def extract_conditions(source: SourcePolicy) -> CodeExtraction:
    conditions, groups, unresolved = [], [], []
    for field in ("eligibility", "selection", "text", "application_period"):
        original = source.fields.get(field, "")
        if not original.strip():
            continue
        if COMPLEX.search(original):
            unresolved.append(field)
            continue
        body = original.strip()
        explicit_all = bool(re.match(r"^(?:다음|아래)\s*조건(?:을)?\s*모두\s*충족\s*[:：]?", body))
        if explicit_all:
            body = re.sub(r"^(?:다음|아래)\s*조건(?:을)?\s*모두\s*충족\s*[:：]?", "", body)
        parts = [p.strip().lstrip("-•○ ") for p in re.split(
            r"\n|;|(?<!\d),(?!\d)|\s+및\s+|이며\s*|이고\s*", body) if p.strip()]
        # A list alone does not prove AND. Cross-subject inheritance also needs interpretation.
        if len(parts) > 1 and (not (explicit_all or re.search(r" 및 |이며|이고", body))
                               or re.search(r"자녀|부모|부부|가구", body)):
            unresolved.append(field)
            continue
        gid = "code_" + field
        found = []
        for part in parts:
            try:
                parsed = _clause(part)
                if parsed is None or (
                    (field == "application_period") != (parsed["field_key"] == "application_period")
                ):
                    unresolved.append(field)
                    continue
                found.append(ParsedCondition(
                    **parsed, condition_id=f"code_{len(conditions) + len(found) + 1}",
                    role="application" if field == "application_period" else "eligibility",
                    group_id=gid, source_field=field, evidence_quote=part,
                ))
            except ValueError:
                unresolved.append(field)
        if found:
            conditions.extend(found)
            groups.append(ConditionGroup(group_id=gid, relation="all", scope_text=body.strip(),
                                         source_field=field, evidence_quote=original))
    unresolved = list(dict.fromkeys(unresolved))
    if not conditions:
        return CodeExtraction(None, unknown_logic("코드 규칙으로 확정 가능한 독립 조건 없음"),
                              unresolved)
    if len(conditions) > 128 or len(groups) > 64:
        return CodeExtraction(None, unknown_logic("코드 조건 개수 제한 초과"), ["capacity"])
    # Separate source fields can refine or override each other. Do not guess their relationship.
    eligibility_groups = {c.group_id for c in conditions if c.role == "eligibility"}
    if len(eligibility_groups) != 1:
        unresolved.append("cross_field_scope")
    logic = unknown_logic("미해결 원문 또는 필드 간 적용 범위 확인 필요")
    if not unresolved:
        logic = LogicNode(
            op="all", condition_id=None, reason=None,
            children=[LogicNode(op="condition", condition_id=c.condition_id,
                                children=[], reason=None)
                      for c in conditions if c.role == "eligibility"],
        )
    extraction = PolicyExtraction(
        policy_key=source.policy_key, conditions=conditions, groups=groups,
        coverage="partial" if unresolved else "complete",
        unresolved=[f"코드 해석 미확정: {f}" for f in unresolved])
    return CodeExtraction(extraction, logic, unresolved)
