"""Source-backed exploration rules and paged comparisons, without eligibility decisions."""

import hashlib
import json
import re
from dataclasses import replace
from datetime import date
from functools import lru_cache

from sqlalchemy import select

from app.contracts.conditions import CanonicalPolicy
from app.contracts.matching import RecommendationProfile
from app.contracts.parsing import SourcePolicy
from app.modules.matching import public as matching
from app.modules.monitoring.models import MonitoringProfile, seoul_today
from app.modules.presentation.public import policy_signals
from app.modules.regions.public import default_catalog
from app.modules.storage.catalog import card, published_catalog

PAGE_SIZE = 100
DISASTER_RECHECK_DAYS = 180
HOUSING_KEYWORDS = ["집수리", "주택수리", "주거환경 개선", "노후주택", "수선유지",
                    "그린리모델링", "에너지효율 개선", "주거 개선", "주택 개보수"]
EMPLOYMENT_KEYWORDS = ["청년 취업", "청년 일자리", "취업지원", "취업 지원", "구직",
                       "직업훈련", "직업 훈련", "재직 청년", "청년내일", "일자리"]
DISASTER_KEYWORDS = ["재난", "재해", "피해복구", "피해 복구", "재해구호", "재난지원",
                    "재난 지원", "재해 지원", "이재민"]
DISASTER_WATCH_KEYWORDS = [*DISASTER_KEYWORDS, "수해", "침수", "화재", "지진"]
WATCH_DISASTER = re.compile(r"재난|재해|수해|침수|화재|지진|이재민")
WATCH_SUPPORT = re.compile(
    r"(?:재난|재해|수해|침수|화재|지진)\s*"
    r"(?:피해\s*(?:주민|가구|주택|시설|농가|사업장|지역|대상자|소상공인|기업)?\s*)?"
    r"(?:긴급\s*)?(?:복구|구호|지원|보상|감면|면제|유예)|"
    r"피해\s*(?:주민|가구|주택|시설|농가|사업장|지역|대상자|소상공인|기업)?\s*"
    r"(?:긴급\s*)?(?:복구|구호|지원|보상|감면|면제|유예)|"
    r"이재민\s*(?:구호|지원|생활|주거|임시\s*거처)"
)


class MonitoringScanIncomplete(RuntimeError):
    """Do not replace prior account candidates after an invalid relevant policy."""


def _registered_region(member: dict) -> str | None:
    value = member.get("region")
    if not isinstance(value, str) or not value.strip() or value == "전국":
        return None
    name = matching.REGION_NAMES.get(value, value)
    region = default_catalog().resolve(name).region
    return region.name if region is not None else None


def derive_needs(member: dict, profile: MonitoringProfile, *,
                 today: date | None = None) -> list[dict]:
    """Exploration criteria describe needs; they never create benefit eligibility rules."""
    today = today or seoul_today()
    needs = []
    old_owner_home = (profile.housing_tenure == "owner" and profile.building_year is not None
                      and today.year - profile.building_year >= 20
                      and profile.repair_needed is not False)
    if old_owner_home or profile.repair_needed is True:
        reasons, questions = [], []
        if old_owner_home:
            reasons.append("자가 주택의 준공 연도가 20년 이상 경과해 주거 개선 공고를 찾아요.")
        if profile.repair_needed is True:
            reasons.append("직접 입력한 수리 필요 정보를 바탕으로 관련 공고를 찾아요.")
        reasons.append("20년은 탐색 기준이며 지원 자격이나 공고의 노후주택 기준을 뜻하지 않아요.")
        if profile.housing_tenure is None:
            questions.append("주택을 소유하고 계신가요, 임차해 살고 계신가요?")
        if profile.housing_type is None:
            questions.append("현재 주택은 단독주택·다세대주택·아파트 중 어떤 유형인가요?")
        if profile.repair_needed is not True:
            questions.append("현재 실제로 수리하거나 개선할 부분이 있나요?")
        if profile.housing_tenure == "renter":
            questions.append("임차인 신청 가능 여부와 집주인 동의 필요 여부를 확인해 주세요.")
        needs.append({"id": "housing_repair", "title": "주거 개선 지원 찾기",
                      "reason": " ".join(reasons), "keywords": HOUSING_KEYWORDS.copy(),
                      "questions": questions})

    age = member.get("age")
    youth = isinstance(age, int) and not isinstance(age, bool) and 19 <= age <= 34
    preparing = profile.occupation == "취업 준비 중" and profile.job_seeking is not False
    if youth or profile.job_seeking is True or preparing:
        questions = []
        reasons = (["입력한 나이가 탐색 기준인 19~34세에 해당해 청년 일자리 공고를 살펴봐요.",
                    "실제 청년 연령은 공고마다 다르며 나이로 미취업을 추정하지 않아요."]
                   if youth else ["직접 입력한 구직 의사를 바탕으로 취업 지원 공고를 찾아요."]
                   if profile.job_seeking is True else [
                       "직접 선택한 취업 준비 상황을 바탕으로 취업 지원 공고를 찾아요."])
        if profile.occupation in {"직장인", "자영업자"}:
            reasons.append("재직·사업 상태를 유지한 채 참여할 수 있는 지원인지 확인해요.")
        elif profile.occupation == "프리랜서":
            reasons.append("프리랜서 활동만으로 근로계약이나 사업자 등록 여부를 판단하지 않아요.")
            questions.append("근로계약에 따라 재직 중인가요, 개인사업자로 활동 중인가요?")
        elif profile.occupation == "무직":
            reasons.append("직접 선택한 현재 무직 상태를 바탕으로 공고 조건을 비교해요.")
        elif profile.occupation == "학생":
            reasons.append("학생 정보만으로 실업 상태를 판단하지 않아요.")
            questions.append("학업 중 참여할 수 있는 지원을 찾으시나요, 취업 준비를 하고 계신가요?")
        elif profile.occupation == "취업 준비 중" or profile.job_seeking is True:
            reasons.append("취업 준비·구직 의사를 확인했어요. 미취업 여부는 추가 확인이 필요해요.")
            questions.append("현재 재직 중이거나 사업을 운영하고 계신가요?")
        else:
            questions.append("현재 경제활동 상태를 알려주세요.")
        if profile.job_seeking is None:
            questions.append("현재 새 일자리를 찾거나 취업 지원을 받고 싶으신가요?")
        needs.append({"id": "youth_employment" if youth else "employment_support",
                      "title": "청년 일자리 지원 찾기" if youth else "취업 지원 찾기",
                      "reason": " ".join(reasons), "keywords": EMPLOYMENT_KEYWORDS.copy(),
                      "questions": questions})

    if profile.disaster_damage is True:
        elapsed = ((today - date.fromisoformat(profile.disaster_occurred_on)).days
                   if profile.disaster_occurred_on else None)
        names = {"flood": "수해", "fire": "화재", "earthquake": "지진", "other": "재난"}
        disaster = names.get(profile.disaster_type, "재난")
        questions = ["피해 지역과 실제 피해 유형·피해 확인 서류를 공고의 기준과 비교해 주세요."]
        reason = (f"직접 확인한 {disaster} 피해 정보를 바탕으로 복구 지원 공고를 찾아요. "
                  f"피해 정보는 탐색상 {DISASTER_RECHECK_DAYS}일마다 다시 확인하며, "
                  "이 기간은 지원 자격이나 신청기한이 아니에요.")
        if elapsed is None:
            questions.append("피해가 발생한 날짜를 입력해 주세요. 발생일을 추정하지 않아요.")
        elif elapsed > DISASTER_RECHECK_DAYS:
            questions.append("재확인 기간이 지났어요. 현재도 복구 지원이 필요한가요?")
        if profile.disaster_type is None:
            questions.append("어떤 재난으로 피해를 입으셨나요?")
        keywords = DISASTER_KEYWORDS + ({"flood": ["수해", "침수"], "fire": ["화재"],
                                        "earthquake": ["지진"]}.get(profile.disaster_type, []))
        needs.append({"id": "disaster_recovery", "title": "재난 피해 복구 지원 찾기",
                      "reason": reason, "keywords": keywords, "questions": questions})
    elif profile.disaster_damage is None and _registered_region(member) is not None:
        needs.append({"id": "disaster_watch", "title": "거주 지역 재난 지원 공고 살펴보기",
                      "reason": ("저장한 거주 지역에 적용되는 재난 복구·구호 지원 공고를 살펴봐요. "
                                 "공고 발견만으로 현재 재난이나 개인 피해를 판단하지 않아요."),
                      "keywords": DISASTER_WATCH_KEYWORDS.copy(),
                      "questions": ["실제로 재난 피해를 입으셨나요?",
                                    "피해가 있다면 종류와 발생일을 입력해 주세요.",
                                    "공고의 피해 지역·피해 확인 요건을 확인해 주세요."]})
    return needs


def monitoring_facts(member: dict, profile: MonitoringProfile) -> matching.MatchingFacts:
    preference = RecommendationProfile(occupation=profile.occupation, household=profile.household,
                                       interests=profile.interests)
    facts = matching.build_facts(member, preference)
    # Renting this home does not establish that the applicant owns no other home.
    ownership = True if profile.housing_tenure == "owner" else None
    return replace(facts, region=_registered_region(member), home_ownership=ownership,
                   employment_preparation=profile.job_seeking)


def _compact(value):
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()
    if isinstance(value, dict):
        return {key: _compact(item) for key, item in sorted(value.items())}
    if isinstance(value, list):
        return [_compact(item) for item in value]
    return value


def _watch_support_clause(text: str, match) -> str | None:
    """A general subsidy near a disaster cancellation disclaimer is not disaster aid."""
    boundaries = "\n.!?。;"
    start = max(text.rfind(boundary, 0, match.start()) for boundary in boundaries) + 1
    ends = [text.find(boundary, match.end()) for boundary in boundaries]
    end = min((position for position in ends if position >= 0), default=len(text))
    clause = text[start:end].strip()
    return clause if WATCH_DISASTER.search(clause) and WATCH_SUPPORT.search(clause) else None


def _evidence(source: dict, keywords: list[str], *, disaster=False, watch=False) -> list[dict]:
    fields = [("title", source["title"])]
    fields.extend((key, value) for key, value in source["fields"].items()
                  if key in {"text", "benefits", "eligibility", "selection", "purpose_summary"}
                  and isinstance(value, str))
    evidence = []
    for keyword in keywords:
        found = False
        for field, text in fields:
            for match in re.finditer(re.escape(keyword), text, flags=re.IGNORECASE):
                excerpt = text[max(0, match.start() - 50):min(len(text), match.end() + 90)]
                if disaster and not re.search(r"피해|복구|구호|이재민|지원금|긴급\s*지원", excerpt):
                    continue
                if watch:
                    support = _watch_support_clause(text, match)
                    if support is None:
                        continue
                    excerpt = support
                evidence.append({"keyword": keyword, "source_field": field,
                                 "quote": _compact(excerpt)})
                found = True
                break
            if found:
                break
    return evidence


def _positive_region_required(node, states: dict, region_ids: set[str]) -> bool:
    """Every viable branch must require a positive, matched residence restriction."""
    if node.op == "condition":
        return node.condition_id in region_ids and states[node.condition_id] is True
    if node.op in {"not", "unknown"} or matching.evaluate_logic(node, states) is False:
        return False
    if node.op == "all":
        return any(_positive_region_required(child, states, region_ids) for child in node.children)
    viable = [child for child in node.children
              if matching.evaluate_logic(child, states) is not False]
    return bool(viable) and all(_positive_region_required(child, states, region_ids)
                               for child in viable)


@lru_cache(maxsize=4)
def _province_codes(catalog) -> tuple[str, ...]:
    return tuple(region.code for region in catalog.rows if region.system == "ADMIN"
                 and region.code.endswith("00000000") and region.active(catalog.as_of))


def _watch_region_evidence(canonical: CanonicalPolicy, comparisons: dict, *,
                           today: date, upcoming=False) -> list[dict]:
    catalog = default_catalog()
    restrictions = {condition.condition_id: condition for condition in canonical.conditions
                    if condition.role == "eligibility" and condition.field_key == "residence_region"
                    and condition.state_code == 1 and condition.value.kind == "REGION"
                    and not condition.reference_basis}
    if not restrictions:
        return []
    states = _comparison_states(canonical, comparisons, upcoming=upcoming, today=today)
    matched = {identifier for identifier in restrictions if states[identifier] is True}
    if not _positive_region_required(canonical.logic, states, matched):
        return []
    # A disjunction enumerating every province remains a national program, even when this
    # applicant happens to match one province. Non-geographic requirements stay unknown.
    country_wide = True
    for province_code in _province_codes(catalog):
        geographical = {condition.condition_id: (
            _region_scope_state(condition, province_code, catalog)
            if condition.condition_id in restrictions else None)
            for condition in canonical.conditions}
        if matching.evaluate_logic(canonical.logic, geographical) is False:
            country_wide = False
            break
    if country_wide:
        return []
    return [{"keyword": restrictions[identifier].value.name,
             "source_field": restrictions[identifier].source_field,
             "quote": restrictions[identifier].evidence_quote}
            for identifier in sorted(matched)]


def _region_scope_state(condition, target_code: str, catalog) -> bool | None:
    """Compare validated codes; top-level Sejong names can have multiple official entries."""
    value = condition.value
    inside = catalog.contains(value.system, value.code, target_code)
    if inside is True:
        return value.include_descendants or value.code == target_code
    if catalog.contains(value.system, target_code, value.code) is True:
        return None
    return inside


def _period_state(condition, today: date) -> str:
    if (condition.state_code != 1 or condition.value.kind != "DATE_RANGE"
            or condition.reference_basis):
        return "unknown"
    value = condition.value
    low, high = date.fromisoformat(value.date_min), date.fromisoformat(value.date_max)
    if today > high or (today == high and not value.max_inclusive):
        return "ended"
    if today < low or (today == low and not value.min_inclusive):
        return "upcoming"
    return "open"


def _comparison_states(canonical: CanonicalPolicy, comparisons: dict, *,
                       upcoming=False, today: date | None = None) -> dict:
    states = {check["condition_id"]: None if check["state"] == "unknown" else
              check["state"] == "match" for check in comparisons["checks"]}
    if upcoming:
        today = today or seoul_today()
        for condition in canonical.conditions:
            if (condition.field_key == "application_period" and condition.role == "eligibility"
                    and states[condition.condition_id] is False
                    and _period_state(condition, today) == "upcoming"):
                states[condition.condition_id] = None
    return states


def _logic_state(canonical: CanonicalPolicy, comparisons: dict, *, upcoming=False,
                 today: date | None = None) -> bool | None:
    states = _comparison_states(canonical, comparisons, upcoming=upcoming, today=today)
    logical = matching.evaluate_logic(canonical.logic, states)
    # A source-backed target omitted from extraction still constrains personal guidance.
    # Upcoming application dates must not turn a known audience mismatch into a candidate.
    gender_guard = comparisons.get("gender_guard")
    if gender_guard and gender_guard["state"] == "mismatch":
        return False
    if gender_guard and gender_guard["state"] == "unknown" and logical is not False:
        return None
    return logical


def _viable_period_ids(node, states: dict, periods: dict) -> set[str]:
    """Read positive dates only on successful or still possible eligibility branches."""
    if node.op == "condition":
        return ({node.condition_id} if node.condition_id in periods
                and states[node.condition_id] is not False else set())
    if node.op in {"not", "unknown"}:
        return set()
    outcome = matching.evaluate_logic(node, states)
    if outcome is False:
        return set()
    children = node.children
    if node.op == "any":
        wanted = True if outcome is True else None
        children = [child for child in children
                    if matching.evaluate_logic(child, states) is wanted]
    return set().union(*(_viable_period_ids(child, states, periods) for child in children))


def _logic_period_schedule(canonical: CanonicalPolicy, comparisons: dict, today: date):
    periods = {condition.condition_id: condition for condition in canonical.conditions
               if condition.field_key == "application_period" and condition.role == "eligibility"}
    if not periods:
        return None
    states = _comparison_states(canonical, comparisons)
    viable = _viable_period_ids(canonical.logic, states, periods)
    if any(_period_state(periods[identifier], today) == "open" for identifier in viable):
        return "open"
    # A successful branch without a positive date cannot prove a future-only application window.
    if matching.evaluate_logic(canonical.logic, states) is True:
        return None
    future_states = _comparison_states(canonical, comparisons, upcoming=True, today=today)
    future_viable = _viable_period_ids(canonical.logic, future_states, periods)
    if any(_period_state(periods[identifier], today) == "upcoming" for identifier in future_viable):
        return "upcoming"
    return None


def _source_schedule(policy: dict, today: date) -> str:
    """The source's unambiguous global application period is separate from branch dates."""
    if policy.get("scheduleStatus") == "ended":
        return "ended"
    start, end = policy.get("applicationStart"), policy.get("applicationEnd")
    if end and date.fromisoformat(end) < today:
        return "ended"
    if policy.get("scheduleStatus") == "upcoming" or (start and date.fromisoformat(start) > today):
        return "upcoming"
    if start or end or policy.get("scheduleStatus") in {"open", "ongoing"}:
        return "open"
    return "unknown"


def _schedule(policy: dict, canonical: CanonicalPolicy, today: date, comparisons: dict) -> str:
    """Respect eligibility branches; unrelated dates never close the whole application."""
    if (policy.get("budget") or {}).get("usedPercent", 0) >= 100:
        return "ended"
    source_status = _source_schedule(policy, today)
    if source_status in {"ended", "upcoming"}:
        return source_status
    standalone = [condition for condition in canonical.conditions
                  if condition.field_key == "application_period"
                  and condition.role == "application"]
    # These facts have no AND/OR relationship in the eligibility tree. Keep ambiguity visible.
    if len(standalone) > 1:
        return "unknown"
    if standalone:
        state = _period_state(standalone[0], today)
        if state != "open":
            return state
    branch_status = _logic_period_schedule(canonical, comparisons, today)
    return branch_status or ("open" if standalone else source_status)


def _fingerprint(need_id: str, policy: dict, canonical: CanonicalPolicy, status: str,
                 schedule: str, checks: list[dict]) -> str:
    conditions = {}
    for condition in canonical.conditions:
        conditions[condition.condition_id] = condition.model_dump(
            mode="json", exclude={"condition_id", "group_id", "review_note", "source_field_key"})

    def logic(node):
        if node.op == "condition":
            return {"condition": conditions[node.condition_id]}
        children = [logic(child) for child in node.children]
        if node.op in {"all", "any"}:
            children.sort(key=lambda child: json.dumps(_compact(child), sort_keys=True,
                                                       ensure_ascii=False))
        return {"op": node.op, "children": children, "reason": node.reason}

    content = {key: policy.get(key) for key in (
        "id", "title", "organization", "benefit", "region", "audience", "otherConditions",
        "applicationPeriod", "applicationMethod", "applicationUrl", "sourceUrl", "contact",
        "applicationGuide")}
    content.update(need_id=need_id, status=status, schedule=schedule, logic=logic(canonical.logic),
                   conditions=sorted(conditions.values(), key=lambda item: json.dumps(item,
                                     sort_keys=True, ensure_ascii=False)),
                   compared=sorted(({"field": check["field_key"], "state": check["state"]}
                                    for check in checks), key=lambda item: (item["field"],
                                                                          item["state"])))
    data = json.dumps(_compact(content), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(data.encode()).hexdigest()


def scan_candidates(repository, member: dict, profile: MonitoringProfile, needs: list[dict], *,
                    today: date | None = None) -> list[dict]:
    """Page every latest public policy, retain unknowns and exclude proven mismatches."""
    if not needs:
        return []
    today = today or seoul_today()
    facts = monitoring_facts(member, profile)
    latest = published_catalog(repository)
    documents = repository.tables["condition_documents"]
    query = select(latest, documents.c.canonical_json, documents.c.matching_enabled,
                   documents.c.review_status).join(
        documents, documents.c.revision_id == latest.c.revision_id)
    results, after = [], None
    with repository.engine.connect() as connection:
        while True:
            page = query
            if after is not None:
                page = page.where(latest.c.policy_key > after)
            records = connection.execute(page.order_by(latest.c.policy_key).limit(PAGE_SIZE))
            rows = records.mappings().all()
            if not rows:
                break
            after = rows[-1]["policy_key"]
            for record in rows:
                try:
                    linked = [(need, _evidence(record["source_json"], need["keywords"],
                                              disaster=need["id"] in {
                                                  "disaster_recovery", "disaster_watch"},
                                              watch=need["id"] == "disaster_watch"))
                              for need in needs]
                except (ValueError, KeyError, TypeError, AttributeError) as exc:
                    raise MonitoringScanIncomplete("Public policy source is invalid") from exc
                linked = [(need, evidence) for need, evidence in linked if evidence]
                if not linked:
                    continue
                try:
                    comparisons = matching.compare_policy(record, facts, today=today)
                    canonical = CanonicalPolicy.model_validate(record["canonical_json"])
                    policy = card(record)
                    policy.update(policy_signals(record))
                    schedule = _schedule(policy, canonical, today, comparisons)
                    if schedule == "ended":
                        continue
                    logical = _logic_state(canonical, comparisons, upcoming=schedule == "upcoming",
                                           today=today)
                    if logical is False:
                        continue
                except (ValueError, KeyError, TypeError) as exc:
                    raise MonitoringScanIncomplete("Public policy validation failed") from exc
                source = SourcePolicy.model_validate(record["source_json"])
                missing_targets = matching.missing_target_requirements(canonical, source)
                status = ("needs_review" if missing_targets or logical is None
                          else comparisons["status"])
                if schedule == "unknown":
                    status = "needs_review"
                questions = matching.review_questions(
                    comparisons, canonical, source, schedule_status=schedule,
                    logic_states=_comparison_states(
                        canonical, comparisons, upcoming=schedule == "upcoming", today=today))
                for need, evidence in linked:
                    candidate_status = status
                    candidate_questions = questions.copy()
                    if need["id"] == "disaster_watch":
                        region_evidence = _watch_region_evidence(
                            canonical, comparisons, today=today, upcoming=schedule == "upcoming")
                        if not region_evidence:
                            continue
                        evidence = [*evidence, *region_evidence]
                    if need["id"] in {"disaster_recovery", "disaster_watch"}:
                        # No disaster/damage fields exist in the canonical registry yet.
                        candidate_status = "needs_review"
                        candidate_questions.append("재난 지정·피해 확인 요건을 확인해 주세요.")
                    keywords = [item["keyword"] for item in evidence]
                    reason = (f"공개 원문의 {', '.join(keywords[:3])} 안내가 "
                              f"{need['title']}와 관련돼요. "
                              "조건 비교로 찾은 확인 후보이며 신청 자격을 확정한 결과가 아니에요.")
                    if need["id"] == "disaster_watch":
                        reason = ("거주 지역과 관련된 재난 지원 공고를 발견했어요. "
                                  "실제 피해 여부·발생일·공고 요건을 확인해야 해요. "
                                  "공고 발견은 실제 재난 발생이나 개인 피해 확인을 뜻하지 않아요.")
                    if schedule == "upcoming":
                        reason += " 접수 시작 전 공고로, 시작일과 신청 준비사항을 확인해 주세요."
                    fingerprint = _fingerprint(need["id"], policy, canonical, candidate_status,
                                               schedule, comparisons["checks"])
                    results.append({"need_id": need["id"], "policy_id": record["policy_key"],
                                    "policy": policy, "status": candidate_status, "reason": reason,
                                    "questions": list(dict.fromkeys(candidate_questions)),
                                    "fingerprint": fingerprint,
                                    "schedule_status": schedule, "eligibility_decided": False,
                                    "matched_keywords": keywords, "evidence": evidence})
    return results
