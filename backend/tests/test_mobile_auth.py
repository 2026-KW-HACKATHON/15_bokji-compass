"""Native sessions must remain revocable and isolated from cookie authentication."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select, update

from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts, sessions
from app.modules.auth.service import digest, password_hash

PASSWORD = "ExamplePassword42!"
HEADERS = {"X-Auth-Request": "1"}


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "mobile.sqlite3",
        )
    )
    with TestClient(app, headers=HEADERS) as value:
        assert value.get("/v1/auth/me").status_code == 401
        with app.state.auth_service.engine.begin() as connection:
            for index in (1, 2):
                connection.execute(
                    insert(accounts).values(
                        **dict(
                            id=f"mobile-{index}",
                            username=f"mobile_{index}",
                            name="시험 사용자",
                            password_hash=password_hash(PASSWORD),
                            age=30,
                            gender="undisclosed",
                            region="서울",
                            phone=f"0100000000{index}",
                            created_at=1,
                        )
                    )
                )
        yield value


def login(client, username="mobile_1"):
    response = client.post(
        "/v1/mobile/auth/login",
        json={
            "username": username,
            "password": PASSWORD,
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert "set-cookie" not in response.headers
    return response.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_mobile_restart_expiry_logout_and_hashed_storage(client):
    token = login(client)
    assert client.get("/v1/mobile/auth/me", headers=auth(token)).json()["user"]["id"] == "mobile-1"
    with client.app.state.auth_service.engine.connect() as connection:
        stored = connection.execute(select(sessions)).mappings().one()
    assert stored["token_hash"] == digest("mobile:" + token)
    with TestClient(create_app(client.app.state.settings)) as restarted:
        assert restarted.get("/v1/mobile/auth/me", headers=auth(token)).status_code == 200
    assert client.post("/v1/mobile/auth/logout", headers=auth(token), json={}).status_code == 200
    assert client.get("/v1/mobile/auth/me", headers=auth(token)).status_code == 401
    assert client.post("/v1/mobile/auth/logout", headers=auth(token), json={}).status_code == 200
    token = login(client)
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(sessions).values(expires_at=0))
    assert client.get("/v1/mobile/auth/me", headers=auth(token)).status_code == 401


def test_cookie_and_bearer_are_not_interchangeable_and_no_fallback(client):
    native = login(client)
    client.cookies.set("bokji_session", native)
    assert client.get("/v1/auth/me").status_code == 401
    assert client.get("/v1/finance/profile").status_code == 401
    client.cookies.clear()
    assert (
        client.post(
            "/v1/auth/login",
            json={
                "username": "mobile_1",
                "password": PASSWORD,
            },
        ).status_code
        == 200
    )
    cookie = client.cookies.get("bokji_session")
    assert client.get("/v1/mobile/auth/me").status_code == 401
    assert client.get("/v1/mobile/auth/me", headers=auth(cookie)).status_code == 401
    assert client.get("/v1/finance/profile", headers=auth(cookie)).status_code == 401
    for header in ("Basic abc", "Bearer invalid", "Bearer", ""):
        response = client.get("/v1/finance/profile", headers={"Authorization": header})
        assert response.status_code == 401
    assert client.get("/v1/finance/profile").status_code == 200
    assert client.post("/v1/mobile/auth/logout", headers=auth(native), json={}).status_code == 200
    assert client.get("/v1/auth/me").status_code == 200


def test_mobile_finance_consent_isolation_delete_and_revocation(client):
    one, two = login(client), login(client, "mobile_2")
    body = {"profile": {"household_size": 1, "members": [{"age": 30}]}}
    assert client.post("/v1/finance/profile", headers=auth(one), json=body).status_code == 422
    body["consent"] = True
    saved = client.post("/v1/finance/profile", headers=auth(one), json=body)
    assert saved.status_code == 200
    assert saved.headers["cache-control"] == "no-store"
    assert client.get("/v1/finance/profile", headers=auth(two)).json()["profile"] is None
    loaded = client.get("/v1/finance/profile", headers=auth(one)).json()
    assert loaded["profile"]["members"][0]["age"] == 30
    deleted = client.post("/v1/finance/profile/delete", headers=auth(one), json={})
    assert deleted.json() == {"deleted": True}
    assert client.get("/v1/finance/profile", headers=auth(one)).json()["profile"] is None
    client.post("/v1/mobile/auth/logout", headers=auth(one), json={})
    assert client.get("/v1/finance/profile", headers=auth(one)).status_code == 401


def test_mobile_login_validation_guard_and_throttle(client):
    response = client.post("/v1/mobile/auth/login", json={"username": "bad!", "password": "secret"})
    assert response.status_code == 422 and "secret" not in response.text
    assert response.headers["cache-control"] == "no-store"
    for _ in range(10):
        assert (
            client.post(
                "/v1/mobile/auth/login",
                json={
                    "username": "mobile_1",
                    "password": "WrongPassword1",
                },
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/v1/mobile/auth/login",
            json={
                "username": "mobile_1",
                "password": PASSWORD,
            },
        ).status_code
        == 429
    )
    client.headers.pop("X-Auth-Request")
    assert (
        client.post(
            "/v1/mobile/auth/login",
            json={
                "username": "mobile_2",
                "password": PASSWORD,
            },
        ).status_code
        == 403
    )
