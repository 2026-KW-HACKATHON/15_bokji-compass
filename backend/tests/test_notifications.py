"""Account isolation, opt-in filtering, and live-session push enrollment."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, update

from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts, sessions
from app.modules.auth.service import AuthService, digest
from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.public import build_messages

PREFIX = "/v1/mobile/notifications"
TOKENS = ["A" * 43, "B" * 43]
PUSH = "ExpoPushToken[notification-test-device]"
CATEGORIES = ("policy_changes", "similar_policies", "eligible_policies", "application_results")


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "notification-api.sqlite3",
        )
    )
    with TestClient(app, headers={"X-Auth-Request": "1"}) as value:
        assert value.get("/v1/auth/me").status_code == 401
        engine = app.state.auth_service.engine
        with engine.begin() as connection:
            for index, token in enumerate(TOKENS):
                account = dict(
                    id=f"account-{index}",
                    username=f"notifications_{index}",
                    name="시험",
                    password_hash="unused",
                    age=40,
                    gender="undisclosed",
                    region="서울",
                    phone=None,
                    created_at=1,
                )
                connection.execute(insert(accounts).values(**account))
                connection.execute(
                    insert(sessions).values(
                        token_hash=AuthService.session_digest(token, mobile=True),
                        account_id=f"account-{index}",
                        expires_at=int(time.time()) + 3600,
                    )
                )
            connection.execute(
                insert(sessions).values(
                    token_hash=digest("web-session"),
                    account_id="account-0",
                    expires_at=int(time.time()) + 3600,
                )
            )
        value.headers["Authorization"] = "Bearer " + TOKENS[0]
        yield value


def event(category="policy_changes", account_id="account-0"):
    return NotificationEvent(
        account_id=account_id,
        category=category,
        policy_id="policy-test",
        title="공고 소식",
        body="변경된 공고를 확인해 주세요.",
    )


def register(client, token=PUSH):
    return client.post(PREFIX + "/devices", json={"push_token": token, "platform": "android"})


def test_preferences_are_opt_in_private_persistent_and_account_scoped(client):
    response = client.get(PREFIX + "/preferences")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    settings = response.json()
    assert settings == {"enabled": False, **dict.fromkeys(CATEGORIES, True)}
    settings.update(enabled=True, similar_policies=False)
    assert client.post(PREFIX + "/preferences", json=settings).json() == settings
    assert client.get(PREFIX + "/preferences").json() == settings
    client.headers["Authorization"] = "Bearer " + TOKENS[1]
    assert client.get(PREFIX + "/preferences").json()["enabled"] is False
    with TestClient(create_app(client.app.state.settings)) as reopened:
        assert (
            reopened.get(
                PREFIX + "/preferences",
                headers={
                    "Authorization": "Bearer " + TOKENS[0],
                },
            ).json()
            == settings
        )


def test_requires_mobile_bearer_and_post_guard(client):
    del client.headers["Authorization"]
    client.cookies.set("bokji_session", "web-session")
    assert client.get(PREFIX + "/preferences").status_code == 401
    client.headers["Authorization"] = "Bearer " + "Z" * 43
    assert client.get(PREFIX + "/preferences").status_code == 401
    client.headers["Authorization"] = "Bearer " + TOKENS[0]
    del client.headers["X-Auth-Request"]
    assert register(client).status_code == 403


def test_rejects_coerced_booleans_unknown_fields_and_redacts_tokens(client):
    settings = client.get(PREFIX + "/preferences").json()
    for invalid in ({**settings, "enabled": "false"}, {**settings, "account_id": "account-1"}):
        assert client.post(PREFIX + "/preferences", json=invalid).status_code == 422
    response = register(client, "secret-invalid-device-token")
    assert response.status_code == 422
    assert "secret-invalid-device-token" not in response.text


@pytest.mark.parametrize("category", CATEGORIES)
def test_messages_obey_master_and_each_category(client, category):
    assert register(client).json() == {"registered": True}
    store = client.app.state.notification_store
    assert build_messages(store, event(category)) == []
    settings = client.get(PREFIX + "/preferences").json()
    settings["enabled"] = True
    client.post(PREFIX + "/preferences", json=settings)
    messages = build_messages(store, event(category))
    assert len(messages) == 1
    assert messages[0]["to"] == PUSH
    assert messages[0]["channelId"] == category
    assert messages[0]["data"] == {"category": category, "policy_id": "policy-test"}
    settings[category] = False
    client.post(PREFIX + "/preferences", json=settings)
    assert build_messages(store, event(category)) == []


def test_enrollment_is_unique_transfers_device_and_disable_is_session_scoped(client):
    assert register(client).status_code == 200
    assert register(client).status_code == 200
    store = client.app.state.notification_store
    assert store.destinations("account-0") == [PUSH]
    client.headers["Authorization"] = "Bearer " + TOKENS[1]
    client.post(PREFIX + "/devices/disable", json={})
    assert store.destinations("account-0") == [PUSH]
    assert register(client).status_code == 200
    assert store.destinations("account-0") == []
    assert store.destinations("account-1") == [PUSH]
    assert client.post(PREFIX + "/devices/disable", json={}).json() == {"disabled": True}
    assert store.destinations("account-1") == []


@pytest.mark.parametrize("expired", [True, False])
def test_logged_out_or_expired_sessions_cannot_receive_pushes(client, expired):
    register(client)
    store = client.app.state.notification_store
    assert store.destinations("account-0") == [PUSH]
    if expired:
        with store.engine.begin() as connection:
            connection.execute(update(sessions).values(expires_at=0))
    else:
        assert client.post("/v1/mobile/auth/logout", json={}).status_code == 200
    assert store.destinations("account-0") == []
    assert client.get(PREFIX + "/preferences").status_code == 401
