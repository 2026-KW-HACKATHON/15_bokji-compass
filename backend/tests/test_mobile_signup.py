"""Native signup and real DB handoff contracts, with only Kakao/mail replaced."""

from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.api.mobile_oauth import challenge
from app.main import create_app
from app.modules.auth.models import accounts, mobile_oauth_flows
from tests.email_helpers import SIGNUP_CONSENT, mailbox
from tests.test_auth import signup_body
from tests.test_kakao_auth import client as kakao_client_fixture

client = kakao_client_fixture

ROOT = "/v1/mobile/auth/kakao"
VERIFIER = "a" * 64


def begin(client):
    response = client.post(ROOT + "/start", json={"code_challenge": challenge(VERIFIER)})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    response = client.get(body["authorization_url"], follow_redirects=False)
    assert response.status_code == 303
    assert urlsplit(response.headers["location"]).netloc == "kauth.kakao.com"
    assert "HttpOnly" in response.headers["set-cookie"]
    assert parse_qs(urlsplit(response.headers["location"]).query)["state"] == [
        "mobile." + body["flow"]
    ]
    return body["flow"]


def callback(client, flow, **values):
    response = client.get(
        "/v1/auth/kakao/callback",
        params={
            "state": "mobile." + flow,
            "code": "kakao-provider-code",
            **values,
        },
        follow_redirects=False,
    )
    url = urlsplit(response.headers["location"])
    assert (url.scheme, url.netloc, url.path) == ("bokji-compass", "auth", "/callback")
    assert "access_token" not in url.query and "kakao-provider-code" not in url.query
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "bokji_session" not in response.headers.get("set-cookie", "")
    return {key: value[0] for key, value in parse_qs(url.query).items()}


def exchange(client, value, verifier=VERIFIER):
    return client.post(ROOT + "/exchange", json={**value, "code_verifier": verifier})


def pending(client):
    response = exchange(client, callback(client, begin(client)))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "signup_required"
    return response.json()["signup_token"]


def complete(client, token, **values):
    return client.post(
        ROOT + "/complete",
        json={
            "signup_token": token,
            "email": "native@example.com",
            "consent": {**SIGNUP_CONSENT, "profile": False},
            **values,
        },
    )


def test_native_signup_existing_login_restart_and_bearer_isolation(client):
    token = pending(client)
    response = complete(client, token)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["user"]["name"] is None
    assert "set-cookie" not in response.headers
    assert complete(client, token).status_code == 401
    access = result["access_token"]
    headers = {"Authorization": "Bearer " + access}
    assert (
        client.get("/v1/mobile/auth/me", headers=headers).json()["user"]["id"]
        == result["user"]["id"]
    )
    assert client.get("/v1/auth/me", headers=headers).status_code == 401
    with TestClient(
        create_app(client.app.state.settings), base_url="http://localhost"
    ) as restarted:
        assert restarted.get("/v1/mobile/auth/me", headers=headers).status_code == 200
    assert client.post("/v1/mobile/auth/logout", headers=headers).status_code == 200
    assert client.get("/v1/mobile/auth/me", headers=headers).status_code == 401
    again = exchange(client, callback(client, begin(client))).json()
    assert again["status"] == "signed_in"
    assert again["user"]["id"] == result["user"]["id"]
    with client.app.state.auth_service.engine.connect() as connection:
        assert len(connection.execute(select(accounts)).all()) == 1


def test_web_kakao_account_is_the_same_native_account(client):
    from tests.test_kakao_auth import callback as web_callback
    from tests.test_kakao_auth import start as web_start

    web_callback(client, web_start(client))
    user = client.post(
        "/v1/auth/kakao/complete",
        json={
            "email": "web@example.com",
            "consent": SIGNUP_CONSENT,
        },
    ).json()["user"]
    result = exchange(client, callback(client, begin(client))).json()
    assert result["status"] == "signed_in" and result["user"]["id"] == user["id"]


def test_wrong_pkce_code_browser_binding_and_replay_are_rejected(client):
    flow = begin(client)
    value = callback(client, flow)
    assert exchange(client, value, "b" * 64).status_code == 401
    assert exchange(client, {**value, "code": "x" * 43}).status_code == 401
    assert exchange(client, value).status_code == 200
    assert exchange(client, value).status_code == 401
    flow = begin(client)
    client.cookies.clear()
    assert callback(client, flow)["error"] == "expired"


@pytest.mark.parametrize(
    "reason,expected", [("access_denied", "cancelled"), ("server_error", "failed")]
)
def test_provider_cancel_and_error_return_to_app_without_session(client, reason, expected):
    assert callback(client, begin(client), error=reason)["error"] == expected
    with client.app.state.auth_service.engine.connect() as connection:
        assert connection.execute(select(accounts)).first() is None


def test_expiry_cancel_and_fixed_redirect(client):
    assert (
        client.post(
            ROOT + "/start",
            json={"code_challenge": challenge(VERIFIER), "redirect_uri": "evil://auth"},
        ).status_code
        == 422
    )
    flow = begin(client)
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(mobile_oauth_flows).values(expires_at=1))
    assert callback(client, flow)["error"] == "expired"
    flow = begin(client)
    assert (
        client.post(ROOT + "/cancel", json={"flow": flow, "code_verifier": VERIFIER}).status_code
        == 200
    )
    # Cancelled native state cannot mint a handoff even if Kakao later returns.
    assert callback(client, flow)["error"] == "expired"
    assert client.get("/v1/auth/me").status_code == 401


def test_new_signup_requires_email_current_consent_and_pending_proof(client):
    token = pending(client)
    assert complete(client, token, email="bad").status_code == 422
    assert (
        complete(client, token, consent={**SIGNUP_CONSENT, "collection": False}).status_code == 422
    )
    assert complete(client, "z" * 43).status_code == 401
    assert client.post(ROOT + "/cancel-signup", json={"signup_token": token}).status_code == 200
    assert complete(client, token).status_code == 401


def test_native_email_signup_without_cookies_requires_exact_verified_email(client):
    email = "tester@example.com"
    response = client.post("/v1/mobile/auth/email/request", json={"email": email})
    assert response.status_code == 200, response.text
    assert "set-cookie" not in response.headers and mailbox[email] not in response.text
    token = response.json()["verification_token"]
    body = {**signup_body(), "verification_token": token}
    assert client.post("/v1/mobile/auth/signup", json=body).status_code == 401
    client.cookies.clear()
    verified = client.post(
        "/v1/mobile/auth/email/verify",
        json={"email": email, "verification_token": token, "code": mailbox[email]},
    )
    assert verified.status_code == 200
    assert (
        client.post(
            "/v1/mobile/auth/signup", json={**body, "email": "other@example.com"}
        ).status_code
        == 401
    )
    assert client.post("/v1/mobile/auth/signup", json=body).status_code == 201
    assert (
        client.post("/v1/mobile/auth/signup", json={**body, "username": "another"}).status_code
        == 401
    )
    logged = client.post(
        "/v1/mobile/auth/login", json={"username": body["username"], "password": body["password"]}
    )
    assert logged.status_code == 200 and logged.json()["token_type"] == "Bearer"
