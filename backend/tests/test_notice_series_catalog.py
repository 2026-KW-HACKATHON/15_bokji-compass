"""Notice series counts and pages are grouped without deleting any original source."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update

from app.api.policies import get_repository
from app.core.config import Settings
from app.main import create_app
from app.modules.normalization.raw import load_raw_policies
from app.modules.storage import catalog
from tests import test_smart_search as search_tests

repository = search_tests.repository


def add_actual_sources(repository, keys):
    from app.core.config import BACKEND_ROOT

    sources = {source.policy_key: source for source in load_raw_policies(
        BACKEND_ROOT / "database/seeds/kwangwoon_notices.json")}
    documents = repository.tables["condition_documents"]
    for key in keys:
        source = sources[key]
        search_tests.add_notice(repository, key, title=source.title,
                                organization=source.organization, fields=source.fields)
        value = source.model_dump()
        repository.sources[key + "-revision"] = value
        with repository.engine.begin() as connection:
            connection.execute(update(documents).where(documents.c.policy_key == key).values(
                source_json=value))


@pytest.mark.parametrize("first, latest, stage, deadline", [
    ("notice:4253e5a6fd2f73d7", "notice:87ed69653c19bc63", "application", "2025-11-18"),
    ("notice:338f7d7cf56ddf68", "notice:f7afd6bbf43568ef", "application", "2026-07-06"),
    ("notice:a17e3992897b2bd9", "notice:47910c775fcdbe44", "result", None),
])
def test_actual_reposts_and_successive_notices_keep_latest_update_and_both_details(
        repository, first, latest, stage, deadline):
    add_actual_sources(repository, [first, latest])
    result = catalog.list_policies(repository)
    assert result["total"] == 1
    policy = result["items"][0]
    assert policy["noticeGroup"]["noticeCount"] == 2
    assert policy["noticeGroup"]["latestStage"] == stage
    if deadline:
        assert policy["id"] == latest and policy["applicationEnd"] == deadline
    for key in (first, latest):
        detail = catalog.get_policy(repository, key)
        assert detail["id"] == key and detail["title"] == repository.sources[
            key + "-revision"]["title"]
        assert detail["noticeGroup"]["noticeCount"] == 2
    with repository.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(
            repository.tables["condition_documents"])) == 2


def test_actual_payment_rounds_group_without_collapsing_recruitment_rounds(repository):
    applications = ["notice:e67eb9ddcfe9cf3b", "notice:ba867a92a70591ee"]
    consent = "notice:2b4e8bb3c5e6d208"
    payments = ["notice:39cf9fb8657e3a25", "notice:f159a34d111e761c",
                "notice:2362a0558f5a67bc", "notice:4641579cd6165079"]
    add_actual_sources(repository, [*applications, consent, *payments])
    listing = catalog.list_policies(repository)
    assert listing["total"] == 4
    payment = next(item for item in listing["items"] if item.get("noticeGroup"))
    assert payment["noticeStage"] == "followup"
    assert payment["noticeGroup"]["latestStage"] == "followup"
    assert {item["id"] for item in payment["noticeGroup"]["notices"]} == set(payments)
    assert all("noticeGroup" not in item for item in listing["items"]
               if item["id"] in applications)
    assert len([item for item in listing["items"] if item["id"] in applications]) == 2
    assert catalog.list_calendar(repository, month="2026-04", q="국가장학금 지급",
                                  search_mode="literal")["total"] == 0


def add_series(repository, *, year=2026, semester=2, suffix="", organization="광운대학교"):
    base = f"{year}학년도 {semester}학기 국가근로장학금(사업)"
    notices = [
        ("application", "학생 신청기간 안내", "2026-05-21"),
        ("followup", "신청자 대상 희망근로기관(근로지) 신청 안내", "2026-08-06"),
        ("result", "장학생 선발 확정 안내", "2026-08-25"),
    ]
    for stage, title, published in notices:
        key = "notice:" + stage + suffix
        search_tests.add_notice(repository, key, title=f"[등록/장학] {base} {title}",
                                organization=organization, fields={
                                    "text": f"{base} {title}\n원문 내용 {stage}{suffix}",
                                    "published_date": published,
                                    "application_period": "2026-05-22 ~ 2026-06-29",
                                })


def test_grouping_precedes_count_and_pages_and_does_not_change_storage(repository):
    add_series(repository)
    search_tests.add_notice(repository, "unrelated", title="독립 교육 지원 신청 안내")
    result = catalog.list_policies(repository, limit=1, sort="name")
    assert result["total"] == 2 and result["nextCursor"] == "1"
    following = catalog.list_policies(repository, limit=1, offset=1, sort="name")
    assert following["total"] == 2 and following["nextCursor"] is None
    items = [*result["items"], *following["items"]]
    grouped = next(item for item in items if item.get("noticeGroup"))
    assert grouped["id"] == "notice:application"
    assert grouped["noticeGroup"]["noticeCount"] == 3
    assert grouped["noticeGroup"]["latestStage"] == "result"
    assert {item["stage"] for item in grouped["noticeGroup"]["notices"]} == {
        "application", "followup", "result"}
    with repository.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(
            repository.tables["condition_documents"])) == 4


def test_smart_literal_and_structured_search_show_one_business_cycle(repository):
    add_series(repository)
    for filters in ({"q": "국가근로장학금"},
                    {"q": "국가근로장학금", "search_mode": "literal"},
                    {"q": "광운대학교", "search_scope": "organization"},
                    {"category": "교육", "organization": "광운대학교"},
                    {"status": "selected"}):
        result = catalog.list_policies(repository, **filters)
        assert result["total"] == 1, filters
        assert result["items"][0]["noticeGroup"]["noticeCount"] == 3


def test_literal_application_query_keeps_result_history_before_status_filter(repository):
    add_series(repository)
    result = catalog.list_policies(repository, q="학생 신청기간", search_mode="literal",
                                   status="selected")
    assert result["total"] == 1
    assert result["items"][0]["id"] == "notice:application"
    assert result["items"][0]["noticeGroup"]["latestStage"] == "result"
    assert result["items"][0]["noticeGroup"]["noticeCount"] == 3
    calendar = catalog.list_calendar(repository, month="2026-06", q="학생 신청기간",
                                     search_mode="literal")
    assert calendar["total"] == 1
    assert calendar["items"][0]["noticeGroup"]["noticeCount"] == 3


def test_latest_trusted_source_alias_precedes_keyword_and_status_filters(repository):
    for key, title, day, published in (
        ("old-alias", "2026년 초기접수 신청 안내", 1, "2026-05-01"),
        ("current-alias", "2026년 장학생 선발 확정 안내", 2, "2026-08-01"),
    ):
        search_tests.add_notice(repository, key, title=title, day=day,
                                fields={"published_date": published})
        hostname = "www.kw.ac.kr" if key == "old-alias" else "m.kw.ac.kr"
        source = {**repository.sources[key + "-revision"], "source_url": (
            f"https://{hostname}/ko/life/notice.jsp?BoardMode=view&DUID=53187")}
        repository.sources[key + "-revision"] = source
        with repository.engine.begin() as connection:
            connection.execute(update(repository.tables["condition_documents"]).where(
                repository.tables["condition_documents"].c.policy_key == key).values(
                    source_json=source))
    listing = catalog.list_policies(repository)
    assert listing["total"] == 1 and listing["items"][0]["id"] == "current-alias"
    assert catalog.list_policies(repository, status="open")["total"] == 0
    assert catalog.list_policies(repository, status="selected")["total"] == 1
    for mode in ("smart", "literal"):
        assert catalog.list_policies(repository, q="초기접수", search_mode=mode)["total"] == 0
        assert catalog.list_calendar(repository, month="2026-10", q="초기접수",
                                     search_mode=mode)["total"] == 0


def test_category_filter_does_not_assign_ambiguous_result_to_only_visible_round(repository):
    for key, title, category in (
        ("round-one", "2026년 꿈드림 1차 학생 신청 안내", "교육"),
        ("round-two", "2026년 꿈드림 2차 학생 신청 안내", "일자리"),
        ("unassigned-result", "2026년 꿈드림 장학생 선발 확정 안내", "교육"),
    ):
        search_tests.add_notice(repository, key, title=title, category=category)
    listing = catalog.list_policies(repository, category="교육")
    assert listing["total"] == 2
    assert all("noticeGroup" not in item for item in listing["items"])
    selected = catalog.list_policies(repository, category="교육", status="selected")
    assert selected["total"] == 1 and selected["items"][0]["id"] == "unassigned-result"


def test_each_original_detail_keeps_its_title_content_and_full_group(repository):
    add_series(repository)
    for stage in ("application", "followup", "result"):
        detail = catalog.get_policy(repository, "notice:" + stage)
        assert detail["id"] == "notice:" + stage and detail["noticeStage"] == stage
        assert "원문 내용 " + stage in detail["content"]
        assert detail["noticeGroup"]["noticeCount"] == 3
        assert {notice["id"] for notice in detail["noticeGroup"]["notices"]} == {
            "notice:application", "notice:followup", "notice:result"}


def test_public_http_returns_one_group_and_each_original_detail(repository):
    add_series(repository)
    app = create_app(Settings(_env_file=None, db_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        response = client.get("/v1/policies", params={"q": "국가근로장학금", "limit": 1})
        assert response.status_code == 200
        listing = response.json()
        assert listing["total"] == 1 and listing["nextCursor"] is None
        assert listing["items"][0]["noticeGroup"]["noticeCount"] == 3
        for stage in ("application", "followup", "result"):
            response = client.get("/v1/policies/notice:" + stage)
            assert response.status_code == 200
            assert response.json()["noticeStage"] == stage
            assert response.json()["noticeGroup"]["noticeCount"] == 3


def test_different_year_semester_and_organization_are_not_collapsed(repository):
    add_series(repository)
    add_series(repository, year=2025, suffix="-last-year")
    add_series(repository, semester=1, suffix="-first-semester")
    add_series(repository, organization="서강대학교", suffix="-other-school")
    result = catalog.list_policies(repository, limit=20)
    assert result["total"] == 4
    assert all(item["noticeGroup"]["noticeCount"] == 3 for item in result["items"])


def test_hidden_related_notice_never_appears_in_group_metadata(repository):
    add_series(repository)
    documents = repository.tables["condition_documents"]
    with repository.engine.begin() as connection:
        connection.execute(update(documents).where(
            documents.c.policy_key == "notice:result").values(review_status="reviewed"))
    listing = catalog.list_policies(repository)
    assert listing["items"][0]["noticeGroup"]["latestStage"] == "followup"
    assert listing["items"][0]["noticeGroup"]["noticeCount"] == 2
    assert catalog.get_policy(repository, "notice:result") is None
    detail = catalog.get_policy(repository, "notice:application")
    assert all(item["id"] != "notice:result" for item in detail["noticeGroup"]["notices"])


def test_recruitment_closure_is_closed_rather_than_selection_completed(repository):
    search_tests.add_notice(repository, "notice:closed", title="2026년 꿈드림 모집 마감 안내")
    assert catalog.list_policies(repository, status="closed")["total"] == 1
    assert catalog.list_policies(repository, status="selected")["total"] == 0


def test_global_calendar_keeps_application_dates_but_not_applicant_steps_or_results(repository):
    add_series(repository)
    result = catalog.list_calendar(repository, month="2026-06")
    assert result["total"] == 1
    assert result["items"][0]["id"] == "notice:application"
    assert result["items"][0]["noticeGroup"]["noticeCount"] == 3
    only_result = catalog.list_calendar(repository, month="2026-06", q="선발 확정",
                                        search_mode="literal")
    assert only_result["total"] == 0 and only_result["undatedTotal"] == 0
