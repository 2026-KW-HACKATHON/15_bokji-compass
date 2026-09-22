"""Small reusable rules; unfamiliar prose is explicitly handed to an LLM."""

import re
from datetime import date

TAGS = {
    "age": r"연령|나이|\d+\s*세|미성년|아동|유아",
    "income": r"소득|급여액",
    "assets": r"재산|자산|보증금",
    "residence": r"거주|주민등록|주소지",
    "household": r"가구|부부|부양|부모|배우자|자녀",
    "disability": r"장애",
    "employment": r"취업|근로|사업소득|무소득",
    "occupation": r"어업인|허가|전문직",
    "education": r"교육정도|고졸|유치원",
    "nationality": r"국적|난민",
}
COMPLEXITY = {
    "alternative": r"어느 하나|또는|\[우대형\]|\[일반형\]",
    "exception": r"예외|제외|불가|단,|단종|자격제한",
    "priority": r"우선순위|순위|동점",
    "reference": r"참고|따름|수립계획|규정|금융기관",
    "multiple_subjects": r"부모|부부|가구원|부양|자녀|보호자",
    "relative_time": r"전년도|신청일|최근|기준|접수후",
}
DATE_RANGE = re.compile(r"(\d{4}-\d{2}-\d{2})\s*[~～]\s*(\d{4}-\d{2}-\d{2})")
AGE_ONLY = re.compile(r"(?:신청인|신청자|본인)(?:은|는|의 나이는)?\s*만\s*(\d+)세\s*(이상|이하)")


def classify_field(kind: str, text: str) -> dict:
    """Return a route, lexical hints and an optional narrowly supported value.

    Tag hits are retrieval hints, never sufficient conditions for eligibility.
    Full-match rules deliberately avoid extracting a bound from mixed subjects.
    """
    clean = text.strip()
    result = {
        "route": "llm", "reason": "free_text_semantics", "resolved": None,
        "tag_hints": [tag for tag, pattern in TAGS.items() if re.search(pattern, clean)],
        "complexity": [tag for tag, pattern in COMPLEXITY.items() if re.search(pattern, clean)],
    }
    if not clean:
        return {**result, "route": "code", "reason": "missing", "resolved": "not_stated"}
    if kind == "application_period":
        if clean in {"상시신청", "상시 신청", "연중 신청"}:
            return {**result, "route": "code", "reason": "exact_period", "resolved": "always_open"}
        match = DATE_RANGE.fullmatch(clean)
        if match:
            try:
                start, end = map(date.fromisoformat, match.groups())
            except ValueError:
                return {**result, "reason": "invalid_date"}
            if start <= end:
                return {**result, "route": "code", "reason": "exact_date_range",
                        "resolved": {"start": str(start), "end": str(end)}}
            return {**result, "reason": "reversed_date_range"}
    match = AGE_ONLY.fullmatch(clean.rstrip("."))
    if kind in {"eligibility", "selection"} and match:
        value = int(match[1])
        if value <= 130:
            return {**result, "route": "code", "reason": "explicit_applicant_age",
                    "resolved": {"subject": "applicant", "field": "age", "value": value,
                                 "operator": {"이상": "gte", "이하": "lte"}[match[2]],
                                 "reference_date": None}}
    return result
