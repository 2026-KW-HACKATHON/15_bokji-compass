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
