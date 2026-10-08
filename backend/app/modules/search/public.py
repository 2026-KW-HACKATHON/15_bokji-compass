"""Public smart-search boundary. Local source processing, no model or writes."""

from app.modules.search.interpretation import interpret_query
from app.modules.search.relations import institution_names
from app.modules.search.retrieval import rank_records


def search_records(records, query, *, sort="relevance", institutions=(), relation=None):
    """Interpret and rank a complete latest-published filtered snapshot."""
    records = list(records)
    vocabulary = set(institutions) | set(institution_names(records))
    plan = interpret_query(query, institutions=vocabulary)
    matches = rank_records(records, plan, sort=sort)
    alternatives = []
    if plan.institutions and plan.intent in {"ambiguous", "related"}:
        for scope, roles, label in [
            ("organization", {"publisher"}, "이 기관에서 게시한 공고"),
            ("content", {"target", "contextual", "student_general", "mention"},
             "이 기관·학교와 관련된 공고"),
        ]:
            count = sum(bool(set(match["relations"]) & roles) for _, match in matches)
            alternatives.append({"scope": scope, "label": label, "count": count})
    metadata = {"mode": "smart", "summary": plan.summary, "originalQuery": query,
                "interpretedQuery": plan.interpreted_query,
                "corrections": [{"from": item.original, "to": item.replacement}
                                for item in plan.corrections], "alternatives": alternatives,
                "warnings": list(plan.ambiguities)}
    if relation is not None:
        roles = ({"publisher"} if relation == "publisher" else
                 {"target", "contextual", "student_general", "mention"})
        matches = [(record, match) for record, match in matches
                   if set(match["relations"]) & roles]
    return matches, metadata
