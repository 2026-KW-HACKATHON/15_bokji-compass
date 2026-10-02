from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, select, update

from app.api.auth import SignupInput
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts, sessions
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import password_hash

HEADERS = {"X-Auth-Request": "1"}
PHONE = "01012345678"
PASSWORD = "ExamplePassword42!"


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "auth.sqlite3",
        )
    )
    with TestClient(app, headers=HEADERS) as value:
        yield value


def signup_body(**overrides):
    return {
        "username": "tester",
        "name": "  홍길동  ",
        "password": PASSWORD,
        "confirm_password": PASSWORD,
        "age": 25,
        "gender": "undisclosed",
        "region": "서울",
        **overrides,
    }


def register(client):
    response = client.post("/v1/auth/signup", json=signup_body())
    assert response.status_code == 201, response.text


def test_signup_login_session_logout_and_password_storage(client):
    register(client)
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 409
    assert client.get("/v1/auth/me").status_code == 401
    response = client.post("/v1/auth/login", json={"username": "TESTER", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["user"]["name"] == "홍길동"
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "samesite=lax" in response.headers["set-cookie"].lower()
    assert response.headers["cache-control"] == "no-store"
    user = client.get("/v1/auth/me").json()["user"]
    assert user["username"] == "tester" and user["age"] == 25
    assert user["name"] == "홍길동"
    assert "phone" not in user and "password_hash" not in user
    token = client.cookies.get("bokji_session")
    engine = client.app.state.auth_service.engine
    with engine.connect() as connection:
        account = connection.execute(select(accounts)).mappings().one()
        session = connection.execute(select(sessions)).mappings().one()
    assert account["username"] != "tester" and account["name"] is None
    assert account["age"] == 0 and account["gender"] == "encrypted"
    assert "홍길동" not in account["profile_ciphertext"]
    assert account["password_hash"].startswith("scrypt$")
    assert PASSWORD not in account["password_hash"]
    assert token != session["token_hash"]
    assert client.post("/v1/auth/logout", json={}).status_code == 200
    client.cookies.set("bokji_session", token)
    assert client.get("/v1/auth/me").status_code == 401


def test_phone_endpoints_removed(client):
    for path in ("request", "verify"):
        assert client.post("/v1/auth/phone/" + path, json={}).status_code == 404
    schema = client.get("/openapi.json").json()
    assert "phone" not in schema["components"]["schemas"]["SignupInput"]["properties"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"confirm_password": "Mismatch42!"},
        {"password": "short"},
        {"age": -1},
        {"age": 121},
        {"age": 20.5},
        {"gender": "invalid"},
        {"region": "전국"},
        {"username": "bad id"},
        {"name": ""},
        {"name": "   "},
        {"name": "가" * 51},
        {"phone": "0212345678"},
        {"password": "12345678", "confirm_password": "12345678"},
    ],
)
def test_server_validates_all_signup_fields_and_never_echoes_password(client, overrides):
    response = client.post("/v1/auth/signup", json=signup_body(**overrides))
    assert response.status_code == 422
    assert PASSWORD not in response.text and "Mismatch42" not in response.text


def test_duplicate_account_and_multiple_accounts_without_phone(client):
    register(client)
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 409
    assert (
        client.post("/v1/auth/signup", json=signup_body(username="second_user")).status_code == 201
    )
    with client.app.state.auth_service.engine.connect() as connection:
        assert all(row.phone is None for row in connection.execute(select(accounts)))


def test_login_rate_limit_and_generic_failure(client):
    register(client)
    for _ in range(10):
        response = client.post(
            "/v1/auth/login",
            json={
                "username": "tester",
                "password": "WrongPassword1",
            },
        )
        assert response.status_code == 401
    assert (
        client.post(
            "/v1/auth/login",
            json={
                "username": "tester",
                "password": PASSWORD,
            },
        ).status_code
        == 429
    )


def test_sessions_survive_app_restart_and_expire(client):
    register(client)
    client.post("/v1/auth/login", json={"username": "tester", "password": PASSWORD})
    with TestClient(create_app(client.app.state.settings)) as restarted:
        restarted.cookies.set("bokji_session", client.cookies.get("bokji_session"))
        assert restarted.get("/v1/auth/me").status_code == 200
        with restarted.app.state.auth_service.engine.begin() as connection:
            connection.execute(update(sessions).values(expires_at=0))
        assert restarted.get("/v1/auth/me").status_code == 401


def test_concurrent_signup_unique_username(client):
    client.get("/v1/auth/me")
    service = client.app.state.auth_service

    def attempt(index):
        try:
            service.register(SignupInput(**signup_body()), str(index))
            return 201
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, [1, 2])) == [201, 409]


def test_csrf_header_required_and_untrusted_cors_denied(client):
    client.headers.pop("X-Auth-Request")
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 403
    response = client.options(
        "/v1/auth/login",
        headers={
            "Origin": "https://untrusted.invalid",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Auth-Request,Content-Type",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_production_database_and_secure_cookie(client, monkeypatch):
    register(client)
    engine = client.app.state.auth_service.engine
    monkeypatch.setattr("app.main.create_database_engine", lambda _: engine)
    app = create_app(
        Settings(_env_file=None, app_env="production", db_enabled=True, db_password="test-only")
    )
    with TestClient(app, headers=HEADERS, base_url="https://testserver") as production:
        response = production.post("/v1/auth/phone/request", json={"phone": PHONE})
        assert response.status_code == 404
        response = production.post(
            "/v1/auth/login",
            json={
                "username": "tester",
                "password": PASSWORD,
            },
        )
        assert response.status_code == 200
        assert "secure" in response.headers["set-cookie"].lower()
        assert production.get("/v1/auth/me").status_code == 200


def test_wildcard_cors_rejected():
    with pytest.raises(ValidationError, match="explicit CORS"):
        Settings(_env_file=None, cors_origins=["*"])


def test_signup_requires_name(client):
    body = signup_body()
    del body["name"]
    assert client.post("/v1/auth/signup", json=body).status_code == 422


def test_legacy_account_upgrade_preserves_login_and_can_be_repeated(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    engine = create_engine("sqlite:///" + path.as_posix())
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE auth_accounts (id VARCHAR(64) PRIMARY KEY, "
            "username VARCHAR(32) NOT NULL UNIQUE, password_hash VARCHAR(256) NOT NULL, "
            "age INTEGER NOT NULL, gender VARCHAR(16) NOT NULL, region VARCHAR(32) NOT NULL, "
            "phone VARCHAR(16) NOT NULL UNIQUE, created_at INTEGER NOT NULL)"
        )
        connection.exec_driver_sql(
            "INSERT INTO auth_accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("legacy-id", "legacy", password_hash(PASSWORD), 25, "undisclosed", "서울", PHONE, 1),
        )
    app = create_app(
        Settings(_env_file=None, app_env="test", db_enabled=False, auth_sqlite_path=path)
    )
    with TestClient(app, headers=HEADERS) as client:
        result = client.post("/v1/auth/login", json={"username": "legacy", "password": PASSWORD})
        assert result.status_code == 200
        assert result.json()["user"]["name"] is None
        initialize_auth_schema(engine)
        user = client.get("/v1/auth/me").json()["user"]
        assert user["id"] == "legacy-id" and user["age"] == 25
        assert client.post("/v1/auth/signup", json=signup_body()).status_code == 201
        assert (
            client.post("/v1/auth/signup", json=signup_body(username="tester2")).status_code == 201
        )
        with engine.connect() as connection:
            old = (
                connection.execute(select(accounts).where(accounts.c.id == "legacy-id"))
                .mappings()
                .one()
            )
            assert old["phone"] is None
            assert old["username"] != "legacy" and old["name"] is None
            private = client.app.state.auth_service.cipher.decrypt_json(
                old["profile_ciphertext"], "account:" + old["id"]
            )
            assert private["phone"] == PHONE
        assert client.get("/v1/auth/me").json()["user"]["id"] == "legacy-id"
    engine.dispose()
