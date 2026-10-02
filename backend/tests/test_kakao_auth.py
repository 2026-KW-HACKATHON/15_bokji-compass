"""OAuth provider is replaced; real sessions/schema/transactions are exercised."""

from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select, update

from app.core.config import Settings
from app.main import create_app
from app.modules.auth import kakao
from app.modules.auth.models import accounts, kakao_flows, kakao_identities

HEADERS = {"X-Auth-Request": "1"}
PROFILE = {"name": "카카오회원", "age": 30, "gender": "undisclosed", "region": "서울"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    settings = Settings(
        _env_file=None,
        app_env="test",
        db_enabled=False,
        auth_sqlite_path=tmp_path / "kakao.sqlite3",
        kakao_client_id="test-app",
        kakao_client_secret="server-secret",
        kakao_redirect_uri="http://testserver/v1/auth/kakao/callback",
        kakao_web_url="http://testserver/",
    )
    # testserver is not an approved plaintext host; use localhost as a real development host.
    settings.kakao_redirect_uri = "http://localhost/v1/auth/kakao/callback"
    settings.kakao_web_url = "http://localhost/"
    monkeypatch.setattr(kakao, "exchange_identity", lambda *_: ("100:12345", "카카오별명"))
    with TestClient(create_app(settings), headers=HEADERS, base_url="http://localhost") as value:
        yield value


def start(client):
    response = client.post("/v1/auth/kakao/start", json={})
    assert response.status_code == 200, response.text
    assert "server-secret" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    url = urlsplit(response.json()["authorization_url"])
    assert url.netloc == "kauth.kakao.com"
    return parse_qs(url.query)["state"][0]


def callback(client, state, **params):
    return client.get(
        "/v1/auth/kakao/callback",
        params={"state": state, "code": "provider-code", **params},
        follow_redirects=False,
    )


def test_new_member_repeat_login_session_restart_and_logout(client):
    state = start(client)
    response = callback(client, state)
    assert response.headers["location"].endswith("#signup?kakao=complete")
    assert "provider-code" not in response.headers["location"]
    assert response.headers["referrer-policy"] == "no-referrer"
    assert client.get("/v1/auth/me").status_code == 401
    assert client.get("/v1/auth/kakao/pending").json() == {"name": "카카오별명"}
    # The original authorization state is one-use.
    assert callback(client, state).headers["location"].endswith("kakao=expired")
    assert client.post("/v1/auth/kakao/complete", json={**PROFILE, "age": -1}).status_code == 422
    result = client.post("/v1/auth/kakao/complete", json=PROFILE)
    assert result.status_code == 201, result.text
    user_id = result.json()["user"]["id"]
    assert client.post("/v1/auth/kakao/complete", json=PROFILE).status_code == 401
    assert client.get("/v1/auth/me").json()["user"]["id"] == user_id
    with TestClient(
        create_app(client.app.state.settings), base_url="http://localhost"
    ) as restarted:
        restarted.cookies.update(client.cookies)
        assert restarted.get("/v1/auth/me").json()["user"]["id"] == user_id
    client.post("/v1/auth/logout", json={})
    assert client.get("/v1/auth/me").status_code == 401
    response = callback(client, start(client))
    assert response.headers["location"].endswith("#home")
    assert client.get("/v1/auth/me").json()["user"]["id"] == user_id
    assert client.get("/v1/finance/profile").status_code == 200
    with client.app.state.auth_service.engine.connect() as connection:
        assert len(connection.execute(select(accounts)).all()) == 1
        assert len(connection.execute(select(kakao_identities)).all()) == 1


def test_state_requires_same_browser_expires_and_cannot_replay(client, monkeypatch):
    calls = []
    monkeypatch.setattr(kakao, "exchange_identity", lambda *_: calls.append(1))
    state = start(client)
    binding = client.cookies.get("bokji_kakao_flow")
    client.cookies.clear()
    assert callback(client, state).headers["location"].endswith("kakao=expired")
    assert calls == []
    client.cookies.set("bokji_kakao_flow", binding)
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(kakao_flows).values(expires_at=0))
    assert callback(client, state).headers["location"].endswith("kakao=expired")
    assert calls == []


def test_cancel_provider_failure_and_pending_expiry(client, monkeypatch):
    response = callback(client, start(client), error="access_denied")
    assert response.headers["location"].endswith("kakao=cancelled")
    assert client.get("/v1/auth/kakao/pending").status_code == 401

    def unavailable(*_):
        raise HTTPException(503, "private provider response")

    monkeypatch.setattr(kakao, "exchange_identity", unavailable)
    response = callback(client, start(client))
    assert response.headers["location"].endswith("kakao=failed")
    assert "private" not in response.text
    monkeypatch.setattr(kakao, "exchange_identity", lambda *_: ("12345", "이름"))
    callback(client, start(client))
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(kakao_flows).values(expires_at=0))
    assert client.post("/v1/auth/kakao/complete", json=PROFILE).status_code == 401


def test_no_automatic_merge_with_password_account(client):
    body = {
        **PROFILE,
        "username": "existing",
        "password": "ExamplePassword42!",
        "confirm_password": "ExamplePassword42!",
    }
    assert client.post("/v1/auth/signup", json=body).status_code == 201
    callback(client, start(client))
    assert client.post("/v1/auth/kakao/complete", json=PROFILE).status_code == 201
    with client.app.state.auth_service.engine.connect() as connection:
        assert len(connection.execute(select(accounts)).all()) == 2


def test_configuration_csrf_and_sensitive_input_rejection(client):
    assert client.get("/v1/auth/kakao/status").json() == {"enabled": True}
    client.headers.pop("X-Auth-Request")
    assert client.post("/v1/auth/kakao/start", json={}).status_code == 403
    assert client.post("/v1/auth/kakao/complete", json=PROFILE).status_code == 403
    client.headers.update(HEADERS)
    client.app.state.settings.kakao_client_secret = SecretStr("")
    assert client.get("/v1/auth/kakao/status").json() == {"enabled": False}
    assert client.post("/v1/auth/kakao/start", json={}).status_code == 503


def test_untrusted_or_cross_origin_redirect_configuration(client):
    for url in (
        "https://evil.example/callback",
        "http://example.com/callback",
        "//evil.example",
        "http://localhost/callback?next=x",
    ):
        client.app.state.settings.kakao_redirect_uri = url
        assert client.post("/v1/auth/kakao/start", json={}).status_code == 503


def test_provider_exchange_validates_identity_and_keeps_secret_server_side(monkeypatch):
    calls = []

    def provider(url, **kwargs):
        calls.append((url, kwargs))
        if "oauth/token" in url:
            return {"access_token": "private-token"}
        if "access_token_info" in url:
            return {"id": 123, "app_id": 100, "expires_in": 3600}
        return {"id": 123, "properties": {"nickname": "별명"}}

    monkeypatch.setattr(kakao, "request_json", provider)
    settings = Settings(
        _env_file=None,
        kakao_client_id="app",
        kakao_client_secret="secret",
        kakao_redirect_uri="http://localhost/api/v1/auth/kakao/callback",
    )
    assert kakao.exchange_identity(settings, "code") == ("100:123", "별명")
    assert calls[0][1]["data"]["client_secret"] == "secret"
    assert calls[1][1]["token"] == "private-token"
    for invalid in (None, True, -1, "123"):
        monkeypatch.setattr(
            kakao,
            "request_json",
            lambda url, **_: (
                {"access_token": "token"}
                if "oauth/token" in url
                else (
                    {"id": 123, "app_id": 100, "expires_in": 3600}
                    if "access_token_info" in url
                    else {"id": invalid}
                )
            ),
        )
        with pytest.raises(HTTPException):
            kakao.exchange_identity(settings, "code")


def test_different_kakao_apps_cannot_share_accounts(client, monkeypatch):
    callback(client, start(client))
    first = client.post("/v1/auth/kakao/complete", json=PROFILE).json()["user"]["id"]
    client.post("/v1/auth/logout", json={})
    client.app.state.settings.kakao_client_id = "another-app"
    monkeypatch.setattr(kakao, "exchange_identity", lambda *_: ("200:12345", "별명"))
    response = callback(client, start(client))
    assert response.headers["location"].endswith("kakao=complete")
    second = client.post("/v1/auth/kakao/complete", json=PROFILE).json()["user"]["id"]
    assert first != second


def test_rest_key_rotation_preserves_kakao_account(client):
    callback(client, start(client))
    first = client.post("/v1/auth/kakao/complete", json=PROFILE).json()["user"]["id"]
    client.post("/v1/auth/logout", json={})
    client.app.state.settings.kakao_client_id = "rotated-key-same-app"
    assert callback(client, start(client)).headers["location"].endswith("#home")
    assert client.get("/v1/auth/me").json()["user"]["id"] == first
