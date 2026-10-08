"""Temporary search intent reuses the public catalog interpreter and complete ranking."""

from dataclasses import replace

from sqlalchemy import select

from app.contracts.conditions import CanonicalPolicy
from app.contracts.parsing import SourcePolicy
from app.modules.matching import public as matching
from app.modules.monitoring import public as monitoring
from app.modules.monitoring.models import seoul_today
from app.modules.presentation.public import policy_signals
from app.modules.search.interpretation import interpret_query
from app.modules.search.retrieval import rank_records
from app.modules.storage.catalog import card, published_catalog, search_institution_vocabulary

MAX_GENERAL_CANDIDATES = 12

def prepare_search(text, repository=None):
    """Only bounded derived search terms survive; never the full original question."""
    if not isinstance(text, str) or not text.strip() or len(text) > 200:
        return None
    institutions = ()
    if repository is not None:
        with repository.engine.connect() as connection:
            institutions = search_institution_vocabulary(repository, connection)
    plan = interpret_query(text, institutions=institutions)
    return replace(plan, original_query="", normalized_query="", corrections=(), summary="")


def general_candidates(repository, plan, member, profile):
    """Search all latest public notices, then exclude known mismatches and closed notices."""
    if plan is None:
        return []
    latest = published_catalog(repository)
    documents = repository.tables["condition_documents"]
    query = select(latest, documents.c.canonical_json, documents.c.matching_enabled,
                   documents.c.review_status).join(
        documents, documents.c.revision_id == latest.c.revision_id)
    with repository.engine.connect() as connection:
        records = connection.execute(query).mappings().all()
    matches = rank_records(records, plan)
    facts = monitoring.monitoring_facts(member, profile)
    today = seoul_today()
    candidates = []
    for record, relevance in matches:
        comparison = matching.compare_policy(record, facts, today=today)
        canonical = CanonicalPolicy.model_validate(record["canonical_json"])
        policy = card(record)
        policy.update(policy_signals(record))
        schedule = monitoring._schedule(policy, canonical, today, comparison)
        if schedule == "ended":
            continue
        logical = monitoring._logic_state(canonical, comparison, upcoming=schedule == "upcoming",
                                          today=today)
        if logical is False:
            continue
        missing_targets = matching.missing_target_requirements(
            canonical, SourcePolicy.model_validate(record["source_json"]))
        status = ("potential_match" if comparison["status"] == "potential_match"
                  and not missing_targets and logical is True and schedule != "unknown"
                  else "needs_review")
        questions = [f"공고의 {check['label']} 조건에 필요한 정보를 확인해 주세요."
                     for check in comparison["checks"] if check["state"] == "unknown"]
        if missing_targets:
            questions.append("원문에 기재된 추가 지원대상 조건을 확인해 주세요.")
        if not comparison["matching_enabled"] or canonical.coverage != "complete":
            questions.append("공고의 전체 조건·예외를 공식 안내와 함께 확인해 주세요.")
        if schedule == "unknown":
            questions.append("신청 기간과 현재 접수 가능 여부를 확인해 주세요.")
        # Ranking is based on an immutable revision. Recheck access after evaluation.
        current = repository.get_revision(record["revision_id"])
        if current is None or current.get("review_status") != "published":
            continue
        proof = relevance["evidence"]
        reason = relevance["reason"]
        if proof:
            reason += f" 공개 원문의 ‘{proof[0]['quote']}’ 내용을 확인했어요."
        reason += " 알려진 정보로 비교한 확인 후보이며 신청 자격을 확정한 결과는 아니에요."
        if schedule == "upcoming":
            reason += " 접수 시작 전이므로 시작일과 준비사항을 확인해 주세요."
        candidates.append({
            "need_id": "general_support", "policy_id": record["policy_key"],
            "policy": policy, "status": status, "reason": reason,
            "questions": list(dict.fromkeys(questions)), "schedule_status": schedule,
            "eligibility_decided": False, "evidence": proof,
        })
        if len(candidates) >= MAX_GENERAL_CANDIDATES:
            break
    return candidates
