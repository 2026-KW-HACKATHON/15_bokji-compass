"""Read-only, three-valued comparisons. No model calls, writes or eligibility decisions."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.contracts.conditions import CanonicalCondition, CanonicalPolicy, LogicNode
from app.contracts.finance import FinancialProfile
from app.contracts.matching import RecommendationProfile
from app.contracts.parsing import SourcePolicy
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
    "application_period": "신청 기간",
}
MAX_CANDIDATES = 500


@dataclass(frozen=True)
class MatchingFacts:
    age_range: tuple[int, int] | None = None
    gender: str | None = None
    region: str | None = None
    employment: str | None = None
    financial: FinancialProfile | None = None


def build_facts(member: dict | None, profile: RecommendationProfile | None,
                financial: FinancialProfile | None = None) -> MatchingFacts:
    """DB member facts take precedence even when missing; never infer age from household members."""
    preference = profile or RecommendationProfile()
    age = member.get("age") if member is not None else None
    age_range = ((age, age) if age is not None else None) if member is not None else (
        AGE_RANGES.get(preference.ageBand))
    region = member.get("region") if member is not None else preference.region
    gender = {"male": "MALE", "female": "FEMALE"}.get((member or {}).get("gender"))
    employment = {"직장인": "EMPLOYED", "자영업자": "SELF_EMPLOYED"}.get(preference.occupation)
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
            "label": LABELS.get(condition.field_key, condition.source_field_key),
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


def candidate_query(repository):
    """Use exactly the catalog's latest published revision, never an older enabled revision."""
    latest = published_catalog(repository)
    documents = repository.tables["condition_documents"]
    return select(latest, documents.c.canonical_json, documents.c.matching_enabled,
                  documents.c.review_status).join(
        documents, documents.c.revision_id == latest.c.revision_id
    ).order_by(latest.c.created_at.desc(), latest.c.policy_key).limit(MAX_CANDIDATES + 1)


def recommend(repository, facts: MatchingFacts, profile: RecommendationProfile | None = None,
              *, limit: int = 3, today: date | None = None) -> dict:
    """Rank advisory evidence and interests. Missing monetary definitions never become a pass."""
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
    with repository.engine.connect() as connection:
        records = connection.execute(candidate_query(repository)).mappings().all()
    truncated = len(records) > MAX_CANDIDATES
    candidates, skipped_invalid = [], 0
    interests = set((profile or RecommendationProfile()).interests)
    for record in records[:MAX_CANDIDATES]:
        try:
            policy = card(record)
            end = policy.get("applicationEnd")
            if end and date.fromisoformat(end) < today:
                continue
            matching = compare_policy(record, facts, today=today)
        except (ValueError, KeyError, TypeError):
            skipped_invalid += 1
            continue
        if matching["status"] == "not_matched":
            continue
        # Do not collapse OR branches or invert exclusion facts into hard filtering/ranking.
        checks = [c for c in matching["checks"] if c["role"] == "eligibility"]
        matching_labels = list(dict.fromkeys(c["label"] for c in checks if c["state"] == "match"))
        interest = policy["category"] in interests
        score = (matching["status"] == "potential_match", interest, len(matching_labels))
        reasons = []
        if interest:
            reasons.append("선택한 관심 분야의 공고예요.")
        if matching_labels:
            reasons.append(
                f"{', '.join(matching_labels[:3])}의 개별 조건과 일치하는 정보가 있어요.")
        if not reasons:
            reasons.append("조건을 추가 확인하며 살펴볼 수 있는 공개 공고예요.")
        reasons.append("신청 자격은 추가 조건과 담당 기관의 확인이 필요해요.")
        if any(c["state"] == "mismatch" for c in checks):
            reasons.append("일부 조건과 다른 정보가 있으므로 적용 대상·예외를 확인해 주세요.")
        candidates.append((score, {"policy": policy, "reason": " ".join(reasons),
                                   "matching": matching}))
    candidates.sort(key=lambda entry: entry[0], reverse=True)
    items = [item for _, item in candidates[:limit]]
    summary = (
        f"공개 공고에서 {len(items)}건을 골랐어요. "
        "조건별 비교이며 신청 자격 확정은 아니에요."
        if items else "현재 정보로 안내할 공개 공고가 없어요. "
        "전체 공고와 추가 조건을 확인해 주세요."
    )
    if truncated:
        summary += f" 최근 공개 공고 {MAX_CANDIDATES}건을 비교했어요."
    if skipped_invalid:
        summary += " 원문·조건 검증을 통과하지 못한 공고는 제외했어요."
    return {"items": items, "summary": summary, "eligibility_decided": False,
            "profile_source": "request", "truncated": truncated}
