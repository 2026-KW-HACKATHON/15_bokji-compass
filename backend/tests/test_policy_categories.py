"""Category contracts and read-time projections use isolated synthetic policies."""

from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace

import pytest
from sqlalchemy import JSON, Column, DateTime, MetaData, String, Table, create_engine, event, select

from app.contracts.assistance import GuidanceProfile
from app.contracts.categories import POLICY_CATEGORIES, POLICY_DISPLAY_CATEGORIES
from app.contracts.matching import RecommendationProfile
from app.modules.storage import catalog, editor
from app.modules.storage.categories import effective_category, effective_category_expression
from app.modules.storage.publication import review_summary
from tests.test_raw_parsing import overview

CASES = [
    ("유기농업자재 지원", "생활·금융", {}, "농림축산·어업"),
    ("우수 후계농업경영인 추가 지원", "생활·금융", {}, "농림축산·어업"),
    ("농식품산업 해외진출 융자 지원", "생활·금융", {}, "농림축산·어업"),
    ("수산식품 가공설비 지원", "생활·금융", {}, "농림축산·어업"),
    ("수산장비 임대", "생활·금융", {}, "농림축산·어업"),
    ("한우 사육 지원", "생활·금융", {}, "농림축산·어업"),
    ("임업용 면세 유류지원", "생활·금융", {}, "농림축산·어업"),
    ("농촌 폐비닐 수거보상금 지급", "생활·금융", {}, "농림축산·어업"),
    ("특수산림사업자에 대한 사업비 융자 및 보조", "생활·금융", {}, "농림축산·어업"),
    ("스마트축산단지 조성 사업 참여 안내", "주거", {}, "농림축산·어업"),
    ("농산물 우수관리(GAP) 시설 보완 지원", "건강·돌봄", {}, "농림축산·어업"),
    ("농업 경영·기술 심층컨설팅", "일자리", {}, "농림축산·어업"),
    ("수산식품 무역상담회", "일자리", {}, "농림축산·어업"),
    ("과실전문 생산단지 기반조성 지원", "주거", {}, "농림축산·어업"),
    ("숲가꾸기 사업 지원", "일자리", {}, "농림축산·어업"),
    ("쌀 가공산업 육성 지원 사업", "생활·금융", {}, "농림축산·어업"),
    ("목재펠릿 사후관리 모니터링", None, {}, "농림축산·어업"),
    ("귀농 농업창업 및 주택구입지원 사업", "주거", {}, "농림축산·어업"),
    ("귀산촌인 창업 및 주택 구입 지원", "생활·금융", {}, "농림축산·어업"),
    ("친환경 에너지절감장비 보급", None, {"benefits": "친환경 어업 장비 지원"}, "농림축산·어업"),
    ("생산 장비 지원", "생활·금융", {"purpose_summary": "농업인 대상 경영 지원"}, "농림축산·어업"),
    ("소상공인 경영안정 자금", "생활·금융", {}, "사업·창업"),
    ("청년 창업지원", "일자리", {}, "사업·창업"),
    ("사회적기업 지방세 감면", "생활·금융", {}, "사업·창업"),
    ("장애인기업확인서 발급", "생활·금융", {}, "사업·창업"),
    ("글로벌 강소기업 1,000+ 프로젝트", "일자리", {}, "사업·창업"),
    ("첫걸음기업 금융지원 협약보증", "생활·금융", {}, "사업·창업"),
    ("중소기업 기술보호 법무지원단", "생활·금융", {}, "사업·창업"),
    ("햇살론(자영업자) 신용보증", "생활·금융",
     {"eligibility": "농업인·기업인 등 자영업자", "benefits": "농업·사업 자금 보증"}, "사업·창업"),
    ("기술창업자금 지원", "생활·금융",
     {"eligibility": "농림축산식품 업종 기술 보유 농업법인·중소기업",
      "benefits": "저리 융자"}, "농림축산·어업"),
    ("직무발명보상 우수기업 인증 및 지원", "생활·금융",
     {"eligibility": "농림 종자를 포함한 직무 발명"}, "사업·창업"),
    ("우선심사 서비스 제공", "생활·금융", {"benefits": "중소기업 출원 우선심사"}, "사업·창업"),
    ("우선심사 및 초고속심사 서비스 제공", "생활·금융",
     {"benefits": "중소기업 출원에 대한 우선심사 서비스 제공"}, "사업·창업"),
    ("우수 산업기업 지원", "생활·금융", {}, "사업·창업"),
    ("우수산업기업 지원", "생활·금융", {}, "사업·창업"),
    ("농촌출신대학생학자금융자", "교육", {}, "교육"),
    ("중소기업 취업연계 장학금", "교육", {}, "교육"),
    ("중소기업장기근속자주택우선공급", "주거", {}, "주거"),
    ("기업복지활성화 지원", "건강·돌봄", {}, "건강·돌봄"),
    ("여성농업인 건강검진", "건강·돌봄", {}, "건강·돌봄"),
    ("목재 전문인력 양성기관 비용 지원", "교육", {}, "교육"),
    ("민간어린이집 실내환경 개선 지원(국산목재)", "건강·돌봄", {}, "건강·돌봄"),
    ("농업인 취업 알선", "일자리", {}, "일자리"),
    ("중소기업 내일채움공제 지원", "일자리", {}, "일자리"),
    ("일학습병행 학습기업 지원", "일자리", {}, "일자리"),
    ("상생페이백", "생활·금융",
     {"eligibility": "소상공인·중소기업 매장에서 개인 카드 사용",
      "benefits": "카드 소비 환급"}, "생활·금융"),
    ("직업훈련 생계비대부사업", "생활·금융",
     {"eligibility": "비정규직 근로자·실업자·자영업자 가구 소득 조건",
      "benefits": "사업주 훈련"}, "생활·금융"),
    ("소년소녀가정 지원", "생활·금융",
     {"eligibility": "가정을 이끌어 가고 있는 아동", "benefits": "생계·교육 급여"}, "생활·금융"),
    ("수도법 상수원 보호구역 주민지원", "생활·금융",
     {"benefits": "농기계·농자재 구입, 생필품, 장학금"}, "생활·금융"),
    ("생활안정자금(융자)(이차보전)", "생활·금융",
     {"benefits": "자녀 양육 노동자 융자"}, "생활·금융"),
    ("대지급금 관련업무 공인노무사 조력지원", "생활·금융",
     {"benefits": "기업 도산으로 임금을 받지 못한 퇴직 근로자 노무사 조력"}, "생활·금융"),
    ("생활 지원", "생활·금융",
     {"text": "담당 농업 부서 안내", "provider_category": "농림축산어업"}, "생활·금융"),
    ("생계 지원", "생활·금융", {"benefits": "가구 생활 안정 자금 지원"}, "생활·금융"),
    ("보조공학기기 지원", None,
     {"eligibility": "○ 장애인기업 중 1인 중증장애인 사업주",
      "benefits": "점자단말기, 의사소통보조기기 등 물품가액 5백만원 한도 지원"}, "사업·창업"),
    ("장비 구입 지원", None,
     {"eligibility": "1인 중증장애인 사업주",
      "benefits": "업무용 보조공학 기기 지원"}, "사업·창업"),
    ("보조공학기기 지원", None,
     {"eligibility": "장애인기업 소속 근로자", "benefits": "점자단말기 지원"}, "기타"),
    ("보조공학기기 지원", None,
     {"eligibility": "중증장애인", "benefits": "점자단말기 지원"}, "기타"),
    ("일반 공고", None, {}, "기타"),
]


def record(title, category, fields=None, *, manual=None):
    source_fields = dict(fields or {})
    if manual:
        source_fields["_editor_category"] = manual
    return {"policy_key": "test:category", "revision_id": "revision-category",
        "created_at": datetime(2026, 10, 7), "title": title, "category": category,
        "source_json": {"title": title, "organization": "검증 기관", "source_url": None,
                        "fields": source_fields}, "draft_json": {"overview": {}}}


@pytest.mark.parametrize("title,category,fields,expected", CASES)
def test_domain_reclassification_preserves_personal_benefits_and_source(
    title, category, fields, expected,
):
    value = record(title, category, fields)
    before = deepcopy(value)
    assert effective_category(value) == expected
    assert catalog.card(value)["category"] == expected
    assert catalog.card(value)["tags"] == [expected]
    assert value == before


@pytest.mark.parametrize("category", POLICY_DISPLAY_CATEGORIES)
def test_manual_choices_always_win_even_for_agriculture_titles(category):
    value = record("농업인 창업 지원", None if category == "기타" else category, manual=category)
    assert effective_category(value) == category
    assert catalog.card(value)["category"] == category


def test_legacy_manual_reason_and_new_model_domains_are_preserved():
    value = record("농업인 창업 지원", "생활·금융")
    value["draft_json"]["overview"]["category_reason"] = "관리자 분류 수정"
    assert effective_category(value) == "생활·금융"
    assert effective_category(record("농업 관련 기업 지원", "사업·창업")) == "사업·창업"


def test_publication_list_and_review_summary_use_same_projected_category():
    value = {**record("농업인 창업 지원", "생활·금융"),
             "review_status": "published", "matching_enabled": False, "canonical_json": {}}
    assert review_summary(value)["category"] == catalog.card(value)["category"] == "농림축산·어업"
    value["source_json"]["fields"]["_editor_category"] = "생활·금융"
    assert review_summary(value)["category"] == "생활·금융"


def test_parsing_editor_and_recommendation_contracts_accept_expanded_categories():
    for category in POLICY_CATEGORIES:
        assert overview(category=category).category == category
    assert len(editor.CATEGORIES) == len(set(editor.CATEGORIES)) == 9
    assert editor.CATEGORIES == list(POLICY_DISPLAY_CATEGORIES)
    preferences = RecommendationProfile(interests=list(POLICY_DISPLAY_CATEGORIES))
    assert preferences.interests[-3:] == ["농림축산·어업", "사업·창업", "기타"]
    assert len(GuidanceProfile(interests=list(POLICY_DISPLAY_CATEGORIES)).interests) == 9
    for category in ("농림축산·어업", "사업·창업"):
        data = editor.PolicyEditInput(version="a" * 64, title="농업 창업 지원", organization="기관",
            fields={}, category=category, display={}, published=False, note="분류 수정")
        draft = editor.build_manual_draft("test:expanded-editor", data, {})
        assert draft["overview"]["category"] == category


def test_sql_projection_matches_cards_and_filters_before_pagination():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def register_mysql_functions(connection, _):
        connection.create_function("json_unquote", 1, lambda value: value)
        connection.create_function(
            "concat", -1, lambda *values: "".join(str(value) for value in values))

    metadata = MetaData()
    documents = Table("condition_documents", metadata,
        Column("policy_key", String, nullable=False),
        Column("revision_id", String, primary_key=True),
        Column("created_at", DateTime, nullable=False), Column("source_json", JSON, nullable=False),
        Column("review_status", String, nullable=False))
    details = Table("policy_revision_details", metadata,
        Column("revision_id", String, primary_key=True), Column("title", String, nullable=False),
        Column("organization", String), Column("category", String),
        Column("draft_json", JSON, nullable=False), Column("processing_json", JSON, default=dict))
    metadata.create_all(engine)
    editor.records.create(engine)
    values = [record(title, category, fields) for title, category, fields, _ in CASES]
    values.extend(record("농업인 창업 지원", category, manual=category)
                  for category in POLICY_DISPLAY_CATEGORIES)
    with engine.begin() as connection:
        for index, value in enumerate(values):
            value.update(policy_key=f"test:category-{index}", revision_id=f"revision-{index}")
            connection.execute(documents.insert(), {**{k: value[k] for k in (
                "policy_key", "revision_id", "created_at", "source_json")},
                "review_status": "published"})
            connection.execute(details.insert(), {k: value[k] for k in (
                "revision_id", "title", "category", "draft_json")})
    repository = SimpleNamespace(engine=engine, tables={"condition_documents": documents,
                                                       "policy_revision_details": details})
    published = catalog.published_catalog(repository)
    with engine.connect() as connection:
        rows = connection.execute(select(published.c.policy_key,
            effective_category_expression(published).label("effective_category"))).mappings()
        sql_results = {row["policy_key"]: row["effective_category"] for row in rows}
    assert sql_results == {value["policy_key"]: effective_category(value) for value in values}
    for category in POLICY_DISPLAY_CATEGORIES:
        expected = {key for key, value in sql_results.items() if value == category}
        first = catalog.list_policies(repository, category=category, limit=1)
        assert first["total"] == len(expected)
        listing = catalog.list_policies(repository, category=category, limit=100)
        assert {item["id"] for item in listing["items"]} == expected
        assert {item["category"] for item in listing["items"]} <= {category}
        assert catalog.list_policies(repository, tag=category, limit=100)["total"] == len(expected)
    with engine.connect() as connection:
        stored = connection.execute(select(details.c.category).where(
            details.c.revision_id == "revision-0")).scalar_one()
    assert stored == "생활·금융"
    agriculture_calendar = catalog.list_calendar(
        repository, month="2026-10", category="농림축산·어업")
    assert agriculture_calendar["undatedTotal"] == sum(
        value == "농림축산·어업" for value in sql_results.values())
    assert {item["category"] for item in agriculture_calendar["undatedItems"]} == {"농림축산·어업"}
    editable = editor.list_editable_policies(repository, q="스마트축산단지")
    assert editable["items"][0]["category"] == "농림축산·어업"
    engine.dispose()
