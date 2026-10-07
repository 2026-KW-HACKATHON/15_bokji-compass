"""Local retrieval over a complete filtered published snapshot."""

import re

from app.modules.search.interpretation import CONCEPT_TERMS
from app.modules.search.relations import (
    compact,
    general_student_evidence,
    institution_relations,
    source_facts,
)

ROLE_WEIGHT = {"target": 100, "contextual": 90, "student_general": 65,
               "publisher": 50, "mention": 30}
ROLE_LABEL = {"target": "공고에 해당 학교의 대상·신청 안내가 있어요.",
              "contextual": "학교 게시 문맥에서 본교·학교 신청 안내가 확인돼요.",
              "student_general": "학교를 특정하지 않은 전국 대학생 대상 안내가 있어요.",
              "publisher": "검색한 기관에서 게시한 공고예요.",
              "mention": "공고 내용에 검색한 기관이 언급돼요.",
              "benefit": "찾는 지원 내용과 관련된 공고예요.",
              "literal": "공고의 주요 내용에 검색어가 있어요."}
AUDIENCE_TERMS = {"student": ("대학생", "재학생", "학부생", "대학원생"),
                  "young": ("청년", "청소년"), "senior": ("어르신", "노인", "고령"),
                  "family": ("가족", "가구", "부모", "자녀", "양육"),
                  "disabled": ("장애",), "worker": ("근로자", "직장인", "재직자"),
                  "unemployed": ("미취업", "실업", "구직", "취업준비", "취준", "백수")}
WORK_TERMS = (*CONCEPT_TERMS["work"], "근무", "근로참여", "노동", "취업")
LOAN_TERMS = ("대출", "상환", "융자")
OBLIGATION = re.compile(r"근로|근무|아르바이트|일자리|취업|노동|대출|상환|융자")
NEGATED = re.compile(r"없|않|아니|불필요|면제")


def _affirmative(sentence, term):
    text = sentence
    for occurrence in re.finditer(re.escape(term), text):
        following = text[occurrence.end():]
        next_obligation = OBLIGATION.search(following)
        if next_obligation:
            connector = following[:next_obligation.start()]
            shared = re.fullmatch(r"(?:의무|참여|제공|시간)?(?:와|과|및|또는|이나|·|/)",
                                  connector)
            if not shared:
                following = connector
        # A different obligation's negation cannot negate this one. For example,
        # work-required support with no repayment still has a work requirement.
        if not NEGATED.search(following[:24]):
            return True
    return False


def _concept_match(facts, terms):
    best = None
    normalized_terms = [(term, compact(term)) for term in terms]
    for fact in facts:
        normalized = fact.normalized_text
        term = next((term for term, normalized_term in normalized_terms
                     if normalized_term in normalized), None)
        if term is not None:
            weight = {"title": 30, "benefit": 25, "target": 15, "body": 8}[fact.kind]
            if best is None or weight > best[0]:
                best = (weight, fact.evidence(term))
    return best


def _excluded(facts, exclusions):
    for exclusion in exclusions:
        terms = (WORK_TERMS if exclusion == "work" else LOAN_TERMS if exclusion == "loan"
                 else CONCEPT_TERMS.get(exclusion, (exclusion,)))
        normalized_terms = [compact(term) for term in terms]
        for fact in facts:
            if fact.kind not in {"title", "benefit", "body"}:
                continue
            for sentence in re.split(r"[\n。,;]|(?<=[.!?])\s+", fact.text):
                text = compact(sentence)
                if not any(term in text and _affirmative(text, term)
                           for term in normalized_terms):
                    continue
                if fact.kind in {"title", "benefit"} or re.search(
                    r"근무|근로장학|국가근로|상환|대출\s*(?:지원|사업|신청)|융자", sentence
                ):
                    return True
    return False


def score_record(record, plan):
    """Return score/match metadata or None when a requested concept is absent."""
    facts = source_facts(record)
    if _excluded(facts, plan.exclusions):
        return None
    score, relations, evidence = 0, [], []
    if plan.exclusions and not (plan.concepts or plan.terms or plan.institutions or plan.audiences):
        matched = _concept_match(facts, CONCEPT_TERMS["financial"])
        if matched is None:
            return None
        score += matched[0]
        evidence.append(matched[1])
        relations.append("benefit")
    for concept in plan.concepts:
        matched = _concept_match(facts, CONCEPT_TERMS.get(concept, (concept,)))
        if matched is None:
            return None
        score += matched[0]
        evidence.append(matched[1])
        if "benefit" not in relations:
            relations.append("benefit")
    for term in plan.terms:
        matched = _concept_match(facts, (term,))
        if matched is None:
            return None
        score += matched[0]
        evidence.append(matched[1])
        if "literal" not in relations:
            relations.append("literal")
    institution_matches = []
    institution_groups = {}
    for institution in plan.institutions:
        matches = institution_relations(record, institution, facts)
        role = institution.role
        if role == "excluded":
            if matches:
                return None
            continue
        if role == "publisher":
            matches = [match for match in matches if match[0] == "publisher"]
        elif role == "affiliation":
            matches = [match for match in matches if match[0] in {"target", "contextual"}]
            general = general_student_evidence(record, facts, institution)
            if general:
                matches.append(("student_general", general))
        institution_groups.setdefault(role, []).extend(matches)
        if matches:
            institution_matches.extend(matches)
    if institution_groups:
        if any(not matches for matches in institution_groups.values()):
            return None
        institution_matches.sort(key=lambda match: ROLE_WEIGHT[match[0]], reverse=True)
        score += sum(max(ROLE_WEIGHT[role] for role, _ in group)
                     for group in institution_groups.values())
        relations = list(dict.fromkeys(role for role, _ in institution_matches)) + relations
        evidence = [proof for _, proof in institution_matches] + evidence
    for audience in plan.audiences:
        if audience == "student" and any(role in relations for role in {"target", "contextual"}):
            continue
        matched = _concept_match(facts, AUDIENCE_TERMS.get(audience, (audience,)))
        if matched is None:
            # A life-context descriptor is a relevance signal, not a hidden
            # eligibility filter. General benefit support can still be useful.
            if plan.concepts and not plan.institutions and not _contradictory_audience(
                    facts, audience):
                continue
            return None
        score += matched[0]
        evidence.append(matched[1])
        if not relations:
            relations.append("literal")
    if not relations:
        return None
    unique = []
    for item in evidence:
        if item not in unique:
            unique.append(item)
    return score, {"relations": relations, "reason": ROLE_LABEL[relations[0]],
                   "evidence": unique[:3]}


def _contradictory_audience(facts, audience):
    opposite = {"young": "senior", "senior": "young",
                "worker": "unemployed", "unemployed": "worker"}.get(audience)
    if opposite is None:
        return False
    terms = AUDIENCE_TERMS[opposite]
    return any(any(compact(term) in compact(fact.text) for term in terms)
               for fact in facts if fact.kind == "target")


def rank_records(records, plan, *, sort="relevance"):
    """Rank every matching row before total and offset; no popularity shortlist."""
    matches = []
    for record in records:
        result = score_record(record, plan)
        if result is not None:
            score, match = result
            matches.append((record, match, score))
    matches.sort(key=lambda item: item[0]["policy_key"])
    if sort == "name":
        matches.sort(key=lambda item: item[0]["title"])
    else:
        matches.sort(key=lambda item: item[0]["created_at"], reverse=True)
        if sort in {"popular", "relevance"}:
            matches.sort(key=lambda item: (item[0].get("views") is not None,
                                           item[0].get("views") or 0), reverse=True)
        if sort == "relevance":
            matches.sort(key=lambda item: item[2], reverse=True)
    return [(record, match) for record, match, _ in matches]
