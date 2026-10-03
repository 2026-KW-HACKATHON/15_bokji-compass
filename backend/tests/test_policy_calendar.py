from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from app.api.policies import get_repository
from app.core.config import Settings
from app.main import create_app
from app.modules.storage.application_dates import application_period, application_schedule


@pytest.mark.parametrize(
    "period,start,end",
    [
        ("2026-10-01 ~ 2026-10-31", "2026-10-01", "2026-10-31"),
        ("신청기간 : 2026. 10. 1. ~ 2026. 10. 31.", "2026-10-01", "2026-10-31"),
        ("2026년 10월 1일 ~ 2026년 10월 31일", "2026-10-01", "2026-10-31"),
        ("2026.10.1.(목) 09:00 ~ 2026.10.31.(토) 18:00", "2026-10-01", "2026-10-31"),
        ("마감일: 2026-10-15", None, "2026-10-15"),
        ("2026-10-15까지", None, "2026-10-15"),
        ("접수 시작일: 2026-10-15", "2026-10-15", None),
        ("2028-02-29 ~ 2028-03-01", "2028-02-29", "2028-03-01"),
        ("2026-10-15 ~ 2026-10-15", "2026-10-15", "2026-10-15"),
    ],
)
def test_explicit_dates_only(period, start, end):
    assert application_schedule(period) == {
        "applicationStart": start,
        "applicationEnd": end,
        "scheduleStatus": "dated",
    }


@pytest.mark.parametrize(
    "period",
    [
        None,
        "",
        "2026-10-15",
        "10월 1일 ~ 10월 31일",
        "2026.8.7. ~ 8.13.",
        "2026-11-01 ~ 2026-10-01",
        "2026-02-29 ~ 2026-03-01",
        "2026-10-01 ~ 2026-10-31 / 추가 2026-11-03",
        "2026-10-01부터 예산 소진 시까지",
    ],
)
def test_ambiguous_invalid_and_partial_periods_are_not_invented(period):
    assert application_schedule(period) == {
        "applicationStart": None,
        "applicationEnd": None,
        "scheduleStatus": "unknown",
    }


@pytest.mark.parametrize(
    "period", ["상시", "상시 신청", "연중", "수시 접수", "상시 신청(예산 소진 시까지)"]
)
def test_ongoing_period_has_no_arbitrary_calendar_date(period):
    assert application_schedule(period)["scheduleStatus"] == "ongoing"
    assert application_schedule(period)["applicationEnd"] is None


def test_notice_dates_only_come_from_one_explicit_application_line():
    text = "발표: 2026-11-01\n신청기간 : 2026-10-01 ~ 2026-10-31\n출생: 1990년"
    period = application_period({"text": text})
    assert application_schedule(period)["applicationStart"] == "2026-10-01"
    assert application_period({"text": text + "\n접수기간: 2026-09-01 ~ 2026-09-30"}) == ""
    assert application_period({"text": "게시일: 2026-10-01"}) == ""


def test_calendar_http_boundary_and_no_auth_or_llm_requirement(monkeypatch):
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    with TestClient(app) as client:
        assert client.get("/v1/policies/calendar?month=2026-10").status_code == 503
        app.dependency_overrides[get_repository] = lambda: Mock()
        listing = Mock(
            return_value={
                "month": "2026-10",
                "items": [],
                "total": 0,
                "truncated": False,
                "undatedItems": [],
                "undatedTotal": 0,
            }
        )
        monkeypatch.setattr("app.modules.storage.catalog.list_calendar", listing)
        assert (
            client.get("/v1/policies/calendar?month=2026-10&q=지원&region=서울").status_code == 200
        )
        assert listing.call_args.kwargs == {
            "month": "2026-10",
            "q": "지원",
            "category": "",
            "region": "서울",
            "audience": "",
        }
        for query in (
            "",
            "month=2026-13",
            "month=2026-00",
            "month=abcd",
            "month=2026-10&q=" + "a" * 201,
        ):
            assert client.get("/v1/policies/calendar?" + query).status_code == 422
