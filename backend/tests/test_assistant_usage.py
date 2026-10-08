"""Assistant use is unlimited while authentication, consent and ownership remain enforced."""

from unittest.mock import Mock

import pytest

from app.api import recommendations
from tests import test_application_preparation as preparation_tests
from tests import test_assistant_dialogue_api as dialogue_tests
from tests import test_monitoring_api as monitoring_tests

client = monitoring_tests.client


def reject_usage_throttle(client, monkeypatch):
    throttle = Mock(side_effect=AssertionError("Assistant usage must not be throttled"))
    monkeypatch.setattr(client.app.state.auth_service, "throttle", throttle)
    return throttle


@pytest.mark.parametrize("guest", [False, True])
def test_more_than_sixty_conversations_in_one_minute_are_available(client, monkeypatch, guest):
    throttle = reject_usage_throttle(client, monkeypatch)
    if guest:
        client.cookies.clear()
    path = "/v1/assistant/chat/dialogue" if guest else dialogue_tests.PREFIX
    for _ in range(65):
        response = client.post(path, json={"question": "집에 누수가 생겼어"})
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        assert not response.json()["eligibility_decided"]
        if guest:
            assert not response.json()["can_save_profile"]
    throttle.assert_not_called()


def test_repeated_confirmed_dialogue_saves_have_no_usage_quota(client, monkeypatch):
    throttle = reject_usage_throttle(client, monkeypatch)
    for index in range(22):
        assert client.post("/v1/monitoring/delete", json={}).status_code == 200
        result = dialogue_tests.owned_home(client)
        result = dialogue_tests.answer(client, result, 1980 + index)
        response = dialogue_tests.save(client, result)
        assert response.status_code == 200, response.text
        assert response.json()["profile"]["building_year"] == 1980 + index
    throttle.assert_not_called()
    # Removing a usage limit does not authorize unconfirmed persistence.
    assert dialogue_tests.save(client, result, confirmed=False).status_code == 422


@pytest.mark.parametrize("operation,count", [
    ("profile", 22), ("preferences", 22), ("refresh", 7),
    ("feedback", 32), ("preparation", 122),
])
def test_ai_assistant_actions_have_no_usage_quota(client, monkeypatch, operation, count):
    preparation_tests.seed_api(client)
    throttle = reject_usage_throttle(client, monkeypatch)
    for index in range(count):
        if operation == "profile":
            response = monitoring_tests.save(client)
        elif operation == "preferences":
            response = client.post("/v1/monitoring/preferences", json={"enabled": False})
        elif operation == "refresh":
            response = client.post("/v1/monitoring/refresh", json={})
        elif operation == "feedback":
            response = client.post("/v1/monitoring/candidates/feedback", json={
                "policy_id": "policy-1", "need_id": "housing_repair",
                "reason": "not_interested" if index % 2 == 0 else None,
            })
        else:
            response = client.post(preparation_tests.PATH, json={
                "policy_id": "policy-1", "need_id": "housing_repair",
                "revision_id": "revision-1", "document_id": "form",
                "prepared": index % 2 == 0,
            })
        assert response.status_code == 200, response.text
    throttle.assert_not_called()


def test_repeated_account_recommendations_have_no_usage_quota(client, monkeypatch):
    throttle = reject_usage_throttle(client, monkeypatch)
    monkeypatch.setattr(recommendations, "get_repository", lambda request: object())
    generated = Mock(return_value={"items": [], "eligibility_decided": False})
    monkeypatch.setattr(recommendations.public, "recommend", generated)
    for _ in range(25):
        response = client.post("/v1/recommendations", json={})
        assert response.status_code == 200, response.text
        assert response.json()["profile_source"] == "account"
    assert generated.call_count == 25
    throttle.assert_not_called()
    assert client.post("/v1/recommendations", json={"limit": 0}).status_code == 422


def test_login_protection_remains_separate_from_assistant_usage(client):
    for _ in range(10):
        response = client.post("/v1/auth/login", json={
            "username": "missing_usage_test", "password": "Password123!",
        })
        assert response.status_code == 401
    response = client.post("/v1/auth/login", json={
        "username": "missing_usage_test", "password": "Password123!",
    })
    assert response.status_code == 429
