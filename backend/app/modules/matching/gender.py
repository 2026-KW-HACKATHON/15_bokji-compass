"""Source-backed gender constraints omitted from an incomplete canonical extraction."""

import re
from typing import Protocol

from app.contracts.conditions import CanonicalPolicy, LogicNode
from app.contracts.parsing import SourcePolicy


class GenderFacts(Protocol):
    gender: str | None
    age_range: tuple[int, int] | None


_TARGET_LABELS = (r"성별(?:\s*조건)?", r"지원\s*대상", r"신청\s*대상",
                  r"신청\s*자격", r"지원\s*자격", "대상자")
_PRIORITY = re.compile(r"우선|우대|가점")
_GENDER = re.compile(r"여성|여자|여아|남성|남자|남아")
_INSTITUTION = re.compile(
    r"여성(?:가족부|가족과|정책과|회관|센터|인력개발센터|가족재단|단체|기관)"
)
_UNRESTRICTED = re.compile(
    r"남녀|성별\s*(?:에\s*)?(?:관계\s*없|무관|제한\s*없)|"
    r"(?:모든|전체)\s*(?:주민|국민)|(?:국민|주민)\s*누구나"
)
_AMBIGUOUS = re.compile(r"또는|혹은|이거나|아니|아닌|아닙|제외|불가|제한\s*없")
_ACCOMPANYING_CHILD = re.compile(r"동반\s*(?:아동|자녀|어린이)|그\s*(?:의\s*)?자녀")
_OTHER_RECIPIENT = re.compile(
    r"(?:여성|여자|여아|남성|남자|남아)\s*의\s*(?:배우자|남편|아버지|부모|보호자|가족|가구)|"
    r"(?:지원|운영)(?:하는)?\s*(?:기관|시설|단체|법인|사업주|사업장)|"
    r"(?:기관|시설|단체|법인|사업주|사업장)\s*$"
)
_MIXED_AUDIENCE = re.compile(
    r"(?:여성|여자|여아|남성|남자|남아)(?:\s*대상(?:자)?)?\s*(?:및|과|와|[,/·ㆍ])\s*"
    r"(?!동반\s*(?:아동|자녀|어린이)|그\s*(?:의\s*)?자녀)\S"
)


def _referenced(node: LogicNode) -> set[str]:
    if node.op == "condition":
        return {node.condition_id}
    return set().union(*(_referenced(child) for child in node.children))


def _body_targets(text: str):
    """Only explicitly labelled target sections are audience evidence in a document body."""
    label = "|".join(_TARGET_LABELS)
    active = False
    for line in text.splitlines():
        clean = re.sub(r"^\s*[-*○□•]+\s*", "", line).strip()
        heading = re.match(r"(" + label + r")\s*(?:[:：]\s*(.*)|$)", clean)
        if heading:
            active = True
            if heading.group(2):
                yield line
        elif active:
            # A new named section ends the audience block; a bullet doesn't.
            if re.match(r"[가-힣 ]{2,20}\s*[:：]", clean) or re.match(
                    r"(?:지원\s*내용|선정\s*기준|신청\s*방법|신청\s*기간|접수\s*기간|"
                    r"구비\s*서류|문의처)\s*$", clean):
                active = False
            elif clean:
                yield line


def _audience_evidence(record: dict, source: SourcePolicy) -> list[tuple[str, str]]:
    evidence = []
    for field in ("gender", "gender_conditions", "eligibility", "selection"):
        evidence.extend((field, line) for line in source.fields.get(field, "").splitlines()
                        if line.strip() and not _PRIORITY.search(line))
    evidence.extend(("text", line) for line in _body_targets(source.fields.get("text", ""))
                    if not _PRIORITY.search(line))
    overview = (record.get("draft_json") or {}).get("overview") or {}
    section = overview.get("gender_conditions") or {}
    if section.get("status") == "specified":
        for citation in section.get("evidence") or []:
            field, quote = citation.get("source_field"), citation.get("quote")
            # A translated/inferred summary, a title or an organization name cannot
            # establish a restriction. Use the actual cited audience/source wording.
            if (field in {"text", "eligibility", "selection", "gender", "gender_conditions"}
                    and isinstance(quote, str) and quote
                    and quote in source.fields.get(field, "") and not _PRIORITY.search(quote)):
                evidence.append((field, quote))
    return list(dict.fromkeys(evidence))


def source_gender_guard(record: dict, facts: GenderFacts,
                        canonical: CanonicalPolicy | None = None) -> dict | None:
    """Supplement missing gender extraction without replacing scoped canonical OR/NOT logic.

    A female recipient with accompanying children does not impose female gender on
    those children. Only a known adult of the opposite gender can fail that audience;
    an unknown age or a child remains unresolved.
    """
    canonical = canonical or CanonicalPolicy.model_validate(record["canonical_json"])
    required_ids = _referenced(canonical.logic)
    represented = [condition for condition in canonical.conditions
                   if condition.condition_id in required_ids and condition.field_key == "gender"
                   and condition.state_code == 1 and condition.subject != "unknown"]
    if represented:
        # This includes child/household/other subject gender: member gender is not
        # the gender of another recipient. State 9 does not suppress source fallback.
        return None
    source = SourcePolicy.model_validate(record["source_json"])
    statements = _audience_evidence(record, source)
    normalized = [(field, quote, re.sub(r"\([^)]*\)|（[^）]*）", "",
                                       _INSTITUTION.sub("", quote)))
                  for field, quote in statements]
    # Preserve explicit alternative/unrestricted audience statements. A display
    # section must not turn a mixed audience into a compulsory gender condition.
    if any(_UNRESTRICTED.search(text) for _, _, text in normalized):
        return None
    genders = {"FEMALE" if token.startswith("여") else "MALE"
               for _, _, text in normalized for token in _GENDER.findall(text)}
    if len(genders) != 1:
        return None
    required = next(iter(genders))
    candidates = [(field, quote, text) for field, quote, text in normalized
                  if _GENDER.search(text) and not _AMBIGUOUS.search(text)]
    if not candidates:
        return None
    # Eligibility can explicitly permit another recipient even if a short gender
    # display only names the principal one. Do not turn such wording into exclusion.
    audience_text = "\n".join(text for field, _, text in normalized
                              if field not in {"gender", "gender_conditions"})
    companions = bool(_ACCOMPANYING_CHILD.search(audience_text))
    if any(_AMBIGUOUS.search(text) for _, _, text in normalized):
        return None
    non_child_audience = _ACCOMPANYING_CHILD.sub("", audience_text)
    if _OTHER_RECIPIENT.search(non_child_audience) or _MIXED_AUDIENCE.search(audience_text):
        return None
    field, quote, _ = candidates[0]
    if facts.gender is None:
        state = "unknown"
        note = "회원정보의 성별이 없어 공식 지원 대상과 비교할 수 없어요."
    elif facts.gender == required:
        state = "match"
        note = "회원정보의 성별과 공식 지원 대상 안내를 비교했어요."
    elif companions and (facts.age_range is None or facts.age_range[0] < 19):
        state = "unknown"
        note = "동반 아동도 지원 대상으로 안내되어 있어 실제 수혜 대상 확인이 필요해요."
    else:
        state = "mismatch"
        note = "회원정보의 성별과 공식 지원 대상 안내가 달라 추천에서 제외했어요."
    return {"state": state, "source_field": field, "quote": quote, "note": note}
