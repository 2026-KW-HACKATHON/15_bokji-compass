"""Policy logic, source evidence and member boundaries use isolated synthetic data."""

import time
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
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
    select,
    update,
)
from sqlalchemy.exc import OperationalError

from app.api import recommendations
from app.contracts.conditions import CanonicalCondition, LogicNode
from app.contracts.finance import FinancialProfile
from app.contracts.matching import RecommendationProfile
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts, sessions
from app.modules.auth.service import digest
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import FinancialProfileStore, financial_profiles
from app.modules.ingestion.models import records as collection_records
from app.modules.matching import public
from app.modules.normalization.raw import normalize_record
from app.modules.regions.public import default_catalog

TODAY = date(2026, 10, 6)
HEADERS = {"X-Auth-Request": "1"}
FINANCIAL = {"household_size": 2, "household_scope_confirmed": True, "members": [{}, {}]}
TOKENS = {1: "a" * 43, 2: "b" * 43}


def condition(key="age", *, identifier="c1", subject="applicant", role="eligibility",
              state=1, value=None, operator="GTE", basis=None):
    return CanonicalCondition(
        condition_id=identifier, field_key=key, source_field_key=key, subject=subject,
        state_code=state, operator=operator if state == 1 else None,
        value=value or {"kind": "DECIMAL", "number": "19"} if state == 1 else None,
        unit={"age": "YEARS", "household_size": "PERSONS",
              "monthly_income": "KRW_PER_MONTH"}.get(key),
        reference_basis=basis, role=role, group_id="g1", source_field="text",
        evidence_quote="조건 검증", unknown_reason="NOT_STATED" if state == 9 else None,
        review_note="",
    )


def leaf(identifier):
    return {"op": "condition", "condition_id": identifier, "children": [], "reason": None}


def record(conditions=None, *, key="fixture", enabled=True, logic=None, coverage="complete",
           title="검증용 공고", text="조건 검증", period="상시", category="주거"):
    conditions = conditions or [condition()]
    source = normalize_record({"document_id": key, "title": title, "text": text,
                               "application_period": period})
    return {
        "revision_id": "revision-" + key, "policy_key": source.policy_key,
        "created_at": datetime(2026, 10, 5), "source_json": source.model_dump(),
        "draft_json": {}, "title": source.title, "category": category,
        "review_status": "published", "matching_enabled": enabled,
        "canonical_json": {
            "policy_key": source.policy_key, "region_snapshot_version": default_catalog().version,
            "conditions": [c.model_dump() for c in conditions],
            "logic": logic or leaf(conditions[0].condition_id),
            "coverage": coverage, "unresolved": [],
        },
    }


@pytest.mark.parametrize("age,status", [(18, "not_matched"), (19, "potential_match"),
                                         (0, "not_matched"), (None, "needs_review")])
def test_exact_age_boundaries_and_missing_not_zero(age, status):
    facts = public.build_facts({"age": age, "region": None}, None)
    result = public.compare_policy(record(), facts, today=TODAY)
    assert result["status"] == status
    assert result["eligibility_decided"] is False


def test_account_facts_cannot_be_overridden_and_household_members_are_not_applicant():
    preference = RecommendationProfile(region="부산", ageBand="65세 이상")
    finance = FinancialProfile.model_validate({"members": [{"age": 99}]})
    facts = public.build_facts({"age": 27, "region": "서울", "gender": "female"},
                               preference, finance)
    assert (facts.age_range, facts.region, facts.gender) == ((27, 27), "서울특별시", "FEMALE")
    missing = public.build_facts({"age": None, "region": None}, preference, finance)
    assert missing.age_range is None and missing.region is None


def test_guest_age_band_overlap_and_numeric_ranges():
    facts = public.build_facts(None, RecommendationProfile(ageBand="19~34세"))
    c = condition(value={"kind": "DECIMAL", "number": "25"})
    assert public.compare_policy(record([c]), facts, today=TODAY)["status"] == "needs_review"
    equal = c.model_copy(update={"operator": "EQ"})
    assert public.numeric_comparison(equal, (19, 34)) is None
    ranged = condition(operator="RANGE", value={
        "kind": "DECIMAL_RANGE", "minimum": "19", "maximum": "34",
        "min_inclusive": True, "max_inclusive": False,
    })
    assert public.numeric_comparison(ranged, (19, 33)) is True
    assert public.numeric_comparison(ranged, (34, 34)) is False
    assert public.numeric_comparison(ranged, (19, 34)) is None


def test_region_hierarchy_does_not_treat_province_as_proof_of_district():
    catalog = default_catalog()
    for name, expected in (("서울특별시", True), ("서울특별시 노원구", None),
                           ("부산광역시", False)):
        region = catalog.resolve(name, system="ADMIN").region
        assert region is not None
        c = condition("residence_region", operator="EQ", value={
            "kind": "REGION", "system": "ADMIN", "code": region.code, "name": region.name,
            "snapshot_version": catalog.version, "include_descendants": True,
        })
        assert public.region_comparison(c, "서울특별시", catalog) is expected
        registered = c.model_copy(update={"field_key": "registered_residence_region"})
        state, _ = public.compare_condition(registered, public.MatchingFacts(region="서울특별시"),
                                            catalog, TODAY)
        assert state is None


def test_three_valued_all_any_not_exclusions_and_application_roles():
    states = {"a": True, "b": False, "c": None}
    def logic(op, children):
        return LogicNode.model_validate({"op": op, "condition_id": None, "reason": None,
                                         "children": children})
    assert public.evaluate_logic(logic("any", [leaf("a"), leaf("b")]), states) is True
    assert public.evaluate_logic(logic("all", [leaf("a"), leaf("c")]), states) is None
    assert public.evaluate_logic(logic("all", [leaf("b"), leaf("c")]), states) is False
    assert public.evaluate_logic(logic("not", [leaf("c")]), states) is None
    excluded = condition(role="exclusion")
    tree = {"op": "not", "condition_id": None, "reason": None, "children": [leaf("c1")]}
    assert public.compare_policy(record([excluded], logic=tree),
                                 public.MatchingFacts(age_range=(27, 27)), today=TODAY)[
                                     "status"] == "not_matched"
    assert public.compare_condition(condition(subject="child"),
                                     public.MatchingFacts(age_range=(27, 27)),
                                     default_catalog(), TODAY)[0] is None


def test_disabled_partial_basis_and_monetary_conditions_require_review():
    facts = public.MatchingFacts(age_range=(27, 27))
    for row in (record(enabled=False), record(coverage="partial"),
                record([condition(basis="2025년 말 기준")])):
        assert public.compare_policy(row, facts, today=TODAY)["status"] == "needs_review"
    money = condition("monthly_income")
    assert public.compare_condition(money, facts, default_catalog(), TODAY)[0] is None
    c = condition("household_size", subject="household", value={"kind": "DECIMAL", "number": "2"},
                  operator="EQ")
    finance = FinancialProfile.model_validate(FINANCIAL)
    assert public.compare_condition(c, public.MatchingFacts(financial=finance),
                                     default_catalog(), TODAY)[0] is True
    assert public.compare_condition(c, public.MatchingFacts(), default_catalog(), TODAY)[0] is None


def test_application_period_is_separate_from_eligibility_and_source_is_validated():
    period = condition("application_period", role="application", operator="RANGE", value={
        "kind": "DATE_RANGE", "date_min": "2026-10-01", "date_max": "2026-10-06",
        "min_inclusive": True, "max_inclusive": False,
    }, identifier="period")
    result = public.compare_policy(record([condition(), period]),
                                   public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["checks"][1]["state"] == "mismatch"
    row = record()
    row["canonical_json"]["conditions"][0]["evidence_quote"] = "없는 원문"
    with pytest.raises(ValueError, match="evidence absent"):
        public.compare_policy(row, public.MatchingFacts(), today=TODAY)


@pytest.fixture
def repository(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "catalog.sqlite3"))
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
    repo = SimpleNamespace(engine=engine, tables={"condition_documents": documents,
                                                "policy_revision_details": details})
    yield repo
    engine.dispose()


def save_record(repository, row):
    with repository.engine.begin() as connection:
        for name in ("condition_documents", "policy_revision_details"):
            table = repository.tables[name]
            connection.execute(insert(table).values(**{c.name: row[c.name] for c in table.columns}))


def test_real_query_uses_latest_published_and_no_drafts_expired_or_invalid(repository):
    old = record(key="same")
    save_record(repository, old)
    new = record(key="same", enabled=False)
    new["revision_id"], new["created_at"] = "new", datetime(2026, 10, 6)
    save_record(repository, new)
    draft = record(key="draft")
    draft["review_status"] = "draft"
    save_record(repository, draft)
    expired = record(key="expired")
    expired["source_json"]["fields"]["application_period"] = "2026-01-01 ~ 2026-01-31"
    save_record(repository, expired)
    broken = record(key="broken")
    broken["canonical_json"]["conditions"][0]["evidence_quote"] = "없는 원문"
    save_record(repository, broken)
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["items"] == []
    assert result["mode"] == "profile_required"
    assert result["profile_sufficient"] is False
    assert "검증을 통과하지" in result["summary"]


def unrestricted(*, identifier="any"):
    return condition(identifier=identifier, state=0).model_copy(
        update={"evidence_quote": "국민 누구나 신청 가능"})


def general_record(*, key="general", **kwargs):
    return record([unrestricted()], key=key, text="조건 검증\n지원 대상: 국민 누구나 신청 가능",
                  category="문화", **kwargs)


def test_sparse_profile_gets_only_source_confirmed_broad_current_notices(repository):
    save_record(repository, general_record())
    for key, title in (("care", "자립준비청년 지원"), ("disability", "발달장애인 지원"),
                       ("parent", "청소년 미혼 한부모 지원")):
        save_record(repository, record(key=key, title=title))
    result = public.recommend(repository, public.MatchingFacts(), today=TODAY)
    assert [item["policy"]["id"] for item in result["items"]] == ["notice:general"]
    assert result["mode"] == "general" and result["profile_sufficient"] is False
    assert "정보가 부족" in result["guidance"] and "정보를 더 입력" in result["guidance"]
    assert "care_leaver_status" in result["missing_fields"]
    assert "일치" not in result["items"][0]["reason"]


def test_one_relevant_fact_is_enough_and_interests_alone_are_not(repository):
    save_record(repository, record())
    preference = RecommendationProfile(interests=["주거"])
    missing = public.recommend(repository, public.MatchingFacts(), preference, today=TODAY)
    assert missing["items"] == [] and missing["profile_sufficient"] is False
    assert missing["missing_fields"] == ["age"]
    matched = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)),
                               preference, today=TODAY)
    assert matched["mode"] == "personalized" and matched["profile_sufficient"] is True
    assert len(matched["items"]) == 1 and matched["missing_fields"] == []
    rejected = public.recommend(repository, public.MatchingFacts(age_range=(15, 15)),
                                preference, today=TODAY)
    assert rejected["mode"] == "personalized" and rejected["profile_sufficient"] is True
    assert rejected["items"] == [] and rejected["missing_fields"] == []
    assert "조건에 맞는" in rejected["guidance"] and "정보가 부족" not in rejected["guidance"]


def test_unrestricted_age_is_not_whole_audience_evidence_or_personalization(repository):
    save_record(repository, record([condition(state=0)]))
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["items"] == [] and result["profile_sufficient"] is False
    assert result["mode"] == "profile_required"
    save_record(repository, general_record())
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["mode"] == "general" and result["profile_sufficient"] is False


def test_specialized_source_cannot_be_recommended_from_age_match_alone(repository):
    save_record(repository, record(title="자립청소년 정착지원"))
    save_record(repository, record(key="parent", title="청소년 미혼 한부모 자립지원"))
    save_record(repository, record(key="disability", title="발달장애인 주간활동서비스"))
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["items"] == []
    assert {"care_leaver_status", "single_parent_status", "disability_registered"} <= set(
        result["missing_fields"])


def test_culture_and_transport_titles_do_not_remove_income_or_region_requirements(repository):
    row = general_record(key="income", title="문화비 지원")
    row["source_json"]["fields"]["eligibility"] = "국민 누구나 신청 가능, 기준중위소득 100% 이하"
    save_record(repository, row)
    row = general_record(key="local", title="교통비 지원")
    row["source_json"]["fields"]["eligibility"] = "서울시민 누구나 신청 가능"
    save_record(repository, row)
    result = public.recommend(repository, public.MatchingFacts(), today=TODAY)
    assert result["items"] == []
    assert {"income", "residence_region"} <= set(result["missing_fields"])


def test_negated_broad_audience_and_district_only_audience_are_not_general(repository):
    denied = unrestricted().model_copy(update={"evidence_quote": "전 국민 대상"})
    save_record(repository, record([denied], key="denied",
                                   text="지원 대상: 전 국민 대상이 아닙니다"))
    save_record(repository, record([unrestricted()], key="negative",
                                   text="국민 누구나 신청 가능하지는 않습니다"))
    local = general_record(key="district")
    local["source_json"]["fields"]["eligibility"] = "노원구민 누구나 신청 가능"
    save_record(repository, local)
    result = public.recommend(repository, public.MatchingFacts(), today=TODAY)
    assert result["items"] == [] and "residence_region" in result["missing_fields"]


def test_or_branch_and_negated_exclusion_preserve_decisive_user_facts(repository):
    disability = condition("disability_registered", identifier="disabled", operator="EQ",
                           value={"kind": "BOOLEAN", "boolean": True})
    either = {"op": "any", "condition_id": None, "reason": None,
              "children": [leaf("c1"), leaf("disabled")]}
    save_record(repository, record([condition(), disability], key="or", logic=either))
    excluded = condition(role="exclusion", value={"kind": "DECIMAL", "number": "65"})
    negated = {"op": "not", "condition_id": None, "reason": None, "children": [leaf("c1")]}
    save_record(repository, record([excluded], key="not", logic=negated))
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert {item["policy"]["id"] for item in result["items"]} == {"notice:or", "notice:not"}
    assert result["profile_sufficient"] is True
    for item in result["items"]:
        assert "장애" not in item["reason"] and "나이" in item["reason"]


def test_closed_future_unknown_and_exclusive_application_periods_are_excluded(repository):
    for key, period in (("closed", "2026-01-01 ~ 2026-01-31"),
                        ("future", "2026-11-01 ~ 2026-11-30"), ("unknown", "기관 문의")):
        save_record(repository, general_record(key=key, period=period))
    application = condition("application_period", identifier="period", role="application",
                            operator="RANGE", value={
                                "kind": "DATE_RANGE", "date_min": TODAY.isoformat(),
                                "date_max": "2026-11-30", "min_inclusive": False,
                                "max_inclusive": True,
                            })
    save_record(repository, record([condition(), application], key="exclusive"))
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["items"] == [] and result["mode"] == "profile_required"


def test_unknown_income_and_disabled_general_notice_are_never_weak_fallbacks(repository):
    income = condition("monthly_income", identifier="income", value={
        "kind": "DECIMAL", "number": "2000000"}, operator="LTE")
    both = {"op": "all", "condition_id": None, "reason": None,
            "children": [leaf("c1"), leaf("income")]}
    save_record(repository, record([condition(), income], key="income", logic=both))
    save_record(repository, general_record(key="disabled", enabled=False))
    result = public.recommend(repository, public.MatchingFacts(age_range=(27, 27)), today=TODAY)
    assert result["items"] == [] and "monthly_income" in result["missing_fields"]


def test_provider_interest_only_ranks_safe_candidates_and_budget_exhaustion_excludes(
        repository, monkeypatch):
    for key in ("low", "high", "exhausted"):
        save_record(repository, general_record(key=key))
    save_record(repository, record(key="special", title="자립준비청년 지원"))
    counts = {"notice:" + key: {"views": views, "source": "gov24",
                               "basis": "provider_cumulative_views", "asOf": None}
              for key, views in (("low", 10), ("high", 30), ("exhausted", 50), ("special", 1000))}
    monkeypatch.setattr(public, "load_popularity", lambda *_: counts)
    def signals(row, *, popularity=None):
        result = {"popularity": popularity}
        if row["policy_key"] == "notice:exhausted":
            result["budget"] = {"usedPercent": 100}
        return result
    monkeypatch.setattr(public, "policy_signals", signals)
    result = public.recommend(repository, public.MatchingFacts(), today=TODAY)
    assert [item["policy"]["id"] for item in result["items"]] == ["notice:high", "notice:low"]
    assert result["mode"] == "popular" and result["profile_sufficient"] is False
    assert "누적 조회수" in result["guidance"]


def test_real_collection_listings_flow_into_safe_recommendation_ranking_and_budget(repository):
    collection_records.create(repository.engine)
    for key, views, budget in (("low", "10", ""), ("high", "1,030", "예산 소진율: 72.5%"),
                               ("exhausted", "10000", "예산 소진율: 100%")):
        row = general_record(key=key)
        source = normalize_record({"서비스ID": key, "서비스명": "문화비 지원",
                                   "지원대상": "국민 누구나 신청 가능", "지원내용": budget,
                                   "신청기한": "상시", "상세조회URL": "https://www.gov.kr/notice"})
        row.update(policy_key=source.policy_key, source_json=source.model_dump(),
                   title=source.title)
        row["canonical_json"]["policy_key"] = source.policy_key
        row["canonical_json"]["conditions"][0]["source_field"] = "eligibility"
        save_record(repository, row)
        with repository.engine.begin() as connection:
            connection.execute(insert(collection_records).values(
                policy_key=source.policy_key, provider="gov24", external_id=key,
                listing_json={"조회수": views, "_views_observed_at": 1791200000},
                last_seen_at=1791200000))
    result = public.recommend(repository, public.MatchingFacts(), today=TODAY)
    assert [item["policy"]["id"] for item in result["items"]] == ["gov24:high", "gov24:low"]
    assert result["mode"] == "popular"
    policy = result["items"][0]["policy"]
    assert policy["popularity"]["views"] == 1030
    assert policy["popularity"]["basis"] == "provider_cumulative_views"
    assert policy["popularity"]["asOf"] is not None
    assert policy["budget"]["usedPercent"] == 72.5
    assert policy["budget"]["evidence"] == "예산 소진율: 72.5%"


@pytest.fixture
def client(tmp_path, repository, monkeypatch):
    app = create_app(Settings(_env_file=None, db_enabled=False, app_env="test",
                              auth_sqlite_path=tmp_path / "accounts.sqlite3"))
    monkeypatch.setattr(recommendations, "get_repository", lambda request: repository)
    save_record(repository, record())
    with TestClient(app, headers=HEADERS) as value:
        value.get("/v1/auth/me")
        engine = app.state.auth_service.engine
        initialize_finance_schema(engine)
        with engine.begin() as connection:
            for index, age in ((1, 27), (2, 15)):
                connection.execute(insert(accounts).values(
                    id=f"account-{index}", username=f"fixture{index}", password_hash="unused",
                    age=age, gender="undisclosed", region="서울", created_at=1))
                for scope in ("", "mobile:"):
                    connection.execute(insert(sessions).values(
                        token_hash=digest(scope + TOKENS[index]), account_id=f"account-{index}",
                        expires_at=int(time.time()) + 3600))
        FinancialProfileStore(engine).save("account-1", FinancialProfile.model_validate(FINANCIAL))
        value.repository = repository
        yield value


def test_cookie_and_bearer_use_db_facts_and_saved_finance_is_explicit_and_scoped(client):
    body = {"profile": {"region": "부산", "ageBand": "65세 이상"}}
    client.cookies.set("bokji_session", TOKENS[1])
    first = client.post("/v1/recommendations", json=body)
    assert first.status_code == 200 and first.headers["cache-control"] == "no-store"
    assert first.json()["profile_source"] == "account"
    assert first.json()["financial_source"] == "none"
    assert first.json()["items"][0]["matching"]["checks"][0]["state"] == "match"
    second = client.post("/v1/recommendations", json=body,
                         headers={"Authorization": "Bearer " + TOKENS[2]})
    assert second.status_code == 200 and second.json()["items"] == []
    saved = client.post("/v1/recommendations", json={"use_saved_financial_profile": True})
    assert saved.status_code == 200 and saved.json()["financial_source"] == "account"
    absent = client.post("/v1/recommendations", json={"use_saved_financial_profile": True},
                         headers={"Authorization": "Bearer " + TOKENS[2]})
    assert absent.status_code == 409
    with client.app.state.auth_service.engine.connect() as connection:
        rows = connection.execute(select(financial_profiles)).mappings().all()
        assert len(rows) == 1 and rows[0]["account_id"] == "account-1"


def test_guest_requests_do_not_create_account_db_and_invalid_credentials_do_not_fall_back(tmp_path):
    path = tmp_path / "never-created.sqlite3"
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_sqlite_path=path))
    with TestClient(app, headers=HEADERS) as client:
        assert client.post("/v1/recommendations", json={}).status_code == 503
        assert client.post("/v1/recommendations", json={"profile": {}}).status_code == 503
        assert not path.exists()


def test_guard_inputs_secrets_errors_and_revoked_token(client, monkeypatch):
    for body in ({"account_id": "private-identity"}, {"profile": {"age": "private-value"}},
                 {"limit": 4}, {"use_saved_financial_profile": "true"},
                 {"financialProfile": {"members": [{"earned_income": "private-value"}]}}):
        result = client.post("/v1/recommendations", json=body)
        assert result.status_code == 422 and "private" not in result.text
    for authorization in ("", "Bearer invalid", "Basic invalid"):
        assert client.post("/v1/recommendations", json={"profile": {}},
                           headers={"Authorization": authorization}).status_code == 401
    client.cookies.set("bokji_session", TOKENS[1])
    assert client.post("/v1/recommendations", json={
        "financialProfile": FINANCIAL, "use_saved_financial_profile": True}).status_code == 422
    monkeypatch.setattr(recommendations.public, "recommend", lambda *a, **k: (_ for _ in ()).throw(
        OperationalError("private SQL", {}, Exception())))
    result = client.post("/v1/recommendations", json={})
    assert result.status_code == 503 and "private" not in result.text
    client.headers.pop("X-Auth-Request")
    assert client.post("/v1/recommendations", json={}).status_code == 403
    client.headers.update(HEADERS)
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(sessions).values(expires_at=0))
    assert client.post("/v1/recommendations", json={"profile": {}}).status_code == 401
