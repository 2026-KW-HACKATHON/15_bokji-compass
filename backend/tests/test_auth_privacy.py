"""Keyless login and one-time restoration of older encrypted member data."""

import base64
import json
import secrets
import time
from urllib.parse import parse_qs, urlsplit

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select, update

from app.core.config import Settings
from app.main import create_app
from app.modules.admin.access import admin_grants, admin_role
from app.modules.auth import kakao
from app.modules.auth.migration import (
    ensure_plaintext_storage,
    import_sqlite_accounts,
    restore_plaintext_data,
)
from app.modules.auth.models import accounts, kakao_flows, kakao_identities, sessions
from app.modules.auth.privacy import LegacyCipher, PrivacyError
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import AuthService, digest, password_hash
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import financial_profiles

HEADERS = {"X-Auth-Request": "1"}
PROFILE = {"name": "테스트회원", "age": 35, "gender": "female", "region": "서울"}
PASSWORD = "PrivatePassword42!"
FINANCE = {"household_size": 1, "members": [{"age": 35, "earned_income": 1234567}]}


def legacy_settings():
    return Settings(
        _env_file=None,
        auth_encryption_keys=json.dumps({"primary": base64.urlsafe_b64encode(b"e" * 32).decode()}),
        auth_lookup_key=base64.urlsafe_b64encode(b"l" * 32).decode(),
    )


def encrypted(value, context):
    # Only test fixtures write the obsolete ciphertext format.
    nonce = secrets.token_bytes(12)
    payload = nonce + AESGCM(b"e" * 32).encrypt(nonce, value.encode(), context.encode())
    return "enc:v1:primary:" + base64.urlsafe_b64encode(payload).decode()


def store(path):
    engine = create_engine("sqlite:///" + path.as_posix())
    initialize_auth_schema(engine)
    initialize_finance_schema(engine)
    return engine


def seed_encrypted(engine):
    private = {"username": "legacy_user", "phone": "01012345678", **PROFILE}
    with engine.begin() as connection:
        connection.execute(
            insert(accounts).values(
                id="legacy",
                username="u_obsolete",
                name=None,
                age=0,
                gender="encrypted",
                region="encrypted",
                phone=None,
                created_at=1,
                password_hash=password_hash(PASSWORD),
                username_lookup=LegacyCipher(legacy_settings()).lookup("legacy_user"),
                profile_ciphertext=encrypted(json.dumps(private), "account:legacy"),
            )
        )
        connection.execute(
            insert(admin_grants).values(
                account_id="legacy",
                role="superadmin",
                created_at=1,
            )
        )
        connection.execute(
            insert(sessions).values(
                token_hash=digest("old-session"),
                account_id="legacy",
                expires_at=int(time.time()) + 3600,
            )
        )
        connection.execute(
            insert(kakao_identities).values(subject="old-kakao", account_id="legacy")
        )
        connection.execute(
            insert(kakao_flows).values(
                token_hash="pending",
                binding_hash="binding",
                expires_at=2**31,
                subject="old-kakao",
                nickname=None,
                nickname_ciphertext=encrypted("카카오별명", "kakao-flow:pending"),
            )
        )
        connection.execute(
            insert(financial_profiles).values(
                account_id="legacy",
                profile_json=encrypted(json.dumps(FINANCE), "finance:legacy"),
                updated_at="old",
            )
        )


@pytest.mark.parametrize("mode", ["development", "test", "production"])
def test_password_login_without_mysql_or_member_keys_persists_after_restart(tmp_path, mode):
    settings = Settings(
        _env_file=None,
        app_env=mode,
        db_enabled=False,
        auth_sqlite_path=tmp_path / "members.sqlite3",
    )
    assert settings.auth_encryption_keys.get_secret_value() == "{}"
    with TestClient(create_app(settings), headers=HEADERS, base_url="https://localhost") as client:
        assert (
            client.post(
                "/v1/auth/signup",
                json={
                    **PROFILE,
                    "username": "tester",
                    "password": PASSWORD,
                    "confirm_password": PASSWORD,
                },
            ).status_code
            == 201
        )
        response = client.post("/v1/auth/login", json={"username": "TESTER", "password": PASSWORD})
        assert response.status_code == 200
        assert client.get("/v1/auth/me").json()["user"]["name"] == PROFILE["name"]
        cookies = client.cookies
    with TestClient(create_app(settings), base_url="https://localhost") as restarted:
        restarted.cookies.update(cookies)
        assert restarted.get("/v1/auth/me").json()["user"]["username"] == "tester"


@pytest.mark.parametrize("mode", ["development", "production"])
def test_kakao_signup_without_mysql_or_member_keys(tmp_path, monkeypatch, mode):
    settings = Settings(
        _env_file=None,
        app_env=mode,
        db_enabled=False,
        auth_sqlite_path=tmp_path / "kakao.sqlite3",
        kakao_client_id="test-app",
        kakao_client_secret="test-secret",
        kakao_redirect_uri="https://localhost/v1/auth/kakao/callback",
        kakao_web_url="https://localhost/",
        auth_encryption_keys="obsolete-invalid-value",
        auth_lookup_key="obsolete-invalid-value",
    )
    monkeypatch.setattr(kakao, "exchange_identity", lambda *_: ("100:123", "카카오별명"))
    with TestClient(create_app(settings), headers=HEADERS, base_url="https://localhost") as client:
        assert client.get("/v1/auth/kakao/status").json() == {"enabled": True}
        url = client.post("/v1/auth/kakao/start", json={}).json()["authorization_url"]
        state = parse_qs(urlsplit(url).query)["state"][0]
        callback = client.get(
            "/v1/auth/kakao/callback",
            params={"state": state, "code": "code"},
            follow_redirects=False,
        )
        assert callback.headers["location"].endswith("#signup?kakao=complete")
        assert client.get("/v1/auth/kakao/pending").json() == {"name": "카카오별명"}
        assert client.post("/v1/auth/kakao/complete", json=PROFILE).status_code == 201
        assert client.get("/v1/auth/me").json()["user"]["name"] == PROFILE["name"]
        with client.app.state.auth_service.engine.connect() as connection:
            row = connection.execute(select(accounts)).mappings().one()
            assert row["name"] == PROFILE["name"] and row["profile_ciphertext"] is None


def test_restoration_keeps_identity_password_session_role_kakao_and_finance(tmp_path):
    engine = store(tmp_path / "legacy.sqlite3")
    seed_encrypted(engine)
    try:
        with pytest.raises(PrivacyError):
            ensure_plaintext_storage(engine)
        assert restore_plaintext_data(engine, legacy_settings()) == 1
        assert restore_plaintext_data(engine, Settings(_env_file=None)) == 0
        ensure_plaintext_storage(engine)
        service = AuthService(engine)
        assert service.me("old-session")["username"] == "legacy_user"
        assert service.login("legacy_user", PASSWORD, "local")[1]["id"] == "legacy"
        assert admin_role(engine, "legacy") == "superadmin"
        with engine.connect() as connection:
            row = connection.execute(select(accounts)).mappings().one()
            assert row["phone"] == "01012345678"
            assert row["username_lookup"] is None and row["profile_ciphertext"] is None
            assert (
                connection.execute(select(kakao_identities.c.subject)).scalar_one() == "old-kakao"
            )
            assert connection.execute(select(kakao_flows.c.nickname)).scalar_one() == "카카오별명"
            assert (
                json.loads(
                    connection.execute(select(financial_profiles.c.profile_json)).scalar_one()
                )
                == FINANCE
            )
    finally:
        engine.dispose()


@pytest.mark.parametrize("failure", ["missing-keys", "wrong-key", "tampered-finance"])
def test_restoration_failure_preserves_all_original_ciphertext(tmp_path, failure):
    engine = store(tmp_path / "protected.sqlite3")
    seed_encrypted(engine)
    settings = legacy_settings()
    if failure == "missing-keys":
        settings = Settings(_env_file=None)
    elif failure == "wrong-key":
        settings = settings.model_copy(
            update={
                "auth_encryption_keys": __import__("pydantic").SecretStr(
                    json.dumps({"primary": base64.b64encode(b"x" * 32).decode()})
                )
            }
        )
    else:
        with engine.begin() as connection:
            connection.execute(update(financial_profiles).values(profile_json="enc:v1:primary:bad"))
    try:
        with pytest.raises(PrivacyError):
            restore_plaintext_data(engine, settings)
        with engine.connect() as connection:
            row = connection.execute(select(accounts)).mappings().one()
            assert row["username"] == "u_obsolete" and row["profile_ciphertext"].startswith("enc:")
            assert connection.execute(select(kakao_flows.c.nickname_ciphertext)).scalar_one()
    finally:
        engine.dispose()


def test_encrypted_sqlite_import_restores_target_without_modifying_backup(tmp_path):
    source = store(tmp_path / "source.sqlite3")
    target = store(tmp_path / "target.sqlite3")
    seed_encrypted(source)
    try:
        assert import_sqlite_accounts(source, target, legacy_settings()) == 1
        assert import_sqlite_accounts(source, target, legacy_settings()) == 0
        assert AuthService(target).me("old-session")["username"] == "legacy_user"
        with source.connect() as connection:
            assert connection.execute(select(accounts.c.profile_ciphertext)).scalar_one()
    finally:
        source.dispose()
        target.dispose()
