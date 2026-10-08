"""Personal descriptions preserve goals, grounded ranking and explicit unknowns."""

import pytest

from app.modules.search.interpretation import interpret_query
from app.modules.storage import catalog
from tests.test_smart_search import add_notice, assert_grounded, ids
from tests.test_smart_search import repository as search_repository


@pytest.fixture
def repository():
    yield from search_repository.__wrapped__()


@pytest.mark.parametrize("query", [
    "나는 휴학한 학생이고 지원금과 관련된 정보가 필요해",
    "저는 휴학생인데 받을 수 있는 지원금 정보를 알려주세요",
    "휴학 중인 학생이라 생활비 지원이 필요해요",
    "나는 휴학 중인 대학생이고 지원금에 대한 정보를 알고 싶어요",
])
def test_personal_student_sentences_find_support_without_prose_constraints(repository, query):
    add_notice(repository, "leave", title="학생 생활비 지원금", organization="서울시",
               fields={"eligibility": "대학생 및 휴학생 신청 가능", "benefits": "생활비 지급"})
    add_notice(repository, "general", title="주민 생활비 지원금", organization="서울시",
               fields={"eligibility": "주민 누구나 상담", "benefits": "생활비 지급"})
    add_notice(repository, "excluded", title="대학생 생활비 지원금", organization="서울시",
               fields={"eligibility": "대학생 대상. 휴학생 신청 불가", "benefits": "생활비 지급"})
    add_notice(repository, "enrolled", title="학생 생활비 지원금", organization="서울시",
               fields={"eligibility": "재학생만 신청 가능", "benefits": "생활비 지급"})
    result = catalog.list_policies(repository, q=query)
    assert ids(result) == ["leave", "general", "enrolled", "excluded"]
    assert result["search"]["originalQuery"] == query
    assert "휴학생 제외" in " ".join(result["search"]["warnings"])
    assert "휴학생 제외" in result["items"][-1]["searchMatch"]["reason"]
    assert "신청 가능해요" not in result["items"][0]["searchMatch"]["reason"]
    assert interpret_query(query).terms == ()
    for item in result["items"]:
        assert_grounded(repository, item)


def test_job_search_is_background_when_requesting_rent_support(repository):
    add_notice(repository, "rent", title="청년 월세 지원", organization="서울시",
               fields={"eligibility": "청년 대상", "benefits": "월세 지급"})
    result = catalog.list_policies(repository,
        q="취업 준비 중인 청년인데 월세 지원을 받을 수 있을까요")
    assert ids(result) == ["rent"]
    assert "취업" not in result["search"]["interpretedQuery"]


def test_personal_geography_and_unknown_specific_nouns_stay_constraints(repository):
    add_notice(repository, "local", title="월계동 생활비 지원", organization="노원구",
               fields={"benefits": "주민 생활비 지원"})
    add_notice(repository, "other", title="강남구 생활비 지원", organization="강남구",
               fields={"benefits": "주민 생활비 지원"})
    query = "월계동에 거주 중인 휴학생인데 생활비 관련 정보를 찾고 있어요"
    assert ids(catalog.list_policies(repository, q=query)) == ["local"]
    assert interpret_query(query).terms == ("월계동",)
    assert interpret_query("화도 장학금").terms == ("화도",)
    assert interpret_query("동해 장학금").terms == ("동해",)
    assert ids(catalog.list_policies(repository, q="휴학생 지원금 아토피")) == []


@pytest.mark.parametrize("query", ["휴학생이 아니고 재학생인데 장학금을 알려줘",
                                  "휴학하지 않은 학생인데 생활비 지원이 필요해"])
def test_negated_leave_status_does_not_activate_leave_ranking(query):
    assert interpret_query(query).contexts == ()


def test_a_negative_leave_notice_does_not_outrank_general_support(repository):
    add_notice(repository, "excluded", title="대학생 지원금", organization="서울시",
               fields={"text": "휴학생은 지원 대상에서 제외됩니다.", "benefits": "지원금 지급"})
    add_notice(repository, "general", title="주민 지원금", organization="서울시",
               fields={"benefits": "지원금 지급"})
    assert ids(catalog.list_policies(repository, q="나는 휴학생이고 지원금 정보가 필요해")) == [
        "general", "excluded"]


def test_exclusion_section_with_parenthetic_include_is_not_positive(repository):
    add_notice(repository, "excluded", title="장학 지원금", organization="서울시",
               fields={"text": "제외대상\n1) 기존 선발자\n2) 휴학생(학사징계자 포함)\n"
                       "신청방법\n온라인 신청", "benefits": "지원금 지급"})
    result = catalog.list_policies(repository, q="저는 휴학생이고 지원금 정보가 필요해")
    assert "휴학생 제외" in result["items"][0]["searchMatch"]["reason"]
    assert "휴학생 관련 신청" not in result["items"][0]["searchMatch"]["reason"]
