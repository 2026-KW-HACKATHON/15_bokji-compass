import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select, update

from app.core.config import Settings
from app.main import create_app
from app.modules.admin.access import admin_grants
from app.modules.admin.provision import create_operator
from app.modules.auth.models import accounts, sessions
from app.modules.auth.schema import initialize_auth_schema


@pytest.fixture
def admin_client(tmp_path):
    db = tmp_path / "auth.sqlite3"
    engine = create_engine("sqlite:///" + db.as_posix())
    settings = Settings(_env_file=None, app_env="test", db_enabled=False, auth_sqlite_path=db)
    initialize_auth_schema(engine)
    account_id = create_operator(
        engine,
        "bokji_admin",
        "PrivateTestPassword42!",
        role="superadmin",
    )
    app = create_app(settings)
    with TestClient(app, headers={"X-Auth-Request": "1"}) as client:
        yield client, engine, account_id
    engine.dispose()


def login(client):
    return client.post(
        "/v1/auth/login", json={"username": "bokji_admin", "password": "PrivateTestPassword42!"}
    )


def test_admin_role_is_server_checked_and_revoked_immediately(admin_client):
    client, engine, account_id = admin_client
    assert client.get("/v1/admin/session").status_code == 401
    response = login(client)
    assert response.status_code == 200
    assert response.json()["user"]["is_admin"] is True
    assert client.get("/v1/admin/session").json() == {"is_admin": True, "admin_role": "superadmin"}
    assert client.get("/v1/admin/session").headers["cache-control"] == "no-store"
    with engine.begin() as connection:
        connection.execute(delete(admin_grants).where(admin_grants.c.account_id == account_id))
    assert (
        client.get("/v1/admin/session", headers={"X-Admin": "true", "X-Role": "admin"}).status_code
        == 403
    )
    assert client.get("/v1/auth/me").json()["user"]["is_admin"] is False
    assert (
        client.post(
            "/v1/auth/profile",
            json={
                "name": "회원",
                "age": 20,
                "gender": "undisclosed",
                "region": "서울",
                "is_admin": True,
            },
        ).status_code
        == 422
    )


def test_logout_expiration_and_forged_cookie_cannot_access_admin(admin_client):
    client, engine, _ = admin_client
    login(client)
    with engine.begin() as connection:
        connection.execute(update(sessions).values(expires_at=int(time.time()) - 1))
    assert client.get("/v1/admin/session").status_code == 401
    login(client)
    assert client.post("/v1/auth/logout").status_code == 200
    assert client.get("/v1/admin/session").status_code == 401
    assert (
        client.get("/v1/admin/session", headers={"Cookie": "bokji_session=" + "A" * 43}).status_code
        == 401
    )


def test_operator_creation_hashes_password_has_no_real_phone_and_never_takes_over_account(
    admin_client,
):
    client, engine, account_id = admin_client
    with engine.connect() as connection:
        row = (
            connection.execute(select(accounts).where(accounts.c.id == account_id)).mappings().one()
        )
    assert row["password_hash"] != "PrivateTestPassword42!"
    assert row["phone"] is None
    assert row["username"] == "bokji_admin"
    assert row["username_lookup"] is None and row["profile_ciphertext"] is None
    with pytest.raises(ValueError, match="이미 존재"):
        create_operator(engine, "bokji_admin", "DifferentPassword42!")
    with pytest.raises(ValueError):
        create_operator(engine, "another_admin", "short")


def test_superadmin_creates_only_qr_admin_and_subordinate_cannot_escalate(admin_client):
    client, engine, _ = admin_client
    payload = {
        "username": "qr_helper",
        "password": "HelperPassword42!",
        "confirm_password": "HelperPassword42!",
    }
    assert client.get("/v1/admin/accounts").status_code == 401
    assert client.post("/v1/admin/accounts", json=payload).status_code == 401
    login(client)
    assert (
        client.post("/v1/admin/accounts", json={**payload, "role": "superadmin"}).status_code == 422
    )
    assert (
        client.post("/v1/admin/accounts", json=payload, headers={"X-Auth-Request": ""}).status_code
        == 403
    )
    assert client.post("/v1/admin/accounts", json=payload).json() == {
        "username": "qr_helper",
        "admin_role": "qr_admin",
    }
    listing = client.get("/v1/admin/accounts")
    assert listing.status_code == 200
    assert all(set(item) == {"username", "role", "created_at"} for item in listing.json()["items"])
    assert client.post("/v1/admin/accounts", json=payload).status_code == 400
    client.post("/v1/auth/logout")
    subordinate = client.post(
        "/v1/auth/login", json={"username": "qr_helper", "password": payload["password"]}
    )
    assert subordinate.json()["user"]["admin_role"] == "qr_admin"
    assert client.get("/v1/admin/session").status_code == 200
    assert client.get("/v1/admin/accounts", headers={"X-Role": "superadmin"}).status_code == 403
    assert (
        client.post("/v1/admin/accounts", json={**payload, "username": "new_helper"}).status_code
        == 403
    )
    assert client.post("/v1/auth/profile", json={"admin_role": "superadmin"}).status_code == 422
    with engine.begin() as connection:
        connection.execute(
            delete(admin_grants).where(
                admin_grants.c.account_id.in_(
                    select(accounts.c.id).where(accounts.c.username == "qr_helper")
                )
            )
        )
    assert client.get("/v1/admin/accounts").status_code == 403
    assert client.get("/v1/admin/session").status_code == 403


def test_demotion_and_secret_validation_are_fail_closed(admin_client):
    client, engine, account_id = admin_client
    login(client)
    secret = "must-never-echo"
    response = client.post(
        "/v1/admin/accounts", json={"username": "a", "password": secret, "confirm_password": secret}
    )
    assert response.status_code == 422
    assert secret not in response.text
    with engine.begin() as connection:
        connection.execute(
            update(admin_grants)
            .where(admin_grants.c.account_id == account_id)
            .values(role="qr_admin")
        )
    assert client.get("/v1/admin/accounts").status_code == 403
    assert (
        client.post(
            "/v1/admin/accounts",
            json={
                "username": "demoted_admin",
                "password": "SomePassword42!",
                "confirm_password": "SomePassword42!",
            },
        ).status_code
        == 403
    )
    with engine.begin() as connection:
        connection.execute(update(admin_grants).values(role="unknown"))
    assert client.get("/v1/admin/session").status_code == 403


def test_existing_flat_grants_migrate_to_least_privilege(tmp_path):
    from app.modules.admin.access import admin_role

    engine = create_engine("sqlite:///" + (tmp_path / "legacy.sqlite3").as_posix())
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE auth_admin_grants (account_id VARCHAR(64) PRIMARY KEY, "
            "created_at INTEGER NOT NULL)"
        )
        connection.exec_driver_sql("INSERT INTO auth_admin_grants VALUES ('legacy-id', 1)")
    initialize_auth_schema(engine)
    initialize_auth_schema(engine)
    assert admin_role(engine, "legacy-id") == "qr_admin"
    engine.dispose()
