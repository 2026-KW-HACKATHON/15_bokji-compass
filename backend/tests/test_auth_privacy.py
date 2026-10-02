"""Private storage must fail closed, preserve identities and resist ciphertext substitution."""

import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, delete, insert, select, text, update

from app.core.config import BACKEND_ROOT, Settings
from app.core.database import create_database_engine
from app.main import create_app
from app.modules.auth.migration import import_sqlite_accounts, migrate_private_data
from app.modules.auth.models import accounts, kakao_flows, kakao_identities, privacy_state, sessions
from app.modules.auth.privacy import PrivacyCipher, PrivacyError
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import digest, password_hash
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import financial_profiles

HEADERS = {"X-Auth-Request": "1"}
PROFILE = {"name": "암호화검증회원", "age": 35, "gender": "female", "region": "서울"}
PASSWORD = "PrivatePassword42!"
FINANCE = {"household_size": 1, "members": [{"age": 35, "earned_income": 1234567}]}


def cipher():
    return PrivacyCipher(Settings(_env_file=None))


def seed_legacy(engine):
    initialize_auth_schema(engine)
    initialize_finance_schema(engine)
    with engine.begin() as connection:
        connection.execute(
            insert(accounts).values(
                id="legacy",
                username="legacy_user",
                password_hash=password_hash(PASSWORD),
                phone="01012345678",
                created_at=1,
                **PROFILE,
            )
        )
        connection.execute(
            insert(kakao_identities).values(
                subject=digest("kakao:100:123"),
                account_id="legacy",
            )
        )
        connection.execute(
            insert(sessions).values(
                token_hash=digest("legacy-session"),
                account_id="legacy",
                expires_at=int(time.time()) + 3600,
            )
        )
        connection.execute(
            insert(financial_profiles).values(
                account_id="legacy",
                profile_json=json.dumps(FINANCE),
                updated_at="old",
            )
        )
        connection.execute(
            insert(kakao_flows).values(
                token_hash="pending",
                binding_hash="binding",
                expires_at=1,
                subject=digest("kakao:100:123"),
                nickname="가입대기별명",
            )
        )


def test_random_nonces_tamper_wrong_key_and_cross_account_substitution():
    value = cipher()
    first = value.encrypt_json(PROFILE, "account:one")
    second = value.encrypt_json(PROFILE, "account:one")
    assert first != second
    assert value.decrypt_json(first, "account:one") == PROFILE
    for context, ciphertext in (
        ("account:two", first),
        ("finance:one", first),
        ("account:one", first[:-8] + "AAAAAAAA"),
        ("account:one", json.dumps(PROFILE)),
    ):
        with pytest.raises(PrivacyError):
            value.decrypt_json(ciphertext, context)
    settings = Settings(
        _env_file=None,
        auth_encryption_keys=json.dumps(
            {
                "primary": base64.urlsafe_b64encode(b"x" * 32).decode(),
            }
        ),
    )
    with pytest.raises(PrivacyError):
        PrivacyCipher(settings).decrypt(first, "account:one")
    assert value.lookup("TESTER") == value.lookup("tester")
    assert value.lookup("tester") != digest("tester")


@pytest.mark.parametrize("mode", ["development", "production"])
def test_sqlite_is_never_a_live_member_fallback(tmp_path, mode):
    path = tmp_path / "must-not-exist.sqlite3"
    with TestClient(
        create_app(
            Settings(
                _env_file=None,
                app_env=mode,
                db_enabled=False,
                auth_sqlite_path=path,
            )
        )
    ) as client:
        response = client.post(
            "/v1/auth/signup",
            headers=HEADERS,
            json={
                **PROFILE,
                "username": "tester",
                "password": PASSWORD,
                "confirm_password": PASSWORD,
            },
        )
        assert response.status_code == 503
        assert not path.exists()


@pytest.mark.parametrize(
    "keys,lookup",
    [
        ("{}", ""),
        ("not-json", ""),
        ('{"primary":"invalid"}', ""),
    ],
)
def test_missing_or_invalid_keys_never_create_private_storage(tmp_path, keys, lookup):
    path = tmp_path / "missing.sqlite3"
    with TestClient(
        create_app(
            Settings(
                _env_file=None,
                app_env="test",
                db_enabled=False,
                auth_sqlite_path=path,
                auth_encryption_keys=keys,
                auth_lookup_key=lookup,
            )
        )
    ) as client:
        response = client.get("/v1/auth/me")
        assert response.status_code == 503 and not path.exists()
        assert "not-json" not in response.text


def test_legacy_conversion_import_and_rotation_preserve_account_sessions_and_finance(tmp_path):
    old = create_engine("sqlite:///" + (tmp_path / "old.sqlite3").as_posix())
    target = create_engine("sqlite:///" + (tmp_path / "target.sqlite3").as_posix())
    value = cipher()
    try:
        seed_legacy(old)
        initialize_auth_schema(target)
        initialize_finance_schema(target)
        migrate_private_data(target, value)
        assert import_sqlite_accounts(old, target, value) == 1
        assert import_sqlite_accounts(old, target, value) == 0
        assert migrate_private_data(old, value) == 1
        assert migrate_private_data(old, value) == 0
        with old.connect() as connection:
            row = connection.execute(select(accounts)).mappings().one()
            assert row["name"] is None and row["phone"] is None and row["age"] == 0
            assert row["username"] != "legacy_user"
            assert value.decrypt_json(row["profile_ciphertext"], "account:legacy")["phone"]
            pending = connection.execute(select(kakao_flows)).mappings().one()
            assert pending["nickname"] is None
            assert (
                value.decrypt(pending["nickname_ciphertext"], "kakao-flow:pending")
                == "가입대기별명"
            )
        settings = Settings(_env_file=None)
        keys = json.loads(settings.auth_encryption_keys.get_secret_value())
        keys["next"] = base64.urlsafe_b64encode(b"n" * 32).decode()
        settings.auth_encryption_keys = SecretStr(json.dumps(keys))
        settings.auth_encryption_key_id = "next"
        rotated = PrivacyCipher(settings)
        assert migrate_private_data(target, rotated) == 1
        assert migrate_private_data(target, rotated) == 0
        settings.auth_encryption_keys = SecretStr(json.dumps({"next": keys["next"]}))
        rotated = PrivacyCipher(settings)
        with TestClient(
            create_app(
                Settings(
                    _env_file=None,
                    app_env="test",
                    db_enabled=False,
                    auth_sqlite_path=tmp_path / "target.sqlite3",
                    auth_encryption_keys=settings.auth_encryption_keys,
                    auth_encryption_key_id="next",
                )
            ),
            headers=HEADERS,
        ) as client:
            client.cookies.set("bokji_session", "legacy-session")
            assert client.get("/v1/auth/me").json()["user"]["username"] == "legacy_user"
            assert (
                client.get("/v1/finance/profile").json()["profile"]["members"][0]["earned_income"]
                == 1234567
            )
            assert (
                client.post(
                    "/v1/auth/login",
                    json={
                        "username": "legacy_user",
                        "password": PASSWORD,
                    },
                ).status_code
                == 200
            )
            with target.connect() as connection:
                row = connection.execute(select(accounts)).mappings().one()
                assert row["profile_ciphertext"].startswith(rotated.active_prefix)
                assert (
                    connection.execute(select(kakao_identities)).mappings().one()["account_id"]
                    == "legacy"
                )
    finally:
        old.dispose()
        target.dispose()


def test_wrong_lookup_key_and_corrupt_rows_roll_back_conversion(tmp_path):
    engine = create_engine("sqlite:///" + (tmp_path / "rollback.sqlite3").as_posix())
    try:
        seed_legacy(engine)
        with engine.begin() as connection:
            connection.execute(update(financial_profiles).values(profile_json="not-json"))
        with pytest.raises(ValueError):
            migrate_private_data(engine, cipher())
        with engine.connect() as connection:
            row = connection.execute(select(accounts)).mappings().one()
            assert row["username"] == "legacy_user" and row["profile_ciphertext"] is None
            assert connection.execute(select(privacy_state)).first() is None
        with engine.begin() as connection:
            connection.execute(update(financial_profiles).values(profile_json=json.dumps(FINANCE)))
        migrate_private_data(engine, cipher())
        settings = Settings(
            _env_file=None, auth_lookup_key=base64.urlsafe_b64encode(b"w" * 32).decode()
        )
        with pytest.raises(PrivacyError):
            migrate_private_data(engine, PrivacyCipher(settings))
    finally:
        engine.dispose()


def test_modified_account_ciphertext_returns_safe_error_and_issues_no_session(tmp_path):
    settings = Settings(
        _env_file=None,
        app_env="test",
        db_enabled=False,
        auth_sqlite_path=tmp_path / "tamper.sqlite3",
    )
    with TestClient(create_app(settings), headers=HEADERS) as client:
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
        engine = client.app.state.auth_service.engine
        with engine.begin() as connection:
            row = connection.execute(select(accounts)).mappings().one()
            connection.execute(
                update(accounts).values(
                    profile_ciphertext=row["profile_ciphertext"][:-8] + "AAAAAAAA",
                )
            )
        response = client.post("/v1/auth/login", json={"username": "tester", "password": PASSWORD})
        assert response.status_code == 503
        assert PROFILE["name"] not in response.text and "enc:" not in response.text
        with engine.connect() as connection:
            assert connection.execute(select(sessions)).first() is None


def test_real_mysql_password_kakao_and_finance_are_encrypted(monkeypatch):
    if os.environ.get("BOKJI_TEST_MYSQL") != "1":
        pytest.skip("Explicit local MySQL integration opt-in required")
    state = json.loads((BACKEND_ROOT / "data/mysql-dev/credentials.json").read_text())
    settings = Settings(
        _env_file=None,
        app_env="test",
        db_enabled=True,
        db_host="127.0.0.1",
        db_port=state["port"],
        db_name="bokji_compass_test",
        db_user="bokji_test",
        db_password=state["app_password"],
        kakao_client_id="test",
        kakao_client_secret="synthetic-secret",
        kakao_redirect_uri="http://localhost/v1/auth/kakao/callback",
        kakao_web_url="http://localhost/",
    )
    engine = create_database_engine(settings)
    username = "t_" + uuid4().hex[:16]
    subject = "test-app:" + uuid4().hex
    ids = []
    flows = []
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT DATABASE()")) == "bokji_compass_test"
            assert (
                Path(connection.scalar(text("SELECT @@datadir"))).resolve()
                == (BACKEND_ROOT / "data/mysql-dev/data").resolve()
            )
        initialize_auth_schema(engine)
        initialize_finance_schema(engine)
        migrate_private_data(engine, PrivacyCipher(settings))
        monkeypatch.setattr(
            "app.modules.auth.kakao.exchange_identity", lambda *_: (subject, "검증용카카오별명")
        )
        with TestClient(
            create_app(settings), headers=HEADERS, base_url="http://localhost"
        ) as client:
            body = {
                **PROFILE,
                "username": username,
                "password": PASSWORD,
                "confirm_password": PASSWORD,
            }
            assert client.post("/v1/auth/signup", json=body).status_code == 201
            assert client.post("/v1/auth/signup", json=body).status_code == 409
            response = client.post(
                "/v1/auth/login", json={"username": username, "password": PASSWORD}
            )
            assert response.status_code == 200
            ids.append(response.json()["user"]["id"])
            assert (
                client.post(
                    "/v1/finance/profile",
                    json={
                        "consent": True,
                        "profile": FINANCE,
                    },
                ).status_code
                == 200
            )
            assert (
                client.get("/v1/finance/profile").json()["profile"]["members"][0]["earned_income"]
                == 1234567
            )
            with engine.connect() as connection:
                row = (
                    connection.execute(select(accounts).where(accounts.c.id == ids[0]))
                    .mappings()
                    .one()
                )
                assert row["username"] != username and row["name"] is None
                assert "암호화검증회원" not in row["profile_ciphertext"]
                financial = (
                    connection.execute(
                        select(financial_profiles).where(financial_profiles.c.account_id == ids[0])
                    )
                    .mappings()
                    .one()
                )
                assert "1234567" not in financial["profile_json"]
            state_token = parse_qs(
                urlsplit(
                    client.post("/v1/auth/kakao/start", json={}).json()["authorization_url"]
                ).query
            )["state"][0]
            flows.append(digest(state_token))
            response = client.get(
                "/v1/auth/kakao/callback",
                params={
                    "state": state_token,
                    "code": "synthetic-code",
                },
                follow_redirects=False,
            )
            assert response.headers["location"].endswith("#signup?kakao=complete")
            pending = client.cookies.get("bokji_kakao_signup")
            flows.append(digest(pending))
            assert client.get("/v1/auth/kakao/pending").json()["name"] == "검증용카카오별명"
            with engine.connect() as connection:
                row = (
                    connection.execute(
                        select(kakao_flows).where(kakao_flows.c.token_hash == digest(pending))
                    )
                    .mappings()
                    .one()
                )
                assert (
                    row["nickname"] is None and "검증용카카오별명" not in row["nickname_ciphertext"]
                )
                assert len(row["subject"]) == 64
            response = client.post("/v1/auth/kakao/complete", json=PROFILE)
            assert response.status_code == 201
            ids.append(response.json()["user"]["id"])
            assert client.get("/v1/auth/me").json()["user"]["name"] == PROFILE["name"]
            client.post("/v1/auth/logout", json={})
            state_token = parse_qs(
                urlsplit(
                    client.post("/v1/auth/kakao/start", json={}).json()["authorization_url"]
                ).query
            )["state"][0]
            flows.append(digest(state_token))
            response = client.get(
                "/v1/auth/kakao/callback",
                params={
                    "state": state_token,
                    "code": "synthetic-code",
                },
                follow_redirects=False,
            )
            assert response.headers["location"].endswith("#home")
            assert client.get("/v1/auth/me").json()["user"]["id"] == ids[1]
    finally:
        with engine.begin() as connection:
            if ids:
                for table in (financial_profiles, kakao_identities, sessions):
                    connection.execute(delete(table).where(table.c.account_id.in_(ids)))
                connection.execute(delete(accounts).where(accounts.c.id.in_(ids)))
            if flows:
                connection.execute(delete(kakao_flows).where(kakao_flows.c.token_hash.in_(flows)))
        engine.dispose()


def test_unpadded_base64url_server_keys_are_supported():
    settings = Settings(
        _env_file=None,
        auth_encryption_keys=json.dumps({
            "primary": base64.urlsafe_b64encode(b"e" * 32).decode().rstrip("="),
        }),
        auth_lookup_key=base64.urlsafe_b64encode(b"l" * 32).decode().rstrip("="),
    )
    value = PrivacyCipher(settings)
    encrypted = value.encrypt_json(PROFILE, "account:base64url")
    assert value.decrypt_json(encrypted, "account:base64url") == PROFILE
