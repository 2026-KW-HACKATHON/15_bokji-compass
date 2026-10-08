"""Public facets use complete results and never include private publisher metadata."""

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.api.policies import get_repository
from app.core.config import Settings
from app.main import create_app
from app.modules.storage import catalog
from app.modules.storage.explorer_filters import matches_age, matches_eligibility, notice_status
from tests.test_policy_search import add_policy, ids, repository  # noqa: F401
from tests.test_matching import record


def test_status_is_date_based_or_explicit_and_never_guesses_payment():
    today = date(2026, 10, 8)
    row = {"source_json": {"fields": {}}}
    assert notice_status({"applicationStart": "2026-10-09"}, row, today) == "upcoming"
    assert notice_status({"applicationEnd": "2026-10-07"}, row, today) == "closed"
    assert notice_status({"applicationStart": "2026-10-08", "applicationEnd": "2026-10-08"}, row, today) == "open"
    assert notice_status({"applicationEnd": "2026-10-08"}, row, today) == "unknown"
    assert notice_status({"scheduleStatus": "ongoing"}, row, today) == "open"
    row["source_json"]["fields"]["notice_status"] = "paid"
    assert notice_status({}, row, today) == "paid"


def test_age_multiple_bands_zero_boundaries_and_unknown():
    row = {"draft_json": {"overview": {"age_conditions": {"status": "specified", "text": "만 19~24세"}}}}
    assert matches_age(row, ["0-18", "19-24"])
    assert not matches_age(row, ["0-18", "65-120"])
    assert matches_age(row, [], 0, 19)
    assert not matches_age(row, [], 0, 18)
    row["draft_json"]["overview"]["age_conditions"]["text"] = "65세 이상"
    assert matches_age(row, ["65-120"])
    assert not matches_age(row, [], 0, 30)
    row["draft_json"]["overview"]["age_conditions"]["status"] = "unknown"
    assert not matches_age(row, ["19-24"])
    row["draft_json"]["overview"]["age_conditions"]["status"] = "unrestricted"
    assert matches_age(row, [], 0, 0)


def test_eligibility_reuses_validated_member_logic_and_rejects_unknown():
    current = date(2026, 10, 8)
    assert matches_eligibility(record(), {"age": 20, "region": "서울"}, current)
    assert not matches_eligibility(record(), {"age": 18}, current)
    assert not matches_eligibility(record(), {"age": None}, current)
    assert not matches_eligibility(record(enabled=False), {"age": 20}, current)
    assert not matches_eligibility(record(), None, current)
    closed = record()
    closed["source_json"]["fields"]["notice_status"] = "closed"
    assert not matches_eligibility(closed, {"age": 20}, current)


def test_http_provider_age_status_filters_before_pagination_and_options(repository):
    for key, org, age, period in [
        ("gov24:young1", "서울시", "19~24세", "상시"),
        ("gov24:young2", "서울시", "19~24세", "상시"),
        ("bokjiro:old", "부산시", "65세 이상", "상시"),
        ("notice:closed", "광운대학교", "0~18세", "2001-01-01 ~ 2001-12-31"),
    ]:
        add_policy(repository, key, organization=org, fields={"application_period": period})
        details = repository.tables["policy_revision_details"]
        with repository.engine.begin() as connection:
            connection.execute(update(details).where(details.c.revision_id == key + "-revision")
                .values(draft_json={"overview": {"age_conditions": {"status": "specified", "text": age}}}))
    add_policy(repository, "gov24:hidden", organization="비공개기관", published=False)
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        filters = {"provider": "gov24", "organization": "서울시", "status": "open", "age_bands": "19-24", "limit": 1}
        first = client.get('/v1/policies', params=filters).json()
        second = client.get('/v1/policies', params={**filters, "cursor": 1}).json()
        assert first["total"] == second["total"] == 2
        assert ids(first) | ids(second) == {"gov24:young1", "gov24:young2"}
        assert first["nextCursor"] == "1" and second["nextCursor"] is None
        assert client.get('/v1/policies', params={"age_min": 0, "age_max": 18}).json()["total"] == 1
        assert client.get('/v1/policies', params={"status": "paid"}).json()["total"] == 0
        options = client.get('/v1/policies/options').json()["providers"]
        assert {item["id"] for item in options} == {"gov24", "bokjiro", "notice"}
        assert "비공개기관" not in str(options)
        for params in ({"age_min": 30, "age_max": 0}, {"age_bands": "bad"}, {"status": "bad"}, {"age_min": -1}):
            assert client.get('/v1/policies', params=params).status_code == 422
        assert client.get('/v1/policies', params={"eligible_only": "true"}).status_code == 503
