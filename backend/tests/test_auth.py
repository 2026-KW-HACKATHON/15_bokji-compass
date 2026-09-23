from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, select, update

from app.api.auth import SignupInput
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts, challenges, sessions
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


def get_code(client, phone=PHONE):
    response = client.post("/v1/auth/phone/request", json={"phone": phone})
    assert response.status_code == 200, response.text
    return response.json()


def verify(client, challenge, phone=PHONE, code=None):
    return client.post(
        "/v1/auth/phone/verify",
        json={
            "phone": phone,
            "challenge_id": challenge["challenge_id"],
            "code": code or challenge["development_code"],
        },
    )


def signup_body(token, **overrides):
    return {
        "username": "tester",
        "name": "  홍길동  ",
        "password": PASSWORD,
        "confirm_password": PASSWORD,
        "age": 25,
        "gender": "undisclosed",
        "region": "서울",
        "phone": PHONE,
        "verification_token": token,
        **overrides,
    }


def register(client):
    proof = verify(client, get_code(client)).json()["verification_token"]
    response = client.post("/v1/auth/signup", json=signup_body(proof))
    assert response.status_code == 201, response.text
    return proof


def test_signup_login_session_logout_and_password_storage(client):
    proof = register(client)
    assert client.post("/v1/auth/signup", json=signup_body(proof)).status_code == 400
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
    assert account["password_hash"].startswith("scrypt$")
    assert PASSWORD not in account["password_hash"]
    assert token != session["token_hash"]
    assert client.post("/v1/auth/logout", json={}).status_code == 200
    client.cookies.set("bokji_session", token)
    assert client.get("/v1/auth/me").status_code == 401


def test_wrong_codes_exhaust_attempts_and_cannot_be_reused(client):
    challenge = get_code(client)
    wrong = "000000" if challenge["development_code"] != "000000" else "111111"
    for _ in range(5):
        assert verify(client, challenge, code=wrong).status_code == 400
    assert verify(client, challenge).status_code == 400


def test_code_bound_to_phone_and_proof_bound_to_phone(client):
    challenge = get_code(client)
    assert verify(client, challenge, phone="01099999999").status_code == 400
    proof = verify(client, challenge).json()["verification_token"]
    assert verify(client, challenge).status_code == 400
    assert (
        client.post(
            "/v1/auth/signup",
            json=signup_body(
                proof,
                phone="01099999999",
            ),
        ).status_code
        == 400
    )
    assert client.post("/v1/auth/signup", json=signup_body(proof)).status_code == 201


def test_expiry_resend_and_old_proof_invalidation(client, monkeypatch):
    clock = [2000000000]
    monkeypatch.setattr("app.modules.auth.service.time.time", lambda: clock[0])
    first = get_code(client)
    assert client.post("/v1/auth/phone/request", json={"phone": PHONE}).status_code == 429
    proof = verify(client, first).json()["verification_token"]
    clock[0] += 61
    second = get_code(client)
    assert client.post("/v1/auth/signup", json=signup_body(proof)).status_code == 400
    clock[0] += 301
    assert verify(client, second).status_code == 400
    third = get_code(client)
    proof = verify(client, third).json()["verification_token"]
    clock[0] += 301
    assert client.post("/v1/auth/signup", json=signup_body(proof)).status_code == 400


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
    response = client.post("/v1/auth/signup", json=signup_body("x" * 32, **overrides))
    assert response.status_code == 422
    assert PASSWORD not in response.text and "Mismatch42" not in response.text


def test_duplicate_account_and_transaction_rollback(client, monkeypatch):
    clock = [2000000000]
    monkeypatch.setattr("app.modules.auth.service.time.time", lambda: clock[0])
    register(client)
    other_phone = "01099999999"
    proof = verify(client, get_code(client, other_phone), other_phone).json()["verification_token"]
    body = signup_body(proof, phone=other_phone)
    assert client.post("/v1/auth/signup", json=body).status_code == 409
    body["username"] = "second_user"
    assert client.post("/v1/auth/signup", json=body).status_code == 201
    clock[0] += 61
    proof = verify(client, get_code(client)).json()["verification_token"]
    assert (
        client.post(
            "/v1/auth/signup",
            json=signup_body(
                proof,
                username="third_user",
            ),
        ).status_code
        == 409
    )


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


def test_concurrent_signup_consumes_proof_once(client):
    proof = verify(client, get_code(client)).json()["verification_token"]
    service = client.app.state.auth_service

    def attempt(username):
        try:
            service.register(SignupInput(**signup_body(proof, username=username)), username)
            return 201
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, ["first", "second"])) == [201, 400]


def test_csrf_header_required_and_untrusted_cors_denied(client):
    client.headers.pop("X-Auth-Request")
    assert client.post("/v1/auth/phone/request", json={"phone": PHONE}).status_code == 403
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


def test_production_never_issues_development_codes(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="production",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "unused.sqlite3",
        )
    )
    with TestClient(app, headers=HEADERS) as client:
        assert client.post("/v1/auth/phone/request", json={"phone": PHONE}).status_code == 503
    assert not (tmp_path / "unused.sqlite3").exists()


def test_disabled_sms_and_failed_delivery(client):
    client.app.state.settings.auth_sms_mode = "disabled"
    assert client.post("/v1/auth/phone/request", json={"phone": PHONE}).status_code == 503
    service = client.app.state.auth_service

    class FailingSender:
        def send_code(self, phone, code):
            raise RuntimeError("private provider credential")

    service.sender = FailingSender()
    response = client.post("/v1/auth/phone/request", json={"phone": PHONE})
    assert response.status_code == 503 and "credential" not in response.text
    with service.engine.connect() as connection:
        assert connection.execute(select(challenges)).first() is None


def test_production_sms_disabled_even_with_database_and_secure_cookie(client, monkeypatch):
    register(client)
    engine = client.app.state.auth_service.engine
    monkeypatch.setattr("app.main.create_database_engine", lambda _: engine)
    app = create_app(
        Settings(_env_file=None, app_env="production", db_enabled=True, db_password="test-only")
    )
    with TestClient(app, headers=HEADERS, base_url="https://testserver") as production:
        response = production.post("/v1/auth/phone/request", json={"phone": PHONE})
        assert response.status_code == 503 and "development_code" not in response.text
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
    body = signup_body("x" * 32)
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
    engine.dispose()
