"""Successive public notices are one opportunity, never three new applications."""

from copy import deepcopy
from datetime import datetime
from uuid import uuid4

import pytest

from app.modules.assistant import dialogue_search
from app.modules.matching import public as matching
from app.modules.monitoring import public as monitoring
from app.modules.monitoring.models import MonitoringProfile
from app.modules.monitoring.storage import filter_snapshot_gender
from app.modules.storage.notice_series import annotate_records, group_records
from tests import test_assistant_dialogue as dialogue_tests
from tests import test_matching as matching_tests
from tests import test_monitoring_storage as storage_tests

repository = dialogue_tests.repository
stable_date = dialogue_tests.stable_date
store = storage_tests.store
TODAY = dialogue_tests.TODAY
MEMBER = {**dialogue_tests.MEMBER, "gender": "undisclosed"}
NEED = {"id": "employment_support", "title": "장학금 지원 찾기", "keywords": ["장학금"],
        "reason": "장학금 탐색", "questions": []}


def notice(key, action, *, day="2026-05-21", year=2026, semester=2, organization="광운대학교",
           conditions=None, text="조건 검증\n지원대상: 국민 누구나 신청 가능", title=None,
           period="상시"):
    title = title or f"[등록/장학] {year}학년도 {semester}학기 국가근로장학금(사업) {action}"
    row = matching_tests.record(conditions or [matching_tests.condition(state=0)], key=key,
                                title=title, category="일자리", text=text, period=period)
    row["revision_id"] = str(uuid4())
    row["created_at"] = datetime.fromisoformat(day)
    row["source_json"]["organization"] = organization
    row["source_json"]["fields"]["published_date"] = day
    return row


def home(repository, *, member=MEMBER, feedback=(), limit=3):
    return matching.recommend(repository, matching.build_facts(member, None), today=TODAY,
                              feedback=feedback, limit=limit)["items"]


def general(repository, *, member=MEMBER, feedback=(), query="국가근로장학금"):
    plan = dialogue_search.prepare_search(query, repository)
    return dialogue_search.general_candidates(repository, plan, member, MonitoringProfile(),
                                              feedback=feedback)


def scan(repository, *, member=MEMBER):
    return monitoring.scan_candidates(repository, member, MonitoringProfile(), [NEED], today=TODAY)


@pytest.mark.parametrize("action", [
    "장학생 선발 확정 안내", "신청자 대상 희망근로기관(근로지) 신청 안내",
    "선발자 대상 서류 제출 안내",
])
def test_result_and_existing_applicant_steps_are_not_new_applications(repository, action):
    repository.save(notice("not-application", action))
    assert home(repository) == []
    assert general(repository) == []
    assert scan(repository) == []


def test_latest_result_closes_prior_application_in_all_recommendation_paths(repository):
    application = notice("application", "학생 신청기간 안내")
    followup = notice("followup", "신청자 대상 희망근로기관(근로지) 신청 안내", day="2026-08-06")
    result = notice("result", "장학생 선발 확정 안내", day="2026-08-25")
    repository.save(application, followup, result)
    assert home(repository) == []
    assert general(repository) == []
    assert scan(repository) == []
    assert repository.get_revision(result["revision_id"]) is not None
    assert repository.get_revision(application["revision_id"]) is not None


@pytest.mark.parametrize("method", [home, general, scan])
def test_duplicate_application_cards_group_with_full_followup_links(repository, method):
    first = notice("first", "학생 신청기간 안내")
    reminder = notice("reminder", "학생 신청기간 안내", day="2026-05-25")
    followup = notice("followup", "신청자 대상 희망근로기관(근로지) 신청 안내", day="2026-08-06")
    repository.save(first, reminder, followup)
    candidates = method(repository)
    assert len(candidates) == 1
    assert candidates[0]["policy"]["id"] == reminder["policy_key"]
    group = candidates[0]["policy"]["noticeGroup"]
    assert group["noticeCount"] == 3 and group["latestStage"] == "followup"
    assert {item["id"] for item in group["notices"]} == {
        first["policy_key"], reminder["policy_key"], followup["policy_key"]}


@pytest.mark.parametrize("method", [home, general, scan])
def test_different_institution_year_and_semester_remain_distinct(repository, method):
    rows = [notice("base", "학생 신청기간 안내"),
            notice("institution", "학생 신청기간 안내", organization="다른대학교"),
            notice("year", "학생 신청기간 안내", year=2025),
            notice("semester", "학생 신청기간 안내", semester=1)]
    repository.save(*rows)
    assert len(method(repository)) == (3 if method == home else 4)


@pytest.mark.parametrize("method", [home, general, scan])
def test_group_representative_chosen_after_known_eligibility_checks(repository, method):
    eligible = notice("eligible", "학생 신청기간 안내", conditions=[matching_tests.condition()])
    wrong_age = notice("wrong-age", "학생 신청기간 안내", day="2026-05-25", conditions=[
        matching_tests.condition(operator="GTE", value={"kind": "DECIMAL", "number": "65"})])
    repository.save(eligible, wrong_age)
    candidates = method(repository)
    assert len(candidates) == 1 and candidates[0]["policy"]["id"] == eligible["policy_key"]
    assert candidates[0]["policy"]["noticeGroup"]["noticeCount"] == 2


@pytest.mark.parametrize("action", ["추가 모집 안내", "신규 장학생 선발 안내"])
@pytest.mark.parametrize("method", [home, general, scan])
def test_real_new_recruitment_is_retained(repository, action, method):
    row = notice("new", action)
    row["source_json"]["fields"]["text"] += "\n선발 결과는 추후 안내합니다."
    repository.save(row)
    assert len(method(repository)) == 1


@pytest.mark.parametrize("method", [home, general])
def test_group_exclusions_are_personal_and_do_not_consume_result_limit(repository, method):
    first = notice("first", "학생 신청기간 안내")
    reminder = notice("reminder", "학생 신청기간 안내", day="2026-05-25")
    other = notice("other", "학생 신청기간 안내", semester=1)
    repository.save(first, reminder, other)
    feedback = [{"policy_id": first["policy_key"], "reason": "not_eligible"}]
    candidates = method(repository, feedback=feedback)
    assert [item["policy"]["id"] for item in candidates] == [other["policy_key"]]
    assert len(method(repository, member={**MEMBER, "id": "other-account"})) == 2


@pytest.mark.parametrize("method", [home, general])
def test_duplicate_groups_do_not_consume_display_limit(repository, method):
    duplicate_rows = [notice(f"duplicate-{index:02}", "학생 신청기간 안내")
                      for index in range(15)]
    other = [notice(f"year-{year}", "학생 신청기간 안내", year=year)
             for year in range(2010, 2023)]
    repository.save(*duplicate_rows, *other)
    result = method(repository)
    assert len(result) == (3 if method == home else 12)
    groups = [item["policy"].get("noticeGroup", {}).get("id", item["policy"]["id"])
              for item in result]
    assert len(groups) == len(set(groups))


def test_result_read_before_home_comparison_budget_even_if_ingested_earlier(
        repository, monkeypatch):
    application = notice("application", "학생 신청기간 안내")
    application["created_at"] = datetime(2026, 10, 6)
    result = notice("result", "장학생 선발 확정 안내", day="2026-08-25")
    repository.save(application, result)
    monkeypatch.setattr(matching, "MAX_CANDIDATES", 1)
    assert home(repository) == []


@pytest.mark.parametrize("method", [home, general, scan])
def test_a_genuine_later_new_application_reopens_same_cycle(repository, method):
    result = notice("result", "장학생 선발 확정 안내", day="2026-08-25")
    fresh = notice("fresh", "신규 장학생 선발 안내", day="2026-09-01")
    repository.save(result, fresh)
    assert [item["policy"]["id"] for item in method(repository)] == [fresh["policy_key"]]


@pytest.mark.parametrize("method", [home, general, scan])
def test_same_official_page_alias_updated_to_result_cannot_restore_old_application(
        repository, method):
    old = notice("old-alias", "학생 신청기간 안내")
    current = notice("current-alias", "장학생 선발 확정 안내", day="2026-08-25")
    old["source_json"]["source_url"] = "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=4242"
    current["source_json"]["source_url"] = (
        "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=4242&category=1")
    repository.save(old, current)
    assert method(repository) == []


@pytest.mark.parametrize("method", [home, general, scan])
def test_filtering_named_round_result_does_not_reassign_ambiguous_application_round(
        repository, method):
    first_round = notice("first-round", "1차 학생 신청기간 안내")
    second_round_result = notice("second-round-result", "2차 장학생 선발 확정 안내",
                                 day="2026-08-25")
    unspecified = notice("unspecified-round", "학생 신청기간 안내")
    repository.save(first_round, second_round_result, unspecified)
    assert {item["policy"]["id"] for item in method(repository)} == {
        first_round["policy_key"], unspecified["policy_key"]}


@pytest.mark.parametrize("method", [home, general, scan])
def test_explicit_national_foundation_prefix_result_closes_original_mentoring_application(
        repository, method):
    original = notice("mentoring-application", "", title=(
        "[등록/장학] [한국장학재단] 2026년도 대학생 청소년교육지원장학금(사업) 신청 안내"))
    result = notice("mentoring-result", "", day="2026-08-25", title=(
        "[등록/장학] 2026년도 대학생 청소년교육지원장학금(사업) 장학생 선발 결과 안내"))
    repository.save(original, result)
    candidates = (method(repository, query="대학생 청소년교육지원장학금")
                  if method == general else method(repository))
    assert candidates == []
    assert repository.get_revision(original["revision_id"]) is not None
    assert repository.get_revision(result["revision_id"]) is not None


@pytest.mark.parametrize("method", [home, general, scan])
@pytest.mark.parametrize("original_end", ["2026-10-06", "2026-10-10"])
@pytest.mark.parametrize("titles,query", [
    (("[등록/장학] 2026년 국가우수장학금(인문100년,예술체육비전) "
      "일시지원(한학기지원) 장학생 추천자 선발 안내",
      "[등록/장학] 2026년 국가우수장학금(인문100년,예술체육비전) "
      "일시지원(한학기지원) 장학생 추천자 선발 안내(기간연장)"), "국가우수장학금"),
    (("[등록/장학] 2026년 2학기 농림축산식품부 청년창업농장학생 모집 안내",
      "[등록/장학] 2026년 2학기 농림축산식품부 청년창업농장학금 신청 안내[기간연장]"),
     "청년창업농장학금"),
])
def test_real_extension_is_one_application_with_the_new_official_deadline(
        repository, method, original_end, titles, query):
    text = "조건 검증\n지원대상: 국민 누구나 신청 가능\n" + query
    original = notice("original-deadline", "", title=titles[0], text=text, day="2026-09-01",
                      period=f"2026-09-01 ~ {original_end}")
    extended = notice("extended-deadline", "", title=titles[1], text=text, day="2026-10-02",
                      period="2026-09-01 ~ 2026-10-20")
    extended["source_json"]["fields"]["text"] += (
        "\n신청자격, 제출서류 및 심사기준은 기존 선발 공고와 동일합니다.")
    repository.save(original, extended)
    candidates = method(repository, query=query) if method == general else method(repository)
    assert len(candidates) == 1
    policy = candidates[0]["policy"]
    assert policy["id"] == extended["policy_key"]
    assert policy["applicationEnd"] == "2026-10-20"
    assert policy["noticeGroup"]["noticeCount"] == 2
    assert {item["id"] for item in policy["noticeGroup"]["notices"]} == {
        original["policy_key"], extended["policy_key"]}


@pytest.mark.parametrize("method", [home, general, scan])
def test_payment_installments_are_one_followup_and_keep_two_real_application_rounds(
        repository, method):
    applications = [notice(f"application-{round_number}", "", day=f"2026-09-0{round_number}",
                           title=("[등록/장학] 2026학년도 1학기 국가장학금 "
                                  f"{round_number}차 신청 안내"))
                    for round_number in (1, 2)]
    payments = [notice(f"payment-{round_number}", "", day=f"2026-09-0{round_number + 2}",
                       title=("[등록/장학] 2026학년도 1학기 국가장학금 지급 (예정)안내"
                              f"({round_number}차{'-최종' if round_number == 4 else ''})"))
                for round_number in (1, 2, 3, 4)]
    repository.save(*applications, *payments)
    candidates = (method(repository, query="국가장학금")
                  if method == general else method(repository))
    assert {item["policy"]["id"] for item in candidates} == {
        row["policy_key"] for row in applications}
    grouped = group_records(annotate_records([*applications, *payments]))
    payment_groups = [row["_notice_group"] for row in grouped
                      if (row.get("_notice_group") or {}).get("noticeCount") == 4]
    assert len(payment_groups) == 1
    assert payment_groups[0]["latestStage"] == "followup"
    assert {row["id"] for row in payment_groups[0]["notices"]} == {
        row["policy_key"] for row in payments}


@pytest.mark.parametrize("method", [home, general, scan])
def test_same_foundation_real_tuition_and_living_cost_benefits_remain_separate(repository, method):
    tuition = notice("foundation-tuition", "", title=(
        "[등록/장학] (재)심명문화재단 2026학년도 장학생 신청 안내"))
    living = notice("foundation-living", "", day="2026-08-04", title=(
        "[등록/장학] 2026학년도 재단법인 심명문화재단 장학생 추가 선발 안내"))
    tuition["source_json"]["fields"]["benefits"] = "등록금성 장학금"
    living["source_json"]["fields"]["benefits"] = "생활비성 장학금"
    repository.save(tuition, living)
    candidates = (method(repository, query="심명문화재단")
                  if method == general else method(repository))
    assert {item["policy"]["id"] for item in candidates} == {
        tuition["policy_key"], living["policy_key"]}
    assert {item["policy"]["benefit"] for item in candidates} == {
        "등록금성 장학금", "생활비성 장학금"}


def _legacy_candidate(row):
    return {"need_id": NEED["id"], "policy_id": row["policy_key"],
            "policy": {"id": row["policy_key"], "revisionId": row["revision_id"],
                       "title": row["title"], "category": "일자리"},
            "status": "needs_review", "reason": "저장된 과거 추천", "questions": [],
            "fingerprint": row["revision_id"].replace("-", "") * 2}


@pytest.mark.parametrize("progressed", [False, True])
def test_saved_candidate_and_unread_alert_recheck_latest_result_read_only(
        repository, store, progressed):
    application = notice("application", "학생 신청기간 안내")
    repository.save(application, notice("result", "장학생 선발 확정 안내", day="2026-08-25"))
    storage_tests.saved(store)
    prior = store.read(storage_tests.ACCOUNT)
    store.record_scan(storage_tests.ACCOUNT, [NEED], [_legacy_candidate(application)],
                      expected_version=prior["version"])
    if progressed:
        store.set_candidate_state(storage_tests.ACCOUNT, application["policy_key"],
                                  NEED["id"], "preparing")
    before = deepcopy(store.read(storage_tests.ACCOUNT))
    member = {**MEMBER, "id": storage_tests.ACCOUNT}
    result = filter_snapshot_gender(before, member, repository, store=store)
    assert result["alerts"] == [] and result["unread_count"] == 0
    assert not any(item["active"] for item in result["candidates"])
    assert len(result["candidates"]) == int(progressed)
    if progressed:
        assert result["candidates"][0]["application_state"] == "preparing"
    assert store.read(storage_tests.ACCOUNT) == before


def test_unavailable_source_still_withholds_cached_explicit_result_notice(store):
    row = notice("legacy-result", "장학생 선발 확정 안내")
    storage_tests.saved(store)
    prior = store.read(storage_tests.ACCOUNT)
    store.record_scan(storage_tests.ACCOUNT, [NEED], [_legacy_candidate(row)],
                      expected_version=prior["version"])
    member = {**MEMBER, "id": storage_tests.ACCOUNT}
    result = filter_snapshot_gender(store.read(storage_tests.ACCOUNT), member, None, store=store)
    assert result["candidates"] == [] and result["alerts"] == []
    assert result["unread_count"] == 0


def test_saved_duplicate_cards_and_alerts_collapse_without_changing_other_accounts(
        repository, store):
    rows = [notice("first", "학생 신청기간 안내"),
            notice("second", "학생 신청기간 안내", day="2026-05-25")]
    repository.save(*rows)
    for account in (storage_tests.ACCOUNT, storage_tests.OTHER):
        storage_tests.saved(store, account)
        prior = store.read(account)
        store.record_scan(account, [NEED], [_legacy_candidate(row) for row in rows],
                          expected_version=prior["version"])
    other = deepcopy(store.read(storage_tests.OTHER))
    member = {**MEMBER, "id": storage_tests.ACCOUNT}
    result = filter_snapshot_gender(store.read(storage_tests.ACCOUNT), member, repository,
                                    store=store)
    assert len(result["candidates"]) == 1 and len(result["alerts"]) == 1
    assert result["unread_count"] == 1
    assert result["candidates"][0]["policy_id"] == rows[1]["policy_key"]
    assert result["candidates"][0]["policy"]["noticeGroup"]["noticeCount"] == 2
    assert store.read(storage_tests.OTHER) == other


def test_worker_scan_respects_older_group_feedback_and_preserves_undo(repository, store):
    first = notice("first", "학생 신청기간 안내")
    reminder = notice("reminder", "학생 신청기간 안내", day="2026-05-25")
    repository.save(first, reminder)
    storage_tests.saved(store)
    before = store.read(storage_tests.ACCOUNT)
    store.record_scan(storage_tests.ACCOUNT, [NEED], [_legacy_candidate(first)],
                      expected_version=before["version"])
    rejected = store.set_candidate_feedback(storage_tests.ACCOUNT, first["policy_key"],
                                            NEED["id"], "not_interested")
    found = scan(repository)
    result = store.record_scan(storage_tests.ACCOUNT, [NEED], found,
                               expected_version=rejected["version"])
    assert not any(item["active"] for item in result["candidates"])
    assert result["recommendation_feedback"][0]["policy_id"] == first["policy_key"]
    restored = store.set_candidate_feedback(storage_tests.ACCOUNT, first["policy_key"],
                                            NEED["id"], None)
    result = store.record_scan(storage_tests.ACCOUNT, [NEED], found,
                               expected_version=restored["version"])
    assert len(result["candidates"]) == 1 and result["candidates"][0]["active"]
