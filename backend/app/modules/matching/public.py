"""Read-only, three-valued comparisons. No model calls, writes or eligibility decisions."""

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.contracts.conditions import CanonicalCondition, CanonicalPolicy, LogicNode
from app.contracts.finance import FinancialProfile
from app.contracts.matching import RecommendationProfile
from app.contracts.parsing import SourcePolicy
from app.modules.presentation.public import load_popularity, policy_signals
from app.modules.regions.public import RegionCatalog, default_catalog
from app.modules.storage.catalog import card, published_catalog
from app.modules.validation.public import validate_canonical

REGION_NAMES = {
    "서울": "서울특별시", "경기": "경기도", "인천": "인천광역시", "부산": "부산광역시",
    "대구": "대구광역시", "광주": "광주광역시", "대전": "대전광역시", "울산": "울산광역시",
    "세종": "세종특별자치시", "강원": "강원특별자치도", "충북": "충청북도",
    "충남": "충청남도", "전북": "전북특별자치도", "전남": "전라남도",
    "경북": "경상북도", "경남": "경상남도", "제주": "제주특별자치도",
}
AGE_RANGES = {
    "19세 미만": (0, 18), "19~34세": (19, 34), "35~49세": (35, 49),
    "50~64세": (50, 64), "65세 이상": (65, 120),
}
LABELS = {
    "age": "나이", "gender": "성별", "residence_region": "거주 지역",
    "registered_residence_region": "주민등록 지역", "actual_residence_region": "실거주 지역",
    "household_size": "심사 가구원 수", "employment_status": "취업 상태",
    "home_ownership": "주택 소유 여부", "employment_preparation_status": "취업 준비 여부",
    "application_period": "신청 기간",
    "disability_registered": "장애 등록 여부", "monthly_income": "월 소득",
    "recognized_income_median_ratio": "소득인정액 기준", "total_assets": "재산",
}
MAX_CANDIDATES = 500

# A title can reveal a required audience omitted by an incomplete extraction. These
# checks only detect missing representation; the recorded OR/NOT logic still decides
# whether a represented requirement actually applies to the successful branch.
TARGET_REQUIREMENTS = (
    (r"장애(?:인|아동|청소년|여성)?", "disability_registered", {"disability_registered"}),
    (r"자립\s*(?:준비\s*)?(?:청년|청소년)|보호\s*종료|자립수당", "care_leaver_status",
     {"care_leaver_status", "care_leaver", "self_reliant_youth"}),
    (r"한\s*부모|미혼\s*(?:모|부)", "single_parent_status",
     {"single_parent_status", "single_parent"}),
    (r"기초\s*생활|차상위|수급(?:자|가구)", "benefit_recipient_status",
     {"benefit_recipient_status", "housing_benefit_recipient",
      "child_tax_credit_recipient", "earned_income_tax_credit_recipient"}),
    (r"저소득|중위\s*소득|소득\s*인정액|소득\s*(?:기준|[0-9])", "income",
     {"income", "monthly_income", "annual_income",
                           "recognized_income_amount", "recognized_income_median_ratio"}),
    (r"국가\s*유공자|참전|보훈", "veteran_status", {"veteran_status"}),
    (r"임산부|임신|출산", "pregnancy_or_parent_status", {"pregnancy_or_parent_status"}),
    (r"다문화", "multicultural_family_status", {"multicultural_family_status"}),
)
BROAD_AUDIENCE = re.compile(
    r"국민\s*누구나|누구나\s*(?:신청|이용|참여)|"
    r"(?:모든|전체)\s*국민|전\s*국민\s*(?:대상|이용|신청)|"
    r"(?:지원\s*대상|신청\s*자격|대상자)\s*(?:에\s*)?제한\s*없"
)


@dataclass(frozen=True)
class MatchingFacts:
    age_range: tuple[int, int] | None = None
    gender: str | None = None
    region: str | None = None
    employment: str | None = None
    financial: FinancialProfile | None = None
    home_ownership: bool | None = None
    employment_preparation: bool | None = None


def build_facts(member: dict | None, profile: RecommendationProfile | None,
                financial: FinancialProfile | None = None) -> MatchingFacts:
    """DB member facts take precedence even when missing; never infer age from household members."""
    preference = profile or RecommendationProfile()
    age = member.get("age") if member is not None else None
    age_range = ((age, age) if age is not None else None) if member is not None else (
        AGE_RANGES.get(preference.ageBand))
    region = member.get("region") if member is not None else preference.region
    gender = {"male": "MALE", "female": "FEMALE"}.get((member or {}).get("gender"))
    # Job preparation, freelance work and a past retirement do not establish current
    # unemployment or self-employment. Only explicit current states become comparison facts.
    employment = {"직장인": "EMPLOYED", "자영업자": "SELF_EMPLOYED",
                  "무직": "UNEMPLOYED"}.get(preference.occupation)
    return MatchingFacts(age_range, gender, REGION_NAMES.get(region), employment, financial)


def numeric_comparison(condition: CanonicalCondition, bounds: tuple[int, int]) -> bool | None:
    """An age band must entirely satisfy or entirely fail a constraint; overlap is unknown."""
    low, high = map(Decimal, bounds)
    value = condition.value
    if value.kind == "DECIMAL_RANGE":
        minimum, maximum = Decimal(value.minimum), Decimal(value.maximum)
        below = high < minimum or (high == minimum and not value.min_inclusive)
        above = low > maximum or (low == maximum and not value.max_inclusive)
        if below or above:
            return False
        if ((low > minimum or (low == minimum and value.min_inclusive))
                and (high < maximum or (high == maximum and value.max_inclusive))):
            return True
        return None
    threshold = Decimal(value.number)
    checks = {
        "EQ": lambda n: n == threshold, "GT": lambda n: n > threshold,
        "GTE": lambda n: n >= threshold, "LT": lambda n: n < threshold,
        "LTE": lambda n: n <= threshold,
    }
    check = checks[condition.operator]
    if condition.operator == "EQ" and low <= threshold <= high and low != high:
        return None
    results = (check(low), check(high))
    return results[0] if results[0] == results[1] else None


def region_comparison(condition: CanonicalCondition, name: str | None,
                      catalog: RegionCatalog) -> bool | None:
    if not name:
        return None
    value = condition.value
    region = catalog.resolve(name, system=value.system).region
    if region is None:
        return None
    inside = catalog.contains(value.system, value.code, region.code)
    if inside is True:
        return True if value.include_descendants or value.code == region.code else False
    # Province-only profiles cannot decide a district or dong condition within that province.
    if catalog.contains(value.system, region.code, value.code) is True:
        return None
    return inside


def compare_condition(condition: CanonicalCondition, facts: MatchingFacts,
                      catalog: RegionCatalog, today: date) -> tuple[bool | None, str]:
    field = condition.field_key
    if condition.state_code == 9:
        return None, "공고 조건의 해석을 확인해야 해요."
    if condition.state_code == 0:
        return True, "원문에 제한이 없다고 명시되어 있어요."
    # A basis can specify age at a past cutoff or a different financial definition.
    if condition.reference_basis:
        return None, "공고의 기준 시점·산정 기준을 확인해야 해요."
    if field == "application_period":
        value = condition.value
        if value.kind != "DATE_RANGE":
            return None, "신청 기간을 확인해야 해요."
        low, high = date.fromisoformat(value.date_min), date.fromisoformat(value.date_max)
        in_period = ((today > low or (today == low and value.min_inclusive))
                     and (today < high or (today == high and value.max_inclusive)))
        return in_period, "원문 날짜와 비교했어요."
    if condition.subject not in {"applicant", "household"}:
        return None, "신청자 외 대상자의 정보가 필요해요."
    if field == "household_size" and condition.subject == "household":
        finance = facts.financial
        if finance and finance.household_scope_confirmed and not finance.additional_review:
            size = finance.household_size
            return numeric_comparison(condition, (size, size)), (
                "사용을 선택한 금융정보의 확인된 가구원 수와 비교했어요.")
        return None, "이 공고에서 심사하는 가구원 범위를 확인해야 해요."
    if condition.subject != "applicant":
        return None, "가구 전체에 적용되는 조건은 별도 정보가 필요해요."
    if field == "age":
        return (numeric_comparison(condition, facts.age_range) if facts.age_range else None), (
            "나이와 공고의 연령 조건을 비교했어요. 정확한 기준일은 확인해 주세요.")
    if field == "gender":
        return (facts.gender == condition.value.code if facts.gender else None), (
            "회원정보의 성별과 비교했어요.")
    if field == "residence_region":
        return region_comparison(condition, facts.region, catalog), (
            "공식 지역 계층과 비교했어요. 세부 거주지는 추가 확인이 필요할 수 있어요.")
    if field in {"registered_residence_region", "actual_residence_region"}:
        return None, "회원 지역에는 주민등록·실거주 구분이 없어 추가 확인이 필요해요."
    if field == "employment_status":
        return (facts.employment == condition.value.code if facts.employment else None), (
            "이번 요청에서 선택한 직업 정보와 비교했어요.")
    if field == "home_ownership":
        return (facts.home_ownership == condition.value.boolean
                if facts.home_ownership is not None else None), (
                    "직접 입력한 주택 소유 정보와 비교했어요.")
    if field == "employment_preparation_status":
        return (facts.employment_preparation == condition.value.boolean
                if facts.employment_preparation is not None else None), (
                    "직접 입력한 취업 준비 정보와 비교했어요.")
    return None, "이 조건에 대응하는 사용자 정보 또는 검토된 산정 기준이 필요해요."


def evaluate_logic(node: LogicNode, states: dict[str, bool | None]) -> bool | None:
    if node.op == "unknown":
        return None
    if node.op == "condition":
        return states[node.condition_id]
    values = [evaluate_logic(child, states) for child in node.children]
    if node.op == "not":
        return None if values[0] is None else not values[0]
    if node.op == "all":
        return False if False in values else None if None in values else True
    return True if True in values else None if None in values else False


def compare_policy(record: dict, facts: MatchingFacts, *, catalog: RegionCatalog | None = None,
                   today: date | None = None) -> dict:
    """Return source-cited checks; disabled/partial policies always require review."""
    catalog = catalog or default_catalog()
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
    canonical = CanonicalPolicy.model_validate(record["canonical_json"])
    source = SourcePolicy.model_validate(record["source_json"])
    validate_canonical(canonical, source, catalog=catalog)
    checks, states = [], {}
    for condition in canonical.conditions:
        state, note = compare_condition(condition, facts, catalog, today)
        states[condition.condition_id] = state
        checks.append({
            "condition_id": condition.condition_id, "field_key": condition.field_key,
            "role": condition.role, "subject": condition.subject,
            "label": LABELS.get(condition.field_key, {
                "eligibility": "지원 대상", "exclusion": "신청 제외 대상",
                "priority": "우대사항", "application": "신청 안내", "reference": "참고사항",
            }[condition.role]),
            "state": "unknown" if state is None else "match" if state else "mismatch",
            "note": note, "source_field": condition.source_field,
            "quote": condition.evidence_quote,
        })
    logical = evaluate_logic(canonical.logic, states)
    ready = (bool(record["matching_enabled"]) and record["review_status"] == "published"
             and canonical.coverage == "complete")
    status = "needs_review" if not ready or logical is None else (
        "potential_match" if logical else "not_matched")
    notes = []
    if not record["matching_enabled"]:
        notes.append("이 공고는 자동 매칭 검토가 완료되지 않았어요.")
    if canonical.coverage != "complete" or canonical.logic.op == "unknown":
        notes.append("조건 간 관계나 예외 조건을 확인해야 해요.")
    if any(check["state"] == "unknown" for check in checks):
        notes.append("아직 비교할 수 없는 조건이 있어요.")
    return {"status": status, "checks": checks, "notes": notes,
            "eligibility_decided": False, "matching_enabled": bool(record["matching_enabled"])}


def review_questions(comparison: dict, canonical: CanonicalPolicy, source: SourcePolicy,
                     *, schedule_status: str) -> list[str]:
    """Explain unresolved source requirements without exposing extraction keys or priority rules."""
    checks = {check["condition_id"]: check for check in comparison["checks"]}
    states = {key: None if check["state"] == "unknown" else check["state"] == "match"
              for key, check in checks.items()}

    def unresolved(node):
        if evaluate_logic(node, states) is not None or node.op == "unknown":
            return set()
        if node.op == "condition":
            return {node.condition_id}
        return set().union(*(unresolved(child) for child in node.children))

    relevant = unresolved(canonical.logic)
    questions, seen = [], set()
    incomplete = (not comparison["matching_enabled"] or canonical.coverage != "complete"
                  or canonical.logic.op == "unknown")

    def add_source(text, label):
        # Keep the whole requirement; never shorten away an exception or qualifier.
        quote = re.sub(r"\s+", " ", text or "").strip()
        if not quote or len(quote) > 300 or re.search(r"\b\w+_\w+\b", quote):
            return False
        if quote not in seen:
            seen.add(quote)
            questions.append(f"{label}: {quote}")
        return True

    for check in comparison["checks"]:
        if (check["condition_id"] not in relevant or check["state"] != "unknown"
                or check["role"] not in {"eligibility", "exclusion"}
                or check["field_key"] == "application_period"):
            continue
        label = "신청 제외 대상 안내" if check["role"] == "exclusion" else "지원 대상 안내"
        if not add_source(check["quote"], label):
            incomplete = True
    if missing_target_requirements(canonical, source):
        # A missing extraction is a service limitation, not a request for a user's data.
        audience = target_evidence(source)[1:]
        if not audience:
            incomplete = True
        for statement in audience:
            if not add_source(statement, "지원 대상 안내"):
                incomplete = True
    if incomplete:
        questions.append("세부 신청 조건은 공식 공고의 지원 대상·신청 제외 대상 안내를 확인해 주세요.")
    if schedule_status == "unknown":
        questions.append("담당 기관에 현재 신청을 받고 있는지와 신청 마감일을 문의해 주세요.")
    return list(dict.fromkeys(questions))


def candidate_query(repository):
    """Use exactly the catalog's latest published revision, never an older enabled revision."""
    latest = published_catalog(repository)
    documents = repository.tables["condition_documents"]
    return select(latest, documents.c.canonical_json, documents.c.matching_enabled,
                  documents.c.review_status).join(
        documents, documents.c.revision_id == latest.c.revision_id
    ).order_by(latest.c.created_at.desc(), latest.c.policy_key).limit(MAX_CANDIDATES + 1)


def target_evidence(source: SourcePolicy) -> list[str]:
    """Read actual audience statements; benefit descriptions and priority lists aren't targets."""
    values = [source.title]
    for field in ("eligibility", "selection"):
        values.extend(line for line in source.fields.get(field, "").splitlines()
                      if not re.search(r"우선|우대|가점", line))
    values.extend(line for line in source.fields.get("text", "").splitlines()
                  if re.match(r"\s*(?:[-*○□]\s*)?(?:지원\s*대상|신청\s*자격|지원\s*자격)"
                              r"\s*[:：]", line) and not re.search(r"우선|우대|가점", line))
    return values


def missing_target_requirements(canonical: CanonicalPolicy, source: SourcePolicy) -> list[str]:
    """Fail safely when an audience in the source has no required canonical representation."""
    def referenced(node):
        if node.op == "condition":
            return {node.condition_id}
        return set().union(*(referenced(child) for child in node.children))
    required_ids = referenced(canonical.logic)
    represented = {name for condition in canonical.conditions
                   if condition.condition_id in required_ids and condition.state_code == 1
                   for name in (condition.field_key, condition.source_field_key)}
    statements = target_evidence(source)
    target = "\n".join(statements)
    missing = [field for pattern, field, names in TARGET_REQUIREMENTS
               if re.search(pattern, target) and not represented.intersection(names)]
    audience = "\n".join(statements[1:])
    if re.search(r"(?:만\s*)?[0-9]+\s*세\s*(?:이상|이하|미만|초과)|"
                 r"[0-9]+\s*[~～-]\s*[0-9]+\s*세", audience) and "age" not in represented:
        missing.append("age")
    region = "|".join(re.escape(name) for name in REGION_NAMES.values())
    local_audience = re.search(r"(?:" + region + r")|(?:서울|부산|대구|인천|광주|대전|울산|세종)"
                               r"\s*(?:시민|주민|거주)|[가-힣]+(?:시|군|구|읍|면|동)"
                               r"\s*(?:시민|주민|거주|민)", audience)
    has_region = represented.intersection({"residence_region", "registered_residence_region",
                                           "actual_residence_region"})
    if local_audience and not has_region and not re.search(
            r"(?:거주\s*)?지역\s*제한\s*없", audience):
        missing.append("residence_region")
    return missing


def has_broad_audience_evidence(canonical: CanonicalPolicy, source: SourcePolicy) -> bool:
    """A negative audience statement cannot establish unrestricted access."""
    audience = "\n".join(target_evidence(source)[1:])
    audience += "\n" + "\n".join(condition.evidence_quote or ""
                                     for condition in canonical.conditions
                                     if condition.role == "eligibility")
    original = "\n".join(source.fields.get(field, "")
                         for field in ("text", "eligibility", "selection"))
    negative = re.search(r"(?:누구나|전\s*국민|모든\s*국민|전체\s*국민)[^\n.。]{0,80}"
                         r"(?:아니|아닌|아닙|않|불가|제외)", original)
    return bool(BROAD_AUDIENCE.search(audience)) and not negative


def proof_fields(node: LogicNode, states: dict[str, bool | None],
                 conditions: dict[str, CanonicalCondition]) -> set[str]:
    """Gather actual facts on a decisive branch, preserving OR and negated exclusions."""
    if node.op in {"unknown", "condition"}:
        if node.op == "unknown" or states[node.condition_id] is None:
            return set()
        condition = conditions[node.condition_id]
        return {condition.field_key} if condition.state_code == 1 else set()
    outcome = evaluate_logic(node, states)
    if outcome is None:
        return set()
    relevant = node.children
    if node.op in {"any", "all"}:
        # True OR / false AND need only the branches that establish their outcome.
        if (node.op == "any" and outcome) or (node.op == "all" and not outcome):
            relevant = [child for child in relevant
                        if evaluate_logic(child, states) is outcome]
    return set().union(*(proof_fields(child, states, conditions) for child in relevant))


def application_is_open(policy: dict, matching: dict, today: date) -> bool:
    """Only known ongoing/current application periods belong in the home recommendation."""
    periods = [check for check in matching["checks"] if check["field_key"] == "application_period"
               and check["role"] == "application"]
    if any(check["state"] != "match" for check in periods):
        return False
    start, end = policy.get("applicationStart"), policy.get("applicationEnd")
    if (start and date.fromisoformat(start) > today) or (
            end and date.fromisoformat(end) < today):
        return False
    budget = policy.get("budget") or {}
    if budget.get("usedPercent", 0) >= 100:
        return False
    return bool(periods or policy.get("scheduleStatus") == "ongoing" or start or end)


def recommend(repository, facts: MatchingFacts, profile: RecommendationProfile | None = None,
              *, limit: int = 3, today: date | None = None) -> dict:
    """Offer proven profile comparisons or explicitly broad current notices."""
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
    with repository.engine.connect() as connection:
        records = connection.execute(candidate_query(repository)).mappings().all()
    truncated = len(records) > MAX_CANDIDATES
    records = records[:MAX_CANDIDATES]
    popularity = load_popularity(repository, [record["policy_key"] for record in records])
    personalized, general, skipped_invalid, missing = [], [], 0, set()
    classified_with_profile = False
    interests = set((profile or RecommendationProfile()).interests)
    for record in records:
        try:
            policy = card(record)
            policy.update(policy_signals(record, popularity=popularity.get(record["policy_key"])))
            matching = compare_policy(record, facts, today=today)
            canonical = CanonicalPolicy.model_validate(record["canonical_json"])
            source = SourcePolicy.model_validate(record["source_json"])
            if not application_is_open(policy, matching, today):
                continue
        except (ValueError, KeyError, TypeError):
            skipped_invalid += 1
            continue
        missing_targets = missing_target_requirements(canonical, source)
        missing.update(missing_targets)
        if missing_targets or matching["status"] == "needs_review":
            if matching["status"] == "needs_review":
                missing.update(check["field_key"] for check in matching["checks"]
                               if check["role"] in {"eligibility", "exclusion"}
                               and check["state"] == "unknown")
            continue
        conditions = {condition.condition_id: condition for condition in canonical.conditions}
        states = {check["condition_id"]: None if check["state"] == "unknown" else
                  check["state"] == "match" for check in matching["checks"]}
        empty_states = {identifier: compare_condition(condition, MatchingFacts(),
                                                      default_catalog(), today)[0]
                        for identifier, condition in conditions.items()}
        empty_outcome = evaluate_logic(canonical.logic, empty_states)
        if matching["status"] == "not_matched":
            if empty_outcome is not False and proof_fields(canonical.logic, states, conditions):
                classified_with_profile = True
            continue
        broad = empty_outcome is True
        interest = policy["category"] in interests
        views = (policy.get("popularity") or {}).get("views", 0)
        reasons = []
        if broad:
            # Age/region unrestricted individually isn't evidence that the whole
            # audience is unrestricted. Require an explicit source audience statement.
            if not has_broad_audience_evidence(canonical, source):
                continue
            reasons.append("원문에 누구나 이용할 수 있는 대상으로 안내된 공고예요.")
            if views > 0:
                reasons.append("공공기관이 제공한 누적 조회수를 참고했어요.")
            useful = policy["category"] == "문화" or "교통" in policy["title"]
            score = (policy.get("scheduleStatus") == "ongoing", views, useful)
            bucket = general
        else:
            fields = proof_fields(canonical.logic, states, conditions)
            if not fields:
                continue
            if interest:
                reasons.append("선택한 관심 분야의 공고예요.")
            labels = [LABELS.get(field, field) for field in sorted(fields)]
            reasons.append(f"입력한 정보로 {', '.join(labels[:3])} 조건을 비교했어요.")
            score, bucket = (interest, len(fields), views), personalized
        reasons.append("신청 전 공식 공고와 담당 기관의 안내를 확인해 주세요.")
        bucket.append((score, {"policy": policy, "reason": " ".join(reasons),
                               "matching": matching}))
    profile_sufficient = bool(personalized) or classified_with_profile
    candidates = personalized if profile_sufficient else general
    candidates.sort(key=lambda entry: entry[0], reverse=True)
    items = [item for _, item in candidates[:limit]]
    if profile_sufficient:
        mode = "personalized"
        guidance = (("입력한 정보로 비교할 수 있는 공고를 골랐어요. "
                     "신청 자격은 담당 기관에서 확인해 주세요.") if items else
                    "현재 입력한 조건에 맞는 신청 중 공고가 없어요. 전체 공고도 확인해 주세요.")
    elif items:
        popular = any((item["policy"].get("popularity") or {}).get("views", 0) > 0
                      for item in items)
        mode = "popular" if popular else "general"
        guidance = ("맞춤 추천에 필요한 정보가 부족해 누구나 이용할 수 있는 공고를 보여드려요. "
                    + ("공공기관의 누적 조회수를 참고했어요. " if popular else "")
                    + "내 정보를 더 입력하면 나에게 맞는 추천을 받을 수 있어요.")
    else:
        mode = "profile_required"
        guidance = ("현재 정보로 안전하게 추천할 수 있는 신청 중 공고가 없어요. "
                    "나이·거주 지역 등 내 정보를 추가하고 전체 공고도 확인해 주세요.")
    summary = (f"조건을 비교한 신청 중 공개 공고 {len(items)}건을 안내해요."
               if profile_sufficient else f"신청 중인 일반 공고 {len(items)}건을 안내해요."
               if items else "현재 안내할 수 있는 신청 중 공개 공고가 없어요.")
    if truncated:
        summary += f" 최근 공개 공고 {MAX_CANDIDATES}건을 비교했어요."
    if skipped_invalid:
        summary += " 원문·조건 검증을 통과하지 못한 공고는 제외했어요."
    if not profile_sufficient and not missing:
        missing.update(field for field, absent in (("age", facts.age_range is None),
                                                   ("residence_region", facts.region is None))
                       if absent)
    return {"items": items, "summary": summary, "eligibility_decided": False,
            "profile_source": "request", "truncated": truncated, "mode": mode,
            "profile_sufficient": profile_sufficient, "guidance": guidance,
            "missing_fields": [] if profile_sufficient else sorted(missing)}
