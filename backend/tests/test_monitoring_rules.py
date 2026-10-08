"""Monitoring discovery boundaries use synthetic public notices and an isolated SQL store."""

from copy import deepcopy
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    create_engine,
    insert,
)

from app.contracts.conditions import CanonicalCondition
from app.modules.matching import public as matching
from app.modules.monitoring import models, public
from app.modules.monitoring.models import MonitoringProfile, SaveMonitoringInput
from app.modules.normalization.raw import normalize_record
from app.modules.regions.public import default_catalog

TODAY = date(2026, 10, 7)
MEMBER = {"age": 27, "gender": "female", "region": "서울"}


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(models, "seoul_today", lambda: TODAY)


@pytest.mark.parametrize("facts", [
    {"building_year": "2000"}, {"building_year": 2027}, {"building_year": 1799},
    {"repair_needed": 1}, {"job_seeking": "true"}, {"disaster_damage": 0},
    {"disaster_occurred_on": "2026-10-08"}, {"disaster_occurred_on": "2026-02-30"},
    {"disaster_occurred_on": "20261007"}, {"account_id": "someone-else"},
])
def test_profile_rejects_coercion_future_and_foreign_account(facts):
    with pytest.raises(ValidationError):
        MonitoringProfile.model_validate(facts)


def test_json_iso_date_null_and_explicit_false_survive_roundtrip():
    value = MonitoringProfile.model_validate_json(
        '{"disaster_occurred_on":"2026-10-07","disaster_damage":false,"job_seeking":null}')
    assert value.disaster_occurred_on == "2026-10-07"
    assert value.disaster_damage is False and value.job_seeking is None
    assert value.interests == [] and value.building_year is None
    assert MonitoringProfile.model_validate_json(value.model_dump_json()) == value
    with pytest.raises(ValidationError):
        SaveMonitoringInput.model_validate({"profile": {}, "consent": 1, "enabled": True})
    with pytest.raises(ValidationError):
        SaveMonitoringInput(profile=MonitoringProfile(), consent=False, enabled=True)


@pytest.mark.parametrize("facts,expected", [
    ({"housing_tenure": "owner", "building_year": 2006}, True),
    ({"housing_tenure": "owner", "building_year": 2007}, False),
    ({"housing_tenure": "owner", "building_year": 1990, "repair_needed": False}, False),
    ({"housing_tenure": "renter", "building_year": 1990}, False),
    ({"building_year": 1990}, False),
    ({"housing_tenure": "renter", "repair_needed": True}, True),
    ({"repair_needed": False}, False),
])
def test_housing_age_is_exploration_and_requires_owner_or_explicit_repair(facts, expected):
    needs = public.derive_needs({}, MonitoringProfile.model_validate(facts), today=TODAY)
    assert bool(needs) is expected
    if needs:
        assert "탐색 기준" in needs[0]["reason"] and "지원 자격" in needs[0]["reason"]


@pytest.mark.parametrize("occupation,employment", [
    (None, None), ("학생", None), ("취업 준비 중", None),
    ("직장인", "EMPLOYED"), ("자영업자", "SELF_EMPLOYED"),
    ("프리랜서", None), ("은퇴 후", None), ("무직", "UNEMPLOYED"),
])
def test_youth_and_job_seeking_do_not_imply_unemployment(occupation, employment):
    profile = MonitoringProfile(occupation=occupation, job_seeking=True)
    facts = public.monitoring_facts(MEMBER, profile)
    assert facts.employment == employment
    assert facts.employment_preparation is True
    need = public.derive_needs(MEMBER, profile, today=TODAY)[0]
    assert need["id"] == "youth_employment"
    assert "미취업을 추정하지" in need["reason"]
    assert public.derive_needs({"age": None}, MonitoringProfile(), today=TODAY) == []


@pytest.mark.parametrize("age", [45, None])
def test_preparing_occupation_without_youth_age_generates_employment_need(age):
    profile = MonitoringProfile(occupation="취업 준비 중")
    member = {"age": age}
    needs = public.derive_needs(member, profile, today=TODAY)
    assert len(needs) == 1 and needs[0]["id"] == "employment_support"
    assert "선택한 취업 준비 상황" in needs[0]["reason"]
    assert profile.job_seeking is None
    assert public.monitoring_facts(member, profile).employment is None
    assert public.monitoring_facts(member, profile).employment_preparation is None
    assert any("새 일자리를 찾거나" in question for question in needs[0]["questions"])


@pytest.mark.parametrize("occupation", ["학생", "취업 준비 중", "직장인", "자영업자",
                                         "프리랜서", "무직", "은퇴 후", "기타"])
@pytest.mark.parametrize("job_seeking", [None, False, True])
def test_economic_activity_never_fills_or_overrides_separate_job_search(occupation, job_seeking):
    profile = MonitoringProfile(occupation=occupation, job_seeking=job_seeking)
    facts = public.monitoring_facts(MEMBER, profile)
    assert facts.employment_preparation is job_seeking
    assert profile.job_seeking is job_seeking


def test_explicit_unemployed_and_freelancer_get_relevant_followup_questions():
    unemployed = public.derive_needs(MEMBER, MonitoringProfile(occupation="무직"), today=TODAY)[0]
    assert "직접 선택한 현재 무직 상태" in unemployed["reason"]
    assert not any("재직 중" in question for question in unemployed["questions"])
    assert any("새 일자리" in question for question in unemployed["questions"])
    freelancer = public.derive_needs(
        MEMBER, MonitoringProfile(occupation="프리랜서"), today=TODAY)[0]
    assert any("근로계약" in question for question in freelancer["questions"])


@pytest.mark.parametrize("age,expected", [(45, []), (None, []), (27, ["youth_employment"])])
def test_preparing_occupation_explicit_decline_suppresses_extra_rule_but_keeps_youth(age, expected):
    profile = MonitoringProfile(occupation="취업 준비 중", job_seeking=False)
    needs = public.derive_needs({"age": age}, profile, today=TODAY)
    assert [need["id"] for need in needs] == expected
    assert profile.job_seeking is False
    assert public.monitoring_facts({"age": age}, profile).employment_preparation is False


def test_renting_current_home_does_not_prove_no_home_ownership():
    renter = public.monitoring_facts(MEMBER, MonitoringProfile(housing_tenure="renter"))
    owner = public.monitoring_facts(MEMBER, MonitoringProfile(housing_tenure="owner"))
    assert renter.home_ownership is None
    assert owner.home_ownership is True
    original = matching.build_facts(MEMBER, None)
    assert original.home_ownership is None and original.employment_preparation is None


def test_disaster_requires_personal_damage_and_keeps_stale_followup():
    for data in ({"disaster_type": "flood"},
                 {"disaster_damage": False, "disaster_occurred_on": "2026-10-01"}):
        assert public.derive_needs({}, MonitoringProfile(**data), today=TODAY) == []
    profile = MonitoringProfile(disaster_damage=True, disaster_type="flood",
                                disaster_occurred_on="2026-01-01")
    need = public.derive_needs({}, profile, today=TODAY)[0]
    assert need["id"] == "disaster_recovery" and "침수" in need["keywords"]
    assert any("현재도 복구" in question for question in need["questions"])
    assert "신청기한이 아니에요" in need["reason"]
    missing_date = MonitoringProfile(disaster_damage=True)
    needs = public.derive_needs({}, missing_date, today=TODAY)
    assert needs[0]["id"] == "disaster_recovery"
    assert any("발생한 날짜" in question for question in needs[0]["questions"])
    assert not any("재확인 기간이 지났" in question for question in needs[0]["questions"])
    assert missing_date.disaster_occurred_on is None


@pytest.mark.parametrize("region,expected", [
    ("서울", True), ("서울특별시 노원구", True), ("전국", False),
    (None, False), ("알 수 없는 지역", False),
])
def test_region_watch_requires_registered_region_but_does_not_infer_damage(region, expected):
    profile = MonitoringProfile()
    needs = public.derive_needs({"region": region}, profile, today=TODAY)
    assert bool(needs) is expected
    if needs:
        assert needs[0]["id"] == "disaster_watch"
        assert "피해를 판단하지" in needs[0]["reason"]
    assert profile.disaster_damage is None and profile.disaster_occurred_on is None
    assert profile.disaster_type is None


def test_declined_damage_removes_watch_and_confirmed_damage_uses_existing_recovery():
    member = {"region": "서울"}
    assert public.derive_needs(member, MonitoringProfile(disaster_damage=False), today=TODAY) == []
    profile = MonitoringProfile(disaster_damage=True, disaster_occurred_on="2026-10-01")
    needs = public.derive_needs(member, profile, today=TODAY)
    assert [need["id"] for need in needs] == ["disaster_recovery"]


def condition(*, key="age", identifier="age", value=None, operator="GTE", role="eligibility"):
    return CanonicalCondition(
        condition_id=identifier, field_key=key, source_field_key=key, subject="applicant",
        state_code=1, operator=operator, value=value or {"kind": "DECIMAL", "number": "19"},
        unit="YEARS" if key == "age" else None, reference_basis=None, role=role, group_id=None,
        source_field="text", evidence_quote="조건 검증", unknown_reason=None, review_note="")


def record(key, *, title="청년 일자리 공고", enabled=True, conditions=None, period="상시"):
    source = normalize_record({"document_id": key, "title": title,
                               "text": "조건 검증\n청년 일자리 안내", "application_period": period,
                               "source_url": "https://www.nowon.kr/notice/" + key})
    checks = conditions or [condition()]
    return {"revision_id": "revision-" + key, "policy_key": source.policy_key,
            "created_at": datetime(2026, 10, 6), "source_json": source.model_dump(),
            "canonical_json": {"policy_key": source.policy_key,
                               "region_snapshot_version": default_catalog().version,
                               "conditions": [check.model_dump() for check in checks],
                               "logic": {"op": "condition", "condition_id": checks[0].condition_id,
                                         "children": [], "reason": None},
                               "coverage": "complete", "unresolved": []},
            "review_status": "published", "matching_enabled": enabled,
            "draft_json": {}, "title": source.title, "category": "일자리"}


@pytest.fixture
def repository(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "monitoring-catalog.sqlite3"))
    metadata = MetaData()
    documents = Table("condition_documents", metadata,
                      Column("revision_id", String, primary_key=True), Column("policy_key", String),
                      Column("created_at", DateTime), Column("source_json", JSON),
                      Column("canonical_json", JSON), Column("review_status", String),
                      Column("matching_enabled", Boolean))
    details = Table("policy_revision_details", metadata,
                    Column("revision_id", String, primary_key=True), Column("draft_json", JSON),
                    Column("title", String), Column("category", String))
    metadata.create_all(engine)
    yield SimpleNamespace(engine=engine, tables={"condition_documents": documents,
                                                "policy_revision_details": details})
    engine.dispose()


def save(repository, rows):
    with repository.engine.begin() as connection:
        for table in repository.tables.values():
            connection.execute(insert(table), [{column.name: row[column.name]
                                               for column in table.columns} for row in rows])


def scan(repository, member=MEMBER, profile=None):
    profile = profile or MonitoringProfile()
    return public.scan_candidates(repository, member, profile,
                                  public.derive_needs(member, profile, today=TODAY), today=TODAY)


def test_scan_pages_entire_catalog_beyond_home_recommendation_limit(repository):
    save(repository, [record(f"page-{number:04}") for number in range(605)])
    candidates = scan(repository)
    assert len(candidates) == 605 and len({row["policy_id"] for row in candidates}) == 605


def test_latest_public_unknown_upcoming_and_proven_disabled_mismatch(repository):
    old = record("same")
    new = record("same", enabled=False)
    new.update(revision_id="new-revision", created_at=datetime(2026, 10, 7))
    mismatch = record("mismatch", enabled=False,
                      conditions=[condition(value={"kind": "DECIMAL", "number": "50"})])
    future = record("future", period="2026-11-01 ~ 2026-11-30")
    expired = record("expired", period="2026-01-01 ~ 2026-01-31")
    unknown = record("unknown", period="기간 확인 필요")
    draft = record("draft")
    draft["review_status"] = "draft"
    save(repository, [old, new, mismatch, future, expired, unknown, draft])
    candidates = {row["policy_id"].split(":")[-1]: row for row in scan(repository)}
    assert set(candidates) == {"same", "future", "unknown"}
    assert candidates["same"]["policy"]["revisionId"] == "new-revision"
    assert candidates["same"]["status"] == "needs_review"
    assert candidates["future"]["schedule_status"] == "upcoming"
    assert "접수 시작 전" in candidates["future"]["reason"]
    assert candidates["unknown"]["status"] == "needs_review"


def test_invalid_relevant_policy_aborts_scan_instead_of_returning_false_empty(repository):
    broken = record("broken")
    broken["canonical_json"]["conditions"][0]["evidence_quote"] = "없는 근거"
    save(repository, [broken])
    with pytest.raises(public.MonitoringScanIncomplete):
        scan(repository)


def test_future_period_in_eligibility_logic_does_not_drop_upcoming_candidate(repository):
    period = condition(key="application_period", identifier="period", operator="RANGE", value={
        "kind": "DATE_RANGE", "date_min": "2026-11-01", "date_max": "2026-11-30",
        "min_inclusive": True, "max_inclusive": True})
    notice = record("future-logic", conditions=[condition(), period])
    notice["canonical_json"]["logic"] = {
        "op": "all", "condition_id": None, "reason": None, "children": [
            {"op": "condition", "condition_id": key, "children": [], "reason": None}
            for key in ("age", "period")]}
    save(repository, [notice])
    candidates = scan(repository)
    assert len(candidates) == 1
    assert candidates[0]["schedule_status"] == "upcoming"
    assert candidates[0]["status"] == "needs_review"


def date_condition(identifier, start, end, *, role="eligibility"):
    return condition(key="application_period", identifier=identifier, operator="RANGE", role=role,
                     value={"kind": "DATE_RANGE", "date_min": start, "date_max": end,
                            "min_inclusive": True, "max_inclusive": True})


def periods_notice(key, operator, periods):
    notice = record(key, conditions=[condition(), *periods], period="기간 확인 필요")
    def leaf(identifier):
        return {"op": "condition", "condition_id": identifier, "children": [], "reason": None}

    notice["canonical_json"]["logic"] = {
        "op": "all", "condition_id": None, "reason": None, "children": [leaf("age"),
            {"op": operator, "condition_id": None, "reason": None,
             "children": [leaf(period.condition_id) for period in periods]}]}
    return notice


def test_past_or_current_period_keeps_current_branch_open(repository):
    old = date_condition("first", "2026-01-01", "2026-01-31")
    current = date_condition("second", "2026-10-01", "2026-10-31")
    save(repository, [periods_notice("two-rounds", "any", [old, current])])
    candidates = scan(repository)
    assert len(candidates) == 1
    assert candidates[0]["schedule_status"] == "open"
    assert candidates[0]["status"] == "potential_match"


def test_past_and_current_period_preserves_false_eligibility_logic(repository):
    old = date_condition("first", "2026-01-01", "2026-01-31")
    current = date_condition("second", "2026-10-01", "2026-10-31")
    save(repository, [periods_notice("both-required", "all", [old, current])])
    assert scan(repository) == []


@pytest.mark.parametrize("role", ["reference", "priority"])
def test_reference_or_priority_date_does_not_end_current_application(repository, role):
    old = date_condition("reference-date", "2026-01-01", "2026-01-31", role=role)
    save(repository, [record("reference-" + role, conditions=[condition(), old])])
    candidates = scan(repository)
    assert len(candidates) == 1
    assert candidates[0]["schedule_status"] == "open"
    assert candidates[0]["status"] == "potential_match"


def test_future_or_current_period_prioritizes_current_open_branch(repository):
    future = date_condition("future", "2026-11-01", "2026-11-30")
    current = date_condition("current", "2026-10-01", "2026-10-31")
    save(repository, [periods_notice("now-and-later", "any", [future, current])])
    candidates = scan(repository)
    assert len(candidates) == 1
    assert candidates[0]["schedule_status"] == "open"
    assert candidates[0]["status"] == "potential_match"
    assert "접수 시작 전" not in candidates[0]["reason"]


@pytest.mark.parametrize("operator,expected", [("any", True), ("all", False)])
def test_future_relaxation_does_not_make_past_and_future_conjunction_possible(
        repository, operator, expected):
    old = date_condition("past", "2026-01-01", "2026-01-31")
    future = date_condition("future", "2026-11-01", "2026-11-30")
    save(repository, [periods_notice("past-and-future", operator, [old, future])])
    candidates = scan(repository)
    assert bool(candidates) is expected
    if candidates:
        assert candidates[0]["schedule_status"] == "upcoming"
        assert candidates[0]["status"] == "needs_review"


def test_unlinked_multiple_application_periods_keep_ambiguous_relationship_visible(repository):
    old = date_condition("old", "2026-01-01", "2026-01-31", role="application")
    current = date_condition("current", "2026-10-01", "2026-10-31", role="application")
    save(repository, [record("unlinked-periods", conditions=[condition(), old, current])])
    candidates = scan(repository)
    assert len(candidates) == 1
    assert candidates[0]["schedule_status"] == "unknown"
    assert candidates[0]["status"] == "needs_review"
    assert any("신청 기간" in question for question in candidates[0]["questions"])


def test_explicit_home_owner_and_job_preparing_facts_compare_boolean_conditions():
    facts = public.monitoring_facts(MEMBER, MonitoringProfile(housing_tenure="owner",
                                                           job_seeking=True))
    for key in ("home_ownership", "employment_preparation_status"):
        check = condition(key=key, operator="EQ", value={"kind": "BOOLEAN", "boolean": True})
        assert matching.compare_condition(check, facts, default_catalog(), TODAY)[0] is True
    renter = public.monitoring_facts(MEMBER, MonitoringProfile(housing_tenure="renter"))
    check = condition(key="home_ownership", operator="EQ",
                      value={"kind": "BOOLEAN", "boolean": False})
    assert matching.compare_condition(check, renter, default_catalog(), TODAY)[0] is None


def test_cited_keywords_exclude_irrelevant_notices_and_budget_closed(repository):
    closed = record("closed")
    closed["source_json"]["fields"]["text"] += "\n예산 소진율: 100%"
    unrelated = record("unrelated", title="문화 공고")
    unrelated["source_json"]["fields"]["text"] = "조건 검증\n문화 공연 안내"
    relevant = record("relevant")
    save(repository, [closed, unrelated, relevant])
    candidates = scan(repository)
    assert len(candidates) == 1 and candidates[0]["policy_id"].endswith("relevant")
    assert candidates[0]["eligibility_decided"] is False
    assert candidates[0]["evidence"][0]["keyword"] in candidates[0]["evidence"][0]["quote"]
    assert "신청 자격을 확정" in candidates[0]["reason"]


def test_disaster_conditions_not_yet_represented_remain_review_candidates(repository):
    notice = record("flood", title="침수 피해 복구 지원")
    notice["source_json"]["fields"]["text"] = "조건 검증\n침수 피해 주민 복구 지원"
    save(repository, [notice])
    profile = MonitoringProfile(disaster_damage=True, disaster_type="flood",
                                disaster_occurred_on="2026-10-01")
    result = scan(repository, member={"age": 27}, profile=profile)
    disaster = next(candidate for candidate in result
                    if candidate["need_id"] == "disaster_recovery")
    assert disaster["status"] == "needs_review"
    assert any("피해 확인" in question for question in disaster["questions"])


def test_disaster_boilerplate_in_unrelated_notice_is_not_a_recovery_candidate(repository):
    notice = record("boilerplate", title="문화 프로그램 모집")
    notice["source_json"]["fields"]["text"] = "조건 검증\n재난 상황에서는 프로그램을 취소할 수 있음"
    save(repository, [notice])
    profile = MonitoringProfile(disaster_damage=True, disaster_type="flood",
                                disaster_occurred_on="2026-10-01")
    assert scan(repository, member={"age": None}, profile=profile) == []


def regional_condition(name, *, identifier="region", role="eligibility"):
    catalog = default_catalog()
    region = catalog.resolve(name, system="ADMIN").region
    if region is None:
        region = next((row for row in catalog.rows if row.system == "ADMIN" and row.name == name
                       and row.code.endswith("00000000") and row.active(catalog.as_of)), None)
    assert region is not None
    return condition(key="residence_region", identifier=identifier, role=role,
                     operator="EQ", value={
        "kind": "REGION", "system": "ADMIN", "code": region.code, "name": region.name,
        "snapshot_version": catalog.version, "include_descendants": True})


def regional_disaster_notice(key, *, region="서울특별시", role="eligibility"):
    restriction = regional_condition(region, role=role)
    notice = record(key, title="수해 피해 복구 지원", conditions=[condition(), restriction])
    notice["source_json"]["fields"]["text"] = (
        f"조건 검증\n{region} 거주 피해 주민의 수해 피해 복구 지원")
    if role == "eligibility":
        notice["canonical_json"]["logic"] = {
            "op": "all", "condition_id": None, "reason": None, "children": [
                {"op": "condition", "condition_id": key, "children": [], "reason": None}
                for key in ("age", "region")]}
    return notice


def test_local_disaster_notice_is_discovered_before_personal_damage_is_entered(repository):
    notice = regional_disaster_notice("local-relief")
    save(repository, [notice])
    profile = MonitoringProfile()
    candidates = scan(repository, profile=profile)
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate["need_id"] == "disaster_watch" and candidate["status"] == "needs_review"
    assert "공고를 발견했어요" in candidate["reason"]
    assert "새로 올라" not in candidate["reason"] and "재난이 발생" not in candidate["reason"]
    assert any("실제로" in question for question in candidate["questions"])
    assert any("발생일" in question for question in candidate["questions"])
    assert any(evidence["keyword"] == "서울특별시" for evidence in candidate["evidence"])
    assert profile.disaster_damage is None and profile.disaster_occurred_on is None
    assert profile.disaster_type is None and candidate["eligibility_decided"] is False
    assert scan(repository, profile=MonitoringProfile(disaster_damage=False)) == []
    recovery_profile = MonitoringProfile(disaster_damage=True)
    recovery = scan(repository, profile=recovery_profile)
    assert len(recovery) == 1 and recovery[0]["need_id"] == "disaster_recovery"
    assert recovery[0]["status"] == "needs_review"
    assert any("발생한 날짜" in question for question in recovery[0]["questions"])
    assert recovery_profile.disaster_occurred_on is None


def test_watch_requires_match_at_the_actual_geographic_precision(repository):
    save(repository, [regional_disaster_notice("dong-relief", region="서울특별시 노원구")])
    assert scan(repository) == []  # A province does not establish residence in this district.
    candidates = scan(repository, member={**MEMBER, "region": "서울특별시 노원구"})
    assert len(candidates) == 1 and candidates[0]["need_id"] == "disaster_watch"


@pytest.mark.parametrize("role", ["priority", "reference"])
def test_reference_and_priority_region_do_not_establish_local_relief_scope(repository, role):
    save(repository, [regional_disaster_notice("non-required-region", role=role)])
    assert scan(repository) == []


def test_national_unknown_and_nonmatching_region_notices_create_no_watch_candidates(repository):
    national = record("national", title="전국 재난 피해 복구 지원")
    national["source_json"]["fields"]["text"] = "조건 검증\n전국 재난 피해 주민 복구 지원"
    unknown = record("unknown-area", title="재난 피해 복구 지원")
    unknown["source_json"]["fields"]["text"] = "조건 검증\n재난 피해 주민 복구 지원"
    outside = regional_disaster_notice("outside", region="부산광역시")
    save(repository, [national, unknown, outside])
    assert scan(repository) == []


def test_negated_region_and_national_bypass_branch_do_not_establish_local_scope(repository):
    negated = regional_disaster_notice("not-busan", region="부산광역시")
    negated["canonical_json"]["logic"]["children"][1] = {
        "op": "not", "condition_id": None, "reason": None, "children": [
            {"op": "condition", "condition_id": "region", "children": [], "reason": None}]}
    bypass = regional_disaster_notice("regional-or-general")
    bypass["canonical_json"]["logic"]["op"] = "any"  # Age alone is a national bypass branch.
    save(repository, [negated, bypass])
    assert scan(repository) == []


def test_all_provinces_enumerated_in_or_remains_a_national_program(repository):
    catalog = default_catalog()
    provinces = [region.name for region in catalog.rows if region.system == "ADMIN"
                 and region.code.endswith("00000000") and region.active(catalog.as_of)]
    regions = [regional_condition(name, identifier=f"region-{index}")
               for index, name in enumerate(provinces)]
    notice = record("all-provinces", title="재난 피해 복구 지원",
                    conditions=[condition(), *regions])
    notice["source_json"]["fields"]["text"] = "조건 검증\n재난 피해 주민 복구 지원"
    notice["canonical_json"]["logic"] = {
        "op": "all", "condition_id": None, "reason": None, "children": [
            {"op": "condition", "condition_id": "age", "children": [], "reason": None},
            {"op": "any", "condition_id": None, "reason": None, "children": [
                {"op": "condition", "condition_id": region.condition_id,
                 "children": [], "reason": None} for region in regions]}]}
    save(repository, [notice])
    assert scan(repository) == []


def test_disaster_prevention_boilerplate_is_not_a_relief_watch_candidate(repository):
    notice = regional_disaster_notice("prevention")
    notice["source_json"]["title"] = "재난 예방 문화 프로그램"
    notice["source_json"]["fields"]["text"] = "조건 검증\n재난 상황에서는 프로그램을 취소함"
    save(repository, [notice])
    assert scan(repository) == []


def test_general_subsidy_near_disaster_cancellation_is_not_disaster_relief(repository):
    notice = regional_disaster_notice("culture-subsidy")
    notice["source_json"]["title"] = "서울 문화 활동 지원금"
    notice["source_json"]["fields"]["text"] = (
        "조건 검증\n서울 문화 활동 지원금. 재난 발생/피해 시 행사는 취소됩니다.")
    save(repository, [notice])
    assert scan(repository) == []


def test_local_upcoming_eligibility_branch_remains_a_watch_candidate(repository):
    notice = regional_disaster_notice("upcoming-relief")
    future = date_condition("future", "2026-11-01", "2026-11-30")
    notice["canonical_json"]["conditions"].append(future.model_dump())
    notice["canonical_json"]["logic"]["children"].append({
        "op": "condition", "condition_id": "future", "children": [], "reason": None})
    save(repository, [notice])
    candidates = scan(repository)
    assert len(candidates) == 1 and candidates[0]["need_id"] == "disaster_watch"
    assert candidates[0]["schedule_status"] == "upcoming"
    assert candidates[0]["status"] == "needs_review"


def test_fingerprint_ignores_revision_date_and_whitespace_but_tracks_semantic_change(repository):
    notice = record("stable")
    save(repository, [notice])
    original = scan(repository)[0]["fingerprint"]
    new = deepcopy(notice)
    new.update(revision_id="second", created_at=datetime(2026, 10, 7))
    new["source_json"]["title"] = "청년   일자리 공고"
    save(repository, [new])
    assert scan(repository)[0]["fingerprint"] == original
    changed = deepcopy(new)
    changed.update(revision_id="third", created_at=datetime(2026, 10, 8))
    changed["source_json"]["fields"]["application_period"] = "2026-10-01 ~ 2026-10-30"
    save(repository, [changed])
    assert scan(repository)[0]["fingerprint"] != original
