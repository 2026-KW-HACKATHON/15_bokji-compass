"""Behavioral smart-search acceptance cases; no model calls or production data writes."""

import re
from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    create_engine,
    event,
    insert,
    update,
)
from sqlalchemy.pool import StaticPool

from app.api.policies import get_repository
from app.core.config import Settings
from app.main import create_app
from app.modules.ingestion import models
from app.modules.storage import catalog

RELATIONS = {
    "publisher", "target", "contextual", "student_general", "mention", "benefit", "literal",
}
EVIDENCE_FIELDS = {
    "title", "organization", "text", "purpose_summary", "eligibility", "selection", "benefits",
    "_editor_summary", "_editor_benefits", "_editor_region", "_editor_age", "_editor_gender",
    "_editor_other",
}


@pytest.fixture
def repository():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def register_mysql_functions(connection, _):
        connection.create_function("json_unquote", 1, lambda value: value)
        connection.create_function("concat", -1, lambda *values: "".join(map(str, values)))
        connection.create_function("regexp", 2,
                                   lambda pattern, value: bool(re.search(pattern, value or "")))

    metadata = MetaData()
    documents = Table("condition_documents", metadata,
        Column("revision_id", String, primary_key=True),
        Column("policy_key", String, nullable=False),
        Column("created_at", DateTime, nullable=False),
        Column("source_json", JSON, nullable=False),
        Column("review_status", String, nullable=False))
    details = Table("policy_revision_details", metadata,
        Column("revision_id", String, primary_key=True),
        Column("draft_json", JSON, nullable=False),
        Column("title", String, nullable=False), Column("category", String))
    metadata.create_all(engine)
    yield SimpleNamespace(engine=engine, sources={}, tables={
        "condition_documents": documents, "policy_revision_details": details})
    engine.dispose()


def add_notice(repository, key, *, title, organization="광운대학교", fields=None,
               category="교육", day=1, revision=None, published=True, region="전국"):
    source = {"title": title, "organization": organization,
        "source_url": ("https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=53017"
                       if organization == "광운대학교" else "https://example.org/notice"),
        "fields": {"application_period": "2026-10-01 ~ 2026-10-31", **(fields or {})}}
    revision = revision or key + "-revision"
    with repository.engine.begin() as connection:
        connection.execute(insert(repository.tables["condition_documents"]).values(
            revision_id=revision, policy_key=key, created_at=datetime(2026, 10, day),
            source_json=source, review_status="published" if published else "draft"))
        connection.execute(insert(repository.tables["policy_revision_details"]).values(
            revision_id=revision, title=title, category=category, draft_json={"overview": {
                "region_conditions": {"status": "unrestricted" if region == "전국" else
                    "specified", "text": region},
                "age_conditions": {"status": "specified", "text": "청년"}}}))
    if published:
        repository.sources[revision] = source


def add_views(repository, key, views):
    models.records.create(repository.engine, checkfirst=True)
    with repository.engine.begin() as connection:
        connection.execute(insert(models.records).values(policy_key=key, provider="gov24",
            external_id=key, listing_json={"조회수": views}, last_seen_at=1, next_check_at=0))


@pytest.fixture
def paired_catalog(repository):
    # Same publisher, different eligibility: reposting is not school affiliation.
    add_notice(repository, "publisher-repost", title="[등록/장학] 논산대학교 장학금 안내",
        fields={"text": "외부 기관의 공고를 안내합니다.",
                "eligibility": "논산대학교 재학생만 신청 가능", "benefits": "등록금 장학금"})
    add_notice(repository, "target-external", title="대학 협력 학업 지원금",
        organization="서울시", fields={"eligibility": "광운대학교 재학생 대상",
            "benefits": "등록금 장학금 100만원 지급. 근로 의무 없음. 상환 의무 없음."})
    add_notice(repository, "context-internal", title="화도 및 동해장학금 신청 안내",
        fields={"text": "우리대학 재학생 대상 등록금 지원. KLAS 장학조회에서 신청합니다.",
                "benefits": "등록금 장학금 지급"})
    add_notice(repository, "national-college", title="국가장학금 대학생 학비 지원",
        organization="한국장학재단", fields={"eligibility": "국내 대학교 재학생 대상",
            "benefits": "등록금 장학금 지급. 일을 하지 않아도 되며 갚을 필요가 없습니다."})
    add_notice(repository, "other-school", title="서강대학교 교내 장학금",
        organization="서강대학교", fields={"eligibility": "서강대학교 재학생만 신청 가능",
            "benefits": "등록금 지원"})
    add_notice(repository, "quoted-other-school", title="[외부 공고] 서강대학교 장학 안내",
        fields={"text": "서강대학교 공고를 전재합니다. 우리대학 재학생을 대상으로 합니다.",
            "eligibility": "서강대학교 재학생만 신청 가능", "benefits": "등록금 장학금 지급"})
    add_notice(repository, "work-required", title="국가근로장학금 신청",
        fields={"text": "우리대학 재학생은 KLAS에서 국가근로장학금을 신청합니다.",
            "benefits": "근로시간에 따른 장학금 지급. 근로 참여가 필수입니다."})
    add_notice(repository, "repayable-loan", title="대학생 학자금 대출",
        organization="한국장학재단", fields={"eligibility": "국내 대학교 재학생 대상",
            "benefits": "등록금 대출 지원. 졸업 후 원금과 이자를 상환해야 합니다."})
    add_notice(repository, "contact-only", title="지역 주민 진로 상담",
        organization="서울시", category="일자리", fields={"eligibility": "지역 일반 주민",
            "benefits": "무료 상담", "contact": "광운대학교 학생복지팀",
            "application_url": "https://example.org/광운대학교"})
    add_notice(repository, "body-contact-only", title="구민 진로 상담 행사",
        organization="서울시", category="일자리", fields={"eligibility": "지역 일반 주민",
            "text": "무료 상담 안내. 문의처: 광운대학교 학생복지팀 02-940-5033"})
    add_notice(repository, "job-only", title="등록금 마련을 위한 아르바이트 모집",
        category="일자리", fields={"benefits": "시간당 급여 지급. 근로 참여 필수"})
    return repository


def ids(result):
    return [item["id"] for item in result["items"]]


def by_id(result):
    return {item["id"]: item for item in result["items"]}


def assert_grounded(repository, item):
    match = item["searchMatch"]
    assert match["relations"] and set(match["relations"]) <= RELATIONS
    assert isinstance(match["reason"], str) and match["reason"].strip()
    assert 1 <= len(match["evidence"]) <= 3
    source = repository.sources[item["revisionId"]]
    for evidence in match["evidence"]:
        assert evidence["field"] in EVIDENCE_FIELDS
        original = (source.get(evidence["field"]) or
                    source["fields"].get(evidence["field"]) or "")
        assert isinstance(evidence["quote"], str) and 0 < len(evidence["quote"]) <= 250
        assert evidence["quote"] in original


@pytest.mark.parametrize("query", [
    "광운대에서 올린 장학 공고 좀 보여줘",
    "음 광운대학교가 올린 장학금 찾아줘요",
    "광운대 공고 중에 장학 관련된 거 찾고 싶어",
])
def test_spoken_publisher_requests_do_not_require_school_eligibility(paired_catalog, query):
    result = catalog.list_policies(paired_catalog, q=query)
    found = by_id(result)
    assert "publisher-repost" in found
    assert "target-external" not in found and "national-college" not in found
    assert "publisher" in found["publisher-repost"]["searchMatch"]["relations"]
    assert result["search"]["mode"] == "smart"
    assert result["search"]["originalQuery"] == query
    for item in result["items"]:
        assert_grounded(paired_catalog, item)


@pytest.mark.parametrize("query", [
    "광운대생 받을 돈",
    "광운대학교 학생한테 학비 보태주는 지원 찾아줘",
    "광운대 다니는데 등록금 지원되는거 있나",
    "광운대 학생 대상 장학금 좀 찾아주라",
])
def test_spoken_student_requests_search_targets_and_general_aid(paired_catalog, query):
    found = by_id(catalog.list_policies(paired_catalog, q=query))
    assert {"target-external", "context-internal", "national-college"} <= found.keys()
    assert not {"publisher-repost", "other-school", "quoted-other-school", "contact-only",
                "body-contact-only", "job-only"} & found.keys()
    assert "target" in found["target-external"]["searchMatch"]["relations"]
    assert "contextual" in found["context-internal"]["searchMatch"]["relations"]
    assert "student_general" in found["national-college"]["searchMatch"]["relations"]
    for item in found.values():
        assert_grounded(paired_catalog, item)


@pytest.mark.parametrize("query", [
    "광은대 학생 장학금", "kwangwoon 학생 학비 지원", "광운 대 학생 장학",
])
def test_known_university_typo_alias_and_spacing_keep_target_intent(paired_catalog, query):
    result = catalog.list_policies(paired_catalog, q=query)
    found = by_id(result)
    assert {"target-external", "context-internal", "national-college"} <= found.keys()
    assert "other-school" not in found and "publisher-repost" not in found
    if query.startswith("광은대"):
        assert any(correction["from"] == "광은대" and "광운" in correction["to"]
                   for correction in result["search"]["corrections"])


@pytest.mark.parametrize("query", [
    "서울시가 올린 광운대 학생 장학금",
    "광운대생 받을 학비 중 서울시에서 올린 거",
])
def test_publisher_and_affiliation_constraints_keep_separate_roles(repository, query):
    for key, organization, eligibility in [
        ("city-school", "서울시", "광운대학교 재학생 대상"),
        ("city-general", "서울시", "전국 대학교 재학생 대상"),
        ("city-other", "서울시", "서강대학교 재학생만 신청 가능"),
        ("school-only", "광운대학교", "광운대학교 재학생 대상"),
        ("other-publisher", "인천시", "광운대학교 재학생 대상"),
    ]:
        add_notice(repository, key, title="대학생 학비 장학금 지원", organization=organization,
            fields={"eligibility": eligibility, "benefits": "등록금 장학금 지급"})
    result = catalog.list_policies(repository, q=query)
    assert set(ids(result)) == {"city-school", "city-general"}
    found = by_id(result)
    assert {"publisher", "target"} <= set(found["city-school"]["searchMatch"]["relations"])
    assert {"publisher", "student_general"} <= set(
        found["city-general"]["searchMatch"]["relations"])
    for item in result["items"]:
        assert_grounded(repository, item)


def test_same_role_school_alternatives_are_unioned(paired_catalog):
    result = catalog.list_policies(paired_catalog, q="광운대나 서강대 학생 장학금")
    assert {"target-external", "other-school", "national-college"} <= set(ids(result))
    for item in result["items"]:
        assert_grounded(paired_catalog, item)


def test_school_negation_does_not_become_a_positive_alternative(paired_catalog):
    result = catalog.list_policies(paired_catalog, q="광운대 말고 서강대 학생 장학금")
    assert "other-school" in ids(result)
    assert not {"target-external", "context-internal", "work-required"} & set(ids(result))
    for item in result["items"]:
        assert_grounded(paired_catalog, item)


@pytest.mark.parametrize("query", [
    "알바말고 등록금 도와주는거",
    "광운대 학생 장학금 근로 말고",
    "일해야 받는 돈 빼고 학비 지원 찾아줘",
    "근로 없이 대학생 등록금",
    "일 안해도 받을 수 있는 돈",
])
def test_negative_work_requirement_is_not_lost_or_inverted(paired_catalog, query):
    found = by_id(catalog.list_policies(paired_catalog, q=query))
    assert {"target-external", "national-college"} <= found.keys()
    assert "work-required" not in found and "job-only" not in found


def test_exclusion_only_request_finds_financial_support_without_work(paired_catalog):
    result = catalog.list_policies(paired_catalog, q="알바 말고")
    assert {"target-external", "context-internal", "national-college"} <= set(ids(result))
    assert not {"work-required", "job-only", "contact-only", "body-contact-only"} & set(ids(result))
    for item in result["items"]:
        assert_grounded(paired_catalog, item)


@pytest.mark.parametrize("query", [
    "등록금 지원인데 갚기 싫어", "돌려줘야 하는 돈 말고 대학생 학비 지원",
    "광운대생 장학금 대출 말고",
    "갚지 않아도 되는 학비",
])
def test_repayment_exclusion_keeps_grants_and_rejects_loans(paired_catalog, query):
    found = by_id(catalog.list_policies(paired_catalog, q=query))
    assert {"target-external", "national-college"} <= found.keys()
    assert "repayable-loan" not in found


def test_bare_institution_preserves_ambiguity_with_grounded_relation_facets(paired_catalog):
    result = catalog.list_policies(paired_catalog, q="광운대")
    found = by_id(result)
    assert {"publisher-repost", "target-external", "context-internal"} <= found.keys()
    assert "contact-only" not in found
    assert "publisher" in found["publisher-repost"]["searchMatch"]["relations"]
    assert "target" in found["target-external"]["searchMatch"]["relations"]
    alternatives = result["search"]["alternatives"]
    assert {item["scope"] for item in alternatives} >= {"organization", "content"}
    for alternative in alternatives:
        assert alternative["scope"] in {"all", "organization", "content"}
        assert isinstance(alternative["label"], str) and alternative["label"]
        assert type(alternative["count"]) is int and alternative["count"] >= 0


@pytest.mark.parametrize("query", ["광운대", "광운대 장학금 관련 공고 좀 찾아줘"])
def test_smart_relation_facets_round_trip_without_becoming_literal_scopes(paired_catalog, query):
    all_results = catalog.list_policies(paired_catalog, q=query)
    facets = {item["scope"]: item for item in all_results["search"]["alternatives"]}
    assert {"organization", "content"} <= facets.keys()
    for scope, relation in [("organization", "publisher"), ("content", "related")]:
        listing = catalog.list_policies(paired_catalog, q=query, search_relation=relation)
        calendar = catalog.list_calendar(paired_catalog, q=query, search_relation=relation,
            month="2026-10")
        assert listing["search"]["mode"] == calendar["search"]["mode"] == "smart"
        assert listing["total"] == calendar["total"] == facets[scope]["count"]
        assert set(ids(listing)) == set(ids(calendar))
        assert not {"contact-only", "body-contact-only"} & set(ids(listing))
        if relation == "publisher":
            assert "publisher-repost" in ids(listing)
            assert "target-external" not in ids(listing)
            assert all(item["organization"] == "광운대학교" for item in listing["items"])
        else:
            assert {"target-external", "context-internal"} <= set(ids(listing))
            assert "publisher-repost" not in ids(listing)
            assert "contextual" in by_id(listing)["context-internal"]["searchMatch"]["relations"]
        for item in listing["items"]:
            assert_grounded(paired_catalog, item)


def test_calendar_relation_facet_counts_follow_month_with_undated_separate(repository):
    for key, period in [
        ("current-month", "2026-10-01 ~ 2026-10-31"),
        ("other-month", "2027-01-01 ~ 2027-01-31"),
        ("undated", "공식 공고에서 확인"),
    ]:
        add_notice(repository, key, title="교내 장학금 지원", fields={
            "text": "우리대학 재학생 대상 등록금 장학금 지원",
            "application_period": period,
        })
    listing = catalog.list_policies(repository, q="광운대")
    assert listing["total"] == 3
    calendar = catalog.list_calendar(repository, month="2026-10", q="광운대")
    assert ids(calendar) == ["current-month"]
    assert calendar["total"] == 1 and calendar["undatedTotal"] == 1
    facets = {item["scope"]: item for item in calendar["search"]["alternatives"]}
    for scope, relation in [("organization", "publisher"), ("content", "related")]:
        selected = catalog.list_calendar(repository, month="2026-10", q="광운대",
            search_relation=relation)
        assert selected["total"] == facets[scope]["count"] == 1
        assert selected["undatedTotal"] == 1


def test_unspecified_our_school_does_not_create_affiliation_or_eligibility(paired_catalog):
    result = catalog.list_policies(paired_catalog, q="우리학교 등록금 너무비싸")
    assert "national-college" in ids(result)
    assert "광운" not in result["search"]["interpretedQuery"]
    assert "광운" not in result["search"]["summary"]
    assert not result["search"]["corrections"]
    assert any("학교" in warning and "확인" in warning
               for warning in result["search"]["warnings"])
    for item in result["items"]:
        assert_grounded(paired_catalog, item)
        assert not any(phrase in item["searchMatch"]["reason"] for phrase in (
            "지원 확정", "자격 확정", "반드시 받을", "수급 가능 확정"))


def test_unknown_school_name_is_not_fuzzily_bound_to_another_school(paired_catalog):
    result = catalog.list_policies(paired_catalog, q="미등록학교 학생 장학금")
    assert not any("광운" in correction["to"] for correction in result["search"]["corrections"])
    assert "광운" not in result["search"]["interpretedQuery"]


@pytest.fixture
def catalog_without_queried_school(repository):
    add_notice(repository, "national-aid", title="대학생 등록금 장학금",
        organization="한국장학재단",
        fields={"eligibility": "국내 대학교 재학생 대상. 학교 제한 없음",
            "benefits": "등록금 장학금 지급"})
    add_notice(repository, "other-school", title="서강대학교 교내 장학금",
        organization="서강대학교", fields={"eligibility": "서강대학교 재학생만 신청 가능",
            "benefits": "등록금 장학금 지급"})
    return repository


@pytest.mark.parametrize("query", ["광운대생 받을 돈", "광운대 다니는데 등록금지원"])
def test_explicit_school_affiliation_recalls_national_aid_without_catalog_school_name(
        catalog_without_queried_school, query):
    result = catalog.list_policies(catalog_without_queried_school, q=query)
    assert ids(result) == ["national-aid"]
    assert "student_general" in result["items"][0]["searchMatch"]["relations"]
    assert any("학교" in warning and ("공개" in warning or "공고" in warning)
               for warning in result["search"]["warnings"])
    assert not result["search"]["corrections"]
    assert_grounded(catalog_without_queried_school, result["items"][0])


def test_unobserved_school_affiliation_does_not_guess_a_known_school(
        catalog_without_queried_school):
    result = catalog.list_policies(catalog_without_queried_school, q="미등록대생 장학금")
    assert ids(result) == ["national-aid"]
    assert "광운" not in result["search"]["interpretedQuery"]
    assert "광운" not in result["search"]["summary"]
    assert not result["search"]["corrections"]
    assert result["search"]["warnings"]
    assert_grounded(catalog_without_queried_school, result["items"][0])


def test_structured_filters_do_not_change_known_school_interpretation(repository):
    add_notice(repository, "known-school", title="교내 아르바이트 모집", category="일자리",
        region="서울", fields={"benefits": "시간당 급여 지급"})
    add_notice(repository, "national-aid", title="국가 대학생 학비 지원",
        organization="한국장학재단", fields={"eligibility": "국내 대학교 재학생 대상",
            "benefits": "등록금 장학금 지급"})
    query = "광운대생 학비 지원"
    unfiltered = catalog.list_policies(repository, q=query)
    filtered = catalog.list_policies(repository, q=query, category="교육", region="부산")
    calendar = catalog.list_calendar(repository, q=query, category="교육", region="부산",
        month="2026-10")
    assert ids(filtered) == ids(calendar) == ["national-aid"]
    assert filtered["search"]["interpretedQuery"] == unfiltered["search"]["interpretedQuery"]
    assert "student_general" in filtered["items"][0]["searchMatch"]["relations"]
    assert_grounded(repository, filtered["items"][0])


@pytest.mark.parametrize("field", ["contact", "application_url"])
def test_extracted_metadata_evidence_cannot_become_substantive_search_facts(repository, field):
    add_notice(repository, "genuine", title="교내 장학금 지원",
        fields={"eligibility": "광운대학교 재학생 대상", "benefits": "등록금 장학금 지급"})
    quote = "광운대학교 재학생 등록금 장학금 상담 담당자"
    add_notice(repository, "metadata", title="지역 주민 상담 안내", organization="서울시",
        fields={"eligibility": "지역 일반 주민", field: quote})
    details = repository.tables["policy_revision_details"]
    with repository.engine.begin() as connection:
        connection.execute(update(details).where(details.c.revision_id == "metadata-revision")
            .values(draft_json={"overview": {
                "region_conditions": {"status": "unrestricted", "text": "전국"},
                "age_conditions": {"status": "specified", "text": "대학생",
                    "evidence": [{"source_field": field, "quote": quote}]},
                "benefits": {"status": "specified", "text": "등록금 장학금",
                    "evidence": [{"source_field": field, "quote": quote}]},
            }}))
    result = catalog.list_policies(repository, q="광운대 학생 장학금")
    assert ids(result) == ["genuine"]
    assert_grounded(repository, result["items"][0])


def test_normalized_long_body_match_quotes_the_actual_target(repository):
    add_notice(repository, "known-school", title="공개 자료 안내")
    body = ("공고 확인을 위한 일반 안내 문구 " * 30 +
            "광운 대학교 재학생 대상이며 학업 지원을 제공합니다")
    add_notice(repository, "long-body", title="협력 학업 지원", organization="서울시",
        fields={"text": body})
    result = catalog.list_policies(repository, q="광운대 학생")
    assert ids(result) == ["long-body"]
    item = result["items"][0]
    assert "target" in item["searchMatch"]["relations"]
    assert_grounded(repository, item)
    proof = item["searchMatch"]["evidence"][0]
    assert proof["field"] == "text"
    assert "광운대학교재학생" in re.sub(r"\s+", "", proof["quote"])


@pytest.fixture
def housing_catalog(repository):
    add_notice(repository, "youth-rent", title="청년 월세 지원", organization="서울시",
        category="주거", fields={"eligibility": "무주택 청년 대상",
            "benefits": "월세와 임차료 지원금 지급"})
    add_notice(repository, "jobseeker-rent", title="구직자 주거 안정 지원",
        organization="복지재단", category="주거",
        fields={"eligibility": "미취업 청년과 실직 구직자",
            "benefits": "월세 보조금 지급"})
    add_notice(repository, "worker-rent", title="직장인 임차료 지원", organization="지자체",
        category="주거", fields={"eligibility": "회사에 재직 중인 근로자 대상",
            "benefits": "월세와 임차료 지원"})
    add_notice(repository, "employment-only", title="청년 취업 훈련 수당", organization="고용부",
        category="일자리", fields={"eligibility": "미취업 구직자 대상",
            "benefits": "직업훈련 교육비 지급"})
    return repository


@pytest.mark.parametrize("query,expected", [
    ("청년 월세", {"youth-rent", "jobseeker-rent"}),
    ("백수인데 월세낼 돈이 없어", {"jobseeker-rent"}),
    ("회사 다니는데 월세 도와주는거", {"worker-rent"}),
])
def test_housing_goal_generalizes_beyond_university_keywords(housing_catalog, query, expected):
    result = catalog.list_policies(housing_catalog, q=query)
    assert expected <= set(ids(result))
    assert "employment-only" not in ids(result)
    for item in result["items"]:
        assert_grounded(housing_catalog, item)


@pytest.fixture
def medical_catalog(repository):
    add_notice(repository, "medical-grant", title="의료비 지원", organization="복지재단",
        category="건강·돌봄", fields={"eligibility": "저소득 주민",
            "benefits": "병원비와 진료비 지원. 근로 의무와 상환 의무는 없습니다."})
    add_notice(repository, "medical-work", title="의료비 지원 활동 참여", organization="복지재단",
        category="건강·돌봄", fields={"benefits":
            "병원비 지원: 근로 참여는 필수이며 상환 의무는 없습니다."})
    add_notice(repository, "medical-loan", title="의료비 대출 지원", organization="복지재단",
        category="건강·돌봄", fields={"benefits":
            "진료비 대출 지원. 근로 의무는 없으며 원금은 상환해야 합니다."})
    add_notice(repository, "employment-only", title="취업 상담", organization="고용부",
        category="일자리", fields={"benefits": "일자리 알선과 직업훈련"})
    return repository


@pytest.mark.parametrize("query,included,excluded", [
    ("병원비 도와주는거 근로 말고", {"medical-grant", "medical-loan"}, {"medical-work"}),
    ("병원비 지원인데 갚는 돈 말고", {"medical-grant", "medical-work"}, {"medical-loan"}),
    ("의료비 도움 대출이나 알바 말고", {"medical-grant"}, {"medical-work", "medical-loan"}),
])
def test_obligation_negation_does_not_cross_another_obligation(
        medical_catalog, query, included, excluded):
    result = catalog.list_policies(medical_catalog, q=query)
    assert included <= set(ids(result))
    assert not excluded & set(ids(result))
    assert "employment-only" not in ids(result)
    for item in result["items"]:
        assert_grounded(medical_catalog, item)


def test_explicit_literal_scopes_remain_exact_overrides(paired_catalog):
    publisher = catalog.list_policies(paired_catalog, q="광운대", search_scope="organization")
    assert "publisher-repost" in ids(publisher) and "target-external" not in ids(publisher)
    assert publisher["search"]["mode"] == "literal"
    content = catalog.list_policies(paired_catalog, q="광운대", search_scope="content")
    assert "target-external" in ids(content) and "context-internal" not in ids(content)
    assert content["search"]["mode"] == "literal"
    exact = catalog.list_policies(paired_catalog, q="광운대생 받을 돈", search_mode="literal")
    assert exact["total"] == 0


def test_smart_matches_are_complete_before_pagination_and_explicit_sort(repository):
    # Meaningful old candidates must not disappear behind a recent/popular page.
    for index in range(33):
        add_notice(repository, f"target-{index:02d}", title=f"광운대학교 장학금 {index:02d}",
            organization="서울시", day=1 + index % 3,
            fields={"eligibility": "광운대학교 재학생 대상", "benefits": "등록금 지원"})
        add_views(repository, f"target-{index:02d}", index)
    add_notice(repository, "irrelevant-popular", title="전국 주민 취업 상담", day=20,
        organization="고용노동부", category="일자리", fields={"benefits": "취업 상담"})
    add_views(repository, "irrelevant-popular", 1_000_000)
    filters = {"q": "광운대생 학비 지원 좀 찾아줘", "category": "교육", "region": "서울"}
    pages = [catalog.list_policies(repository, limit=10, offset=offset, **filters)
             for offset in (0, 10, 20, 30)]
    assert all(page["total"] == 33 for page in pages)
    assert [page["nextCursor"] for page in pages] == ["10", "20", "30", None]
    assert len({key for page in pages for key in ids(page)}) == 33
    assert all("irrelevant-popular" not in ids(page) for page in pages)
    popular = catalog.list_policies(repository, sort="popular", **filters)
    assert ids(popular)[0] == "target-32"
    recent = catalog.list_policies(repository, sort="recent", **filters)
    assert recent["items"][0]["date"] == "2026-10-03"
    named = catalog.list_policies(repository, sort="name", **filters)
    assert ids(named) == [f"target-{index:02d}" for index in range(20)]


def test_latest_published_revisions_and_calendar_share_smart_result_set(repository):
    add_notice(repository, "changed", title="광운대 학생 장학금", revision="changed-old")
    add_notice(repository, "changed", title="주민 건강 상담", revision="changed-current", day=2,
        organization="보건소", category="건강·돌봄", fields={"benefits": "건강 검진"})
    add_notice(repository, "visible", title="광운대 학생 장학금", revision="visible-public",
        fields={"eligibility": "광운대학교 재학생", "benefits": "등록금 지원"})
    add_notice(repository, "visible", title="숨겨진 최신 초안", revision="visible-hidden", day=4,
        published=False)
    add_notice(repository, "hidden", title="광운대 장학금 비공개", published=False)
    filters = {"q": "광운대생 학비 보태주는거", "category": "교육", "region": "서울"}
    listing = catalog.list_policies(repository, **filters)
    calendar = catalog.list_calendar(repository, month="2026-10", **filters)
    assert ids(listing) == ids(calendar) == ["visible"]
    assert listing["total"] == calendar["total"] == 1
    assert listing["items"][0]["revisionId"] == "visible-public"
    assert calendar["search"]["mode"] == "smart"
    assert_grounded(repository, calendar["items"][0])


def test_search_does_not_create_missing_application_dates(repository):
    add_notice(repository, "undated", title="대학생 등록금 장학금", organization="장학재단",
        fields={"eligibility": "국내 대학교 재학생", "benefits": "학비 지원",
                "application_period": "공식 공고에서 확인"})
    listing = catalog.list_policies(repository, q="대학생 학비 도와주는거")
    assert ids(listing) == ["undated"]
    item = listing["items"][0]
    assert item["applicationStart"] is None and item["applicationEnd"] is None
    assert item["scheduleStatus"] == "unknown"
    calendar = catalog.list_calendar(repository, month="2026-10", q="대학생 학비 도와주는거")
    assert calendar["items"] == [] and calendar["total"] == 0
    assert calendar["undatedTotal"] == 1
    assert calendar["undatedItems"][0]["id"] == "undated"


def test_smart_search_http_defaults_metadata_and_validation(paired_catalog):
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    app.dependency_overrides[get_repository] = lambda: paired_catalog
    with TestClient(app) as client:
        for path, extra in [("/v1/policies", {}),
                            ("/v1/policies/calendar", {"month": "2026-10"})]:
            response = client.get(path, params={**extra, "q": "광운대생 받을 돈"})
            assert response.status_code == 200
            result = response.json()
            assert result["search"]["mode"] == "smart"
            assert {"target-external", "context-internal", "national-college"} <= set(ids(result))
            literal = client.get(path, params={**extra, "q": "광운대생 받을 돈",
                                              "search_mode": "literal"})
            assert literal.status_code == 200 and literal.json()["total"] == 0
            for invalid in ({"search_mode": "guess"}, {"search_scope": "guess"}):
                assert client.get(path, params={**extra, **invalid}).status_code == 422
        response = client.get("/v1/policies", params={"q": "학비 지원", "sort": "relevance"})
        assert response.status_code == 200
        assert client.get("/v1/policies", params={"sort": "guessed"}).status_code == 422


def test_smart_relation_facets_round_trip_through_http(paired_catalog):
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    app.dependency_overrides[get_repository] = lambda: paired_catalog
    with TestClient(app) as client:
        for path, extra in [("/v1/policies", {}),
                            ("/v1/policies/calendar", {"month": "2026-10"})]:
            for query in ["광운대", "광운대 장학금 관련 공고 좀 찾아줘"]:
                all_results = client.get(path, params={**extra, "q": query}).json()
                facets = {item["scope"]: item for item in all_results["search"]["alternatives"]}
                for scope, relation in [("organization", "publisher"), ("content", "related")]:
                    response = client.get(path, params={**extra, "q": query,
                        "search_relation": relation})
                    assert response.status_code == 200
                    result = response.json()
                    assert result["search"]["mode"] == "smart"
                    assert result["total"] == facets[scope]["count"]
                    if relation == "related":
                        assert "context-internal" in ids(result)
                        assert "publisher-repost" not in ids(result)
            assert client.get(path, params={**extra, "q": "광운대",
                "search_relation": "guess"}).status_code == 422
