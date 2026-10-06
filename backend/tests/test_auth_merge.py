"""Plain member storage preserves accounts, roles, sessions and import boundaries."""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, insert, select, update

from app.core.config import Settings
from app.main import create_app
from app.modules.admin.access import admin_grants, admin_role
from app.modules.admin.provision import create_operator
from app.modules.auth.migration import import_sqlite_accounts
from app.modules.auth.models import accounts, kakao_identities, sessions
from app.modules.auth.privacy import PrivacyError
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import AuthService, digest, password_hash
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import financial_profiles

PASSWORD = "IntegrationPassword42!"
HEADERS = {"X-Auth-Request": "1"}
PROFILE = {"name": "새 이름", "age": 43, "gender": "female", "region": "부산"}


def initialized_store(path):
    engine = create_engine("sqlite:///" + path.as_posix())
    initialize_auth_schema(engine)
    return engine


def test_profile_update_preserves_legacy_private_phone_and_admin_role(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    engine = initialized_store(path)
    with engine.begin() as connection:
        connection.execute(
            insert(accounts).values(
                id="legacy-admin",
                username="legacy_admin",
                name="이전 이름",
                password_hash=password_hash(PASSWORD),
                phone="01012345678",
                age=25,
                gender="undisclosed",
                region="서울",
                created_at=1,
            )
        )
        connection.execute(
            insert(admin_grants).values(account_id="legacy-admin", role="superadmin", created_at=1)
        )
    app = create_app(
        Settings(_env_file=None, app_env="test", db_enabled=False, auth_sqlite_path=path)
    )
    with TestClient(app, headers=HEADERS) as client:
        login = client.post(
            "/v1/auth/login", json={"username": "legacy_admin", "password": PASSWORD}
        )
        assert login.status_code == 200
        assert login.json()["user"]["admin_role"] == "superadmin"
        response = client.post("/v1/auth/profile", json=PROFILE)
        assert response.status_code == 200
        assert response.json()["user"]["admin_role"] == "superadmin"
        assert response.json()["user"]["name"] == PROFILE["name"]
        with engine.connect() as connection:
            row = connection.execute(select(accounts)).mappings().one()
        assert row["username"] == "legacy_admin" and row["phone"] == "01012345678"
        assert {key: row[key] for key in PROFILE} == PROFILE
        assert row["profile_ciphertext"] is None and row["username_lookup"] is None
        assert admin_role(engine, "legacy-admin") == "superadmin"
        assert (
            client.post("/v1/auth/profile", json={**PROFILE, "admin_role": "qr_admin"}).status_code
            == 422
        )
    engine.dispose()


def test_profile_update_cannot_replace_tampered_private_data(tmp_path):
    engine = initialized_store(tmp_path / "tampered.sqlite3")
    identity = create_operator(engine, "test_admin", PASSWORD)
    with engine.begin() as connection:
        connection.execute(update(accounts).values(profile_ciphertext="not-authenticated"))
    service = AuthService(engine)
    from app.api.auth import ProfileInput

    with pytest.raises(PrivacyError):
        service.update_profile(identity, ProfileInput(**PROFILE))
    with engine.connect() as connection:
        assert (
            connection.execute(select(accounts.c.profile_ciphertext)).scalar_one()
            == "not-authenticated"
        )
    engine.dispose()


def test_operator_provisioning_stores_identity_and_rejects_duplicate_username(tmp_path):
    engine = initialized_store(tmp_path / "operators.sqlite3")
    identity = create_operator(engine, "test_admin", PASSWORD, role="superadmin")
    with engine.connect() as connection:
        row = connection.execute(select(accounts)).mappings().one()
    assert row["username"] == "test_admin" and row["name"] == "전시 관리자"
    assert row["phone"] is None
    assert row["username_lookup"] is None and row["profile_ciphertext"] is None
    service = AuthService(engine)
    _, user = service.login("test_admin", PASSWORD, "test")
    assert user["id"] == identity and user["username"] == "test_admin"
    assert service.check_username("test_admin", "test")["available"] is False
    with pytest.raises(ValueError, match="이미 존재"):
        create_operator(engine, "test_admin", "DifferentPassword42!")
    assert admin_role(engine, identity) == "superadmin"
    engine.dispose()


def test_sqlite_import_preserves_admin_roles_and_rejects_conflicts(tmp_path):
    source = initialized_store(tmp_path / "source.sqlite3")
    target = initialized_store(tmp_path / "target.sqlite3")
    identity = create_operator(source, "test_admin", PASSWORD, role="superadmin")
    assert import_sqlite_accounts(source, target) == 1
    assert admin_role(target, identity) == "superadmin"
    assert import_sqlite_accounts(source, target) == 0
    with source.begin() as connection:
        connection.execute(update(admin_grants).values(role="qr_admin"))
    with pytest.raises(PrivacyError, match="role conflicts"):
        import_sqlite_accounts(source, target)
    assert admin_role(target, identity) == "superadmin"
    source.dispose()
    target.dispose()


def test_repeated_import_does_not_restore_revoked_access_or_deleted_finance(tmp_path):
    source = initialized_store(tmp_path / "stale-source.sqlite3")
    target = initialized_store(tmp_path / "live-target.sqlite3")
    initialize_finance_schema(source)
    initialize_finance_schema(target)
    identity = create_operator(source, "stale_admin", PASSWORD, role="superadmin")
    with source.begin() as connection:
        connection.execute(
            insert(sessions).values(
                token_hash=digest("old-session"), account_id=identity, expires_at=2**31
            )
        )
        connection.execute(
            insert(financial_profiles).values(
                account_id=identity,
                profile_json='{"members":[]}',
                updated_at="old",
            )
        )
        connection.execute(
            insert(kakao_identities).values(subject="old-kakao", account_id=identity)
        )
    assert import_sqlite_accounts(source, target) == 1
    service = AuthService(target)
    assert service.me("old-session")["id"] == identity
    service.logout("old-session")
    with target.begin() as connection:
        for table in (admin_grants, sessions, financial_profiles, kakao_identities):
            connection.execute(delete(table).where(table.c.account_id == identity))
    assert import_sqlite_accounts(source, target) == 0
    with pytest.raises(HTTPException) as denied:
        service.me("old-session")
    assert denied.value.status_code == 401
    with target.connect() as connection:
        for table in (admin_grants, sessions, financial_profiles, kakao_identities):
            assert connection.execute(select(table)).first() is None
    source.dispose()
    target.dispose()


@pytest.mark.parametrize("kind", ["admin", "session", "kakao", "finance"])
def test_import_rejects_related_rows_for_accounts_absent_from_source(tmp_path, kind):
    source = initialized_store(tmp_path / "orphan-source.sqlite3")
    target = initialized_store(tmp_path / "protected-target.sqlite3")
    initialize_finance_schema(source)
    initialize_finance_schema(target)
    identity = create_operator(target, "target_admin", PASSWORD)
    imported = create_operator(source, "source_admin", PASSWORD)
    table, values = {
        "admin": (admin_grants, {"created_at": 1, "role": "qr_admin"}),
        "session": (sessions, {"token_hash": "orphan-token", "expires_at": 1}),
        "kakao": (kakao_identities, {"subject": "orphan-kakao"}),
        "finance": (financial_profiles, {"profile_json": "{}", "updated_at": "old"}),
    }[kind]
    with source.begin() as connection:
        connection.execute(insert(table).values(account_id=identity, **values))
    with pytest.raises(PrivacyError, match="Source ownership"):
        import_sqlite_accounts(source, target)
    with target.connect() as connection:
        assert connection.execute(select(accounts).where(accounts.c.id == imported)).first() is None
    source.dispose()
    target.dispose()
