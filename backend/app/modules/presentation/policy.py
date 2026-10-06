"""Notice wording for display only; source text and cited evidence stay immutable."""

import re

ACTION = r"(?:후지급|지급|지원|선발|모집|제공|접수|신청|운영|실시|선정|발표)"
END = r"(?=\s*(?:[.。!?\n]|$))"
MONTH = r"(?<!\d)(?:1[0-2]|0?[1-9])\s*월"
PAYMENT_LABEL = re.compile(
    r"^\s*[❍❏○●•·*\-\d.)\s]*"
    r"(?:장학금\s*)?지급\s*(?:(?:예정\s*)?(?:시기|일자|일|일정|기간)|예정)?"
    r"\s*[:：]\s*(.+)$"
)

# Older published records predate purpose_summary. Keep their list copy separate
# from immutable source text and detailed benefit conditions.
LEGACY_POLICY_DESCRIPTIONS = {
    "주택금융공사 월세자금보증": "월세 자금 대출에 필요한 보증을 지원하는 제도입니다.",
    "친환경 에너지절감장비 보급": "에너지 비용을 줄일 수 있는 친환경 어업 장비 보급을 지원합니다.",
    "유아학비 (누리과정) 지원": (
        "유아의 교육비와 방과후 과정비를 지원해 가정의 부담을 덜어주는 제도입니다."
    ),
    "장애인자립자금대여": "장애인의 생업과 자립에 필요한 자금을 낮은 금리로 빌려주는 제도입니다.",
}


def policy_description(title: str, purpose: str | None, benefits: str) -> str:
    """Prefer source purpose, with concise display copy for legacy service records."""
    return ((purpose or "").strip() or LEGACY_POLICY_DESCRIPTIONS.get(title)
            or format_notice_text(benefits))


def format_notice_text(value: str) -> str:
    """Use nominal endings for familiar notice predicates, preserving qualifiers."""
    value = re.sub(r"([가-힣0-9·]+)(?:을|를)(?=\s+(?:(?:차등|일괄|분할)\s+)?"
                   + ACTION + r"(?!하지|되지))",
                   r"\1", value)
    value = re.sub(r"(" + ACTION + r")(?:할|될)\s*예정(?:이다|입니다)?" + END,
                   r"\1 예정", value)
    value = re.sub(r"(" + ACTION + r")(?:한다|합니다|된다|됩니다)" + END, r"\1", value)
    value = re.sub(r"(" + ACTION + r")(?:하며|하고)\s*[,，]\s*", r"\1; ", value)
    value = re.sub(r"예정(?:이다|입니다)" + END, "예정", value)
    value = re.sub(r"(?<=[가-힣0-9)])이다" + END, "", value)
    return value.strip()


def payment_schedule(fields: dict[str, str]) -> str | None:
    """Extract one explicit payment line with a month; never infer an application date."""
    candidates = set()
    for field in ("text", "benefits"):
        for line in (fields.get(field) or "").splitlines():
            match = PAYMENT_LABEL.fullmatch(line)
            if match is None:
                match = re.fullmatch(r"\s*[❍❏○●•·*\-\s]*(?:후지급|선지급|지급)\s*"
                                     r"[（(]([^）)\n]+)[）)]\s*", line)
            if match and re.search(MONTH, match.group(1)):
                candidates.add(format_notice_text(match.group(1)))
    return candidates.pop() if len(candidates) == 1 else None
