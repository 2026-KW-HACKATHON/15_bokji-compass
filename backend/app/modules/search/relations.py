"""Grounded search facts; a relationship never decides application eligibility."""

import re
import unicodedata
from dataclasses import dataclass
from functools import cached_property

from app.modules.search.interpretation import normalized

PRIMARY_FIELDS = ("text", "purpose_summary", "eligibility", "selection", "benefits")
EDITORIAL_FIELDS = ("summary", "benefits", "region", "age", "gender", "other")
STUDENT = re.compile(r"대학생|대학(?:교)?\s*재학|재학생|학부생|대학원생")
TARGET = re.compile(r"재학생|학생|학부|대학원|입학|대상|자격|추천|신청")
CONTEXT = re.compile(r"우리\s*대학|본교|우리\s*학교|당\s*대학")
CONTACT = re.compile(r"문의|연락처|전화|이메일|담당\s*(?:부서|자)|학생처|게시|공유")
NEGATIVE = re.compile(r"제외|불가|아닌|아니며|않는|아닙|미대상")
UNIVERSITY = re.compile(r"[가-힣]{2,20}대학교")


def compact(value: str) -> str:
    return normalized(value)


@dataclass(frozen=True)
class TextFact:
    field: str
    text: str
    kind: str

    @cached_property
    def normalized_text(self):
        return compact(self.text)

    @cached_property
    def sentences(self):
        return tuple(dict.fromkeys(text for text in
                     re.split(r"[\n。]|(?<=[.!?])\s+", self.text) if text.strip()))

    def evidence(self, term: str = "") -> dict:
        index = self.text.lower().find(term.lower()) if term else -1
        if index < 0 and term:
            matched = re.search(r"\s*".join(re.escape(char) for char in compact(term)),
                                self.text, flags=re.I)
            if matched:
                index = matched.start()
            else:
                characters, offsets = [], []
                for position, character in enumerate(self.text):
                    for normalized_character in unicodedata.normalize("NFKC", character).casefold():
                        if not normalized_character.isspace():
                            characters.append(normalized_character)
                            offsets.append(position)
                normalized_index = "".join(characters).find(compact(term))
                if normalized_index >= 0:
                    index = offsets[normalized_index]
        if index < 0:
            index = 0
        start = max(0, index - 60)
        return {"field": self.field, "quote": self.text[start:start + 250]}


def source_facts(record) -> list[TextFact]:
    source = record["source_json"]
    fields = source.get("fields") or {}
    facts = [TextFact("title", source.get("title") or record.get("title") or "", "title")]
    for field in PRIMARY_FIELDS:
        text = fields.get(field)
        if isinstance(text, str) and text.strip():
            kind = ("target" if field in {"eligibility", "selection"} else
                    "benefit" if field in {"benefits", "purpose_summary"} else "body")
            facts.append(TextFact(field, text, kind))
    draft = record.get("draft_json") or {}
    for field in EDITORIAL_FIELDS:
        text = (draft.get("editorial") or {}).get(field)
        original = fields.get("_editor_" + field, "")
        if isinstance(text, str) and text and text in original:
            kind = "benefit" if field in {"summary", "benefits"} else "target"
            facts.append(TextFact("_editor_" + field, text, kind))
    overview = draft.get("overview") or {}
    sections = [(overview.get(name) or {}, kind) for name, kind in (
        ("benefits", "benefit"), ("region_conditions", "target"),
        ("age_conditions", "target"), ("gender_conditions", "target"),
    )]
    sections.extend((item, "target") for item in overview.get("other_conditions") or [])
    for section, kind in sections:
        if section.get("status") not in {None, "specified", "unrestricted"}:
            continue
        for evidence in section.get("evidence") or []:
            field, quote = evidence.get("source_field"), evidence.get("quote")
            if field not in {"title", *PRIMARY_FIELDS,
                              *("_editor_" + name for name in EDITORIAL_FIELDS)}:
                continue
            original = source.get("title", "") if field == "title" else fields.get(field, "")
            if isinstance(quote, str) and quote and quote in original:
                fact = TextFact(field, quote, kind)
                if fact not in facts:
                    facts.append(fact)
    return facts


def institution_names(records) -> tuple[str, ...]:
    """Read entity vocabulary from public sources, never contact/URL metadata."""
    names = set()
    for record in records:
        source = record["source_json"]
        organization = source.get("organization", "").strip()
        if organization:
            names.add(organization)
        for fact in source_facts(record):
            names.update(UNIVERSITY.findall(fact.text))
    return tuple(sorted(names))


def _sentences(fact):
    return iter(fact.sentences)


def _positive_target(sentence, aliases, kind, text=None):
    text = compact(sentence) if text is None else text
    for alias in aliases:
        index = text.find(alias)
        if index < 0:
            continue
        after = text[index:index + len(alias) + 45]
        if NEGATIVE.search(after):
            continue
        if CONTACT.search(sentence) and not re.search(r"재학생|대상|자격|학부생", after):
            continue
        if kind == "target" or TARGET.search(after):
            return alias
    return None


def institution_relations(record, institution, facts: list[TextFact]) -> list[tuple[str, dict]]:
    """Separate issuer, named target, source-context relevance and mentions."""
    source = record["source_json"]
    organization = source.get("organization") or ""
    aliases = tuple(compact(alias) for alias in institution.aliases)
    issuer = any(compact(alias) in compact(organization) for alias in aliases)
    relations = []
    other_school_context = any(
        compact(school) not in {compact(alias) for alias in aliases}
        for fact in facts for school in UNIVERSITY.findall(fact.text)
    )
    if issuer:
        relations.append(("publisher", {"field": "organization", "quote": organization[:250]}))
    for fact in facts:
        for sentence in _sentences(fact):
            normalized_sentence = compact(sentence)
            alias = _positive_target(sentence, aliases, fact.kind, normalized_sentence)
            if alias:
                relations.append(("target", TextFact(fact.field, sentence, fact.kind)
                                  .evidence(alias)))
            elif (not CONTACT.search(sentence) and
                  any(alias in normalized_sentence for alias in aliases)):
                matched_alias = next(alias for alias in aliases if alias in normalized_sentence)
                relations.append(("mention", TextFact(fact.field, sentence, fact.kind)
                                  .evidence(matched_alias)))
            context_marker = CONTEXT.search(sentence)
            contextual = context_marker and TARGET.search(sentence)
            system = (compact(institution.name) == "광운대학교" and
                      re.search(r"\bKLAS\b", sentence, flags=re.I))
            if (issuer and organization.endswith(("대학교", "대학")) and
                    not other_school_context and (contextual or system)):
                if not NEGATIVE.search(sentence):
                    relations.append(("contextual", TextFact(fact.field, sentence, fact.kind)
                                      .evidence(context_marker.group() if contextual else "KLAS")))
    return relations


def general_student_evidence(record, facts: list[TextFact], institution) -> dict | None:
    """Find broad student audience evidence without claiming member eligibility."""
    overview = (record.get("draft_json") or {}).get("overview") or {}
    region = overview.get("region_conditions") or {}
    if any(_positive_target(sentence, (compact(school),), fact.kind)
           for fact in facts for sentence in _sentences(fact)
           for school in UNIVERSITY.findall(sentence)
           if compact(school) not in {compact(alias) for alias in institution.aliases}):
        return None
    for fact in facts:
        if fact.kind not in {"target", "body", "title"}:
            continue
        for sentence in _sentences(fact):
            if not STUDENT.search(sentence) or NEGATIVE.search(sentence):
                continue
            schools = UNIVERSITY.findall(sentence)
            if schools and not any(compact(school) in {
                compact(alias) for alias in institution.aliases} for school in schools):
                continue
            national = (region.get("status") == "unrestricted" or
                        re.search(r"전국|국내\s*대학|학교\s*제한\s*없|대학\s*구분\s*없", sentence))
            if national and not schools:
                return TextFact(fact.field, sentence, fact.kind).evidence(
                    STUDENT.search(sentence)[0])
    return None
