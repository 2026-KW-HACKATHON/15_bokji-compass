"""Member storage privacy and authentication revocation boundaries."""

import ssl
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError

from app.api.auth import ProfileInput
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.database import create_member_engine
from app.modules.auth.models import accounts, sessions
from app.modules.auth.privacy import PrivacyError
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import AuthService, check_password, digest, password_hash

PASSWORD = "ExamplePassword42!"


@pytest.fixture
def member_store(tmp_path):
    engine = create_member_engine(Settings(_env_file=None, auth_sqlite_path=tmp_path / "auth.db"))
    initialize_auth_schema(engine)
    service = AuthService(engine)
    with engine.begin() as connection:
        connection.execute(
            insert(accounts).values(
                id="member",
                username="member",
                name="original",
                password_hash=password_hash(PASSWORD),
                gender="undisclosed",
                created_at=1,
            )
        )
    try:
        yield engine, service
    finally:
        engine.dispose()


def test_member_sql_errors_do_not_include_profile_parameters(member_store):
    engine, _ = member_store
    private_address = "private home address 123"
    with pytest.raises(IntegrityError) as failure, engine.begin() as connection:
        connection.execute(
            insert(accounts).values(
                id="other",
                username="member",
                name=private_address,
                password_hash="secret-hash",
                gender="undisclosed",
                created_at=1,
            )
        )
    assert private_address not in str(failure.value)
    assert "secret-hash" not in str(failure.value)
    assert "parameters hidden" in str(failure.value)


def test_sqlite_deleted_profile_is_removed_from_database_pages(member_store):
    engine, _ = member_store
    private_address = "unique-private-address-238c960d"
    with engine.begin() as connection:
        assert connection.exec_driver_sql("PRAGMA secure_delete").scalar_one() == 1
        assert connection.exec_driver_sql("PRAGMA temp_store").scalar_one() == 2
        connection.execute(update(accounts).values(address=private_address))
    with open(engine.url.database, "rb") as database:
        assert private_address.encode() in database.read()
    with engine.begin() as connection:
        connection.execute(update(accounts).values(address=None))
    with open(engine.url.database, "rb") as database:
        assert private_address.encode() not in database.read()


@pytest.mark.parametrize("revocation", ["logout", "expire", "other-account", "mobile"])
def test_profile_update_rechecks_current_web_session(member_store, revocation):
    engine, service = member_store
    with engine.connect() as connection:
        account = connection.execute(select(accounts)).mappings().one()
    token, _ = service.issue_session(account, mobile=revocation == "mobile")
    if revocation == "logout":
        service.me(token)
        service.logout(token)
    elif revocation == "expire":
        with engine.begin() as connection:
            connection.execute(update(sessions).values(expires_at=0))
    elif revocation == "other-account":
        with engine.begin() as connection:
            connection.execute(update(sessions).values(account_id="different-member"))
    with pytest.raises(HTTPException) as failure:
        service.update_profile("member", ProfileInput(name="attacker"), token=token)
    assert failure.value.status_code == 401
    with engine.connect() as connection:
        assert connection.scalar(select(accounts.c.name)) == "original"
    assert service.update_profile("member", ProfileInput(name="trusted"))["name"] == "trusted"


def test_login_cannot_issue_session_using_changed_credentials(member_store):
    engine, service = member_store
    with engine.connect() as connection:
        snapshot = connection.execute(select(accounts)).mappings().one()
    with engine.begin() as connection:
        connection.execute(update(accounts).values(password_hash=password_hash("NewPassword42!")))
    with pytest.raises(HTTPException) as failure:
        service.issue_session(snapshot)
    assert failure.value.status_code == 401
    with engine.connect() as connection:
        assert connection.execute(select(sessions)).first() is None


def test_session_response_uses_current_profile(member_store):
    engine, service = member_store
    with engine.connect() as connection:
        snapshot = connection.execute(select(accounts)).mappings().one()
    with engine.begin() as connection:
        connection.execute(update(accounts).values(name="current"))
    token, user = service.issue_session(snapshot)
    assert user["name"] == service.me(token)["name"] == "current"


@pytest.mark.parametrize("encoded", [None, "", "scrypt", "scrypt$bad$bad", "argon2$hash"])
def test_malformed_stored_password_fails_closed(encoded):
    assert check_password(PASSWORD, encoded) is False


def test_member_mysql_uses_separate_credentials_and_pool():
    settings = Settings(
        _env_file=None,
        db_enabled=True,
        db_password="policy-secret",
        auth_db_user="members_only",
        auth_db_password="member@/:secret",
    )
    engine = create_member_engine(settings)
    try:
        assert engine.url.username == "members_only"
        assert engine.url.password == "member@/:secret"
        assert engine.hide_parameters is True
        assert settings.db_user == "bokji_dev"
        assert settings.db_password.get_secret_value() == "policy-secret"
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    "values",
    [
        {"auth_db_user": "members_only"},
        {"auth_db_password": "member-secret"},
    ],
)
def test_partial_member_credentials_are_rejected(values):
    with pytest.raises(ValidationError, match="configured together") as failure:
        Settings(_env_file=None, **values)
    assert "member-secret" not in str(failure.value)


def test_invalid_member_configuration_does_not_echo_database_secrets():
    with pytest.raises(ValidationError) as failure:
        Settings(
            _env_file=None,
            db_enabled=True,
            db_password="private-db-secret",
            auth_db_password="private-member-secret",
        )
    assert "private-db-secret" not in str(failure.value)
    assert "private-member-secret" not in str(failure.value)


def test_remote_production_member_mysql_requires_verified_tls():
    with pytest.raises(PrivacyError, match="requires"):
        create_member_engine(
            Settings(
                _env_file=None,
                app_env="production",
                db_enabled=True,
                db_host="members.example",
                db_password="test-only",
            )
        )


@pytest.mark.parametrize(
    "cipher",
    [
        None,
        ("Ssl_cipher", ""),
        ("Ssl_cipher", "TLS_AES_256_GCM_SHA384"),
    ],
)
def test_member_mysql_rejects_tls_downgrade(monkeypatch, cipher):
    import app.modules.auth.database as member_database

    context = ssl.create_default_context()
    monkeypatch.setattr(member_database.ssl, "create_default_context", lambda **_: context)
    options = {}
    monkeypatch.setattr(
        member_database, "create_engine", lambda *args, **kwargs: options.update(kwargs)
    )
    listeners = []
    monkeypatch.setattr(
        member_database.event,
        "listens_for",
        lambda *args: lambda listener: listeners.append(listener),
    )
    create_member_engine(
        Settings(
            _env_file=None,
            app_env="production",
            db_enabled=True,
            db_host="members.example",
            db_password="test-only",
            auth_db_ssl_ca="test-ca.pem",
        )
    )
    assert options["connect_args"]["ssl"] is context
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
    assert context.minimum_version == ssl.TLSVersion.TLSv1_2
    assert options["connect_args"]["local_infile"] is False
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = cipher
    if cipher and cipher[1]:
        listeners[0](connection, None)
        connection.close.assert_not_called()
    else:
        with pytest.raises(PrivacyError):
            listeners[0](connection, None)
        connection.close.assert_called_once()


def test_driver_rejects_missing_tls_before_sending_authentication(monkeypatch):
    from pymysql import OperationalError
    from pymysql.connections import Connection

    connection = Connection(
        user="member",
        password="private-password",
        defer_connect=True,
        ssl=ssl.create_default_context(),
    )
    connection.server_version = "8.0.0"
    connection.server_capabilities = 0
    send_packet = MagicMock()
    monkeypatch.setattr(connection, "write_packet", send_packet)
    with pytest.raises(OperationalError, match="SSL is required"):
        connection._request_authentication()
    send_packet.assert_not_called()


def test_corrupt_account_password_returns_generic_login_failure(member_store):
    engine, service = member_store
    with engine.begin() as connection:
        connection.execute(update(accounts).values(password_hash="corrupt-secret"))
    with pytest.raises(HTTPException) as failure:
        service.login("member", PASSWORD, "local")
    assert failure.value.status_code == 401
    assert "corrupt-secret" not in failure.value.detail
    assert "member" not in failure.value.detail


def test_current_web_session_can_update_its_profile(member_store):
    engine, service = member_store
    with engine.connect() as connection:
        snapshot = connection.execute(select(accounts)).mappings().one()
    token, _ = service.issue_session(snapshot)
    updated = service.update_profile("member", ProfileInput(name="updated"), token=token)
    assert updated["name"] == "updated"
    with engine.connect() as connection:
        assert connection.scalar(select(sessions.c.token_hash)) == digest(token)


def test_profile_api_refuses_session_revoked_after_initial_read(member_store, monkeypatch):
    engine, service = member_store
    with engine.connect() as connection:
        snapshot = connection.execute(select(accounts)).mappings().one()
    token, _ = service.issue_session(snapshot)
    original_me = service.me

    def revoke_after_read(value):
        user = original_me(value)
        service.logout(value)
        return user

    monkeypatch.setattr(service, "me", revoke_after_read)
    app = create_app(Settings(_env_file=None))
    app.state.auth_service = service
    with TestClient(app, headers={"X-Auth-Request": "1"}) as client:
        client.cookies.set("bokji_session", token)
        response = client.post("/v1/auth/profile", json={"name": "attacker"})
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
    with engine.connect() as connection:
        assert connection.scalar(select(accounts.c.name)) == "original"


def test_member_tls_setup_error_is_private_and_does_not_fall_back(tmp_path):
    database = tmp_path / "must-not-exist.db"
    app = create_app(
        Settings(
            _env_file=None,
            app_env="production",
            db_enabled=True,
            db_host="private-members.example",
            db_password="private-password",
            auth_sqlite_path=database,
        )
    )
    with TestClient(app, base_url="https://testserver", headers={"X-Auth-Request": "1"}) as client:
        response = client.post(
            "/v1/auth/login",
            json={
                "username": "member",
                "password": PASSWORD,
            },
        )
        assert response.status_code == 503
        assert "private-members" not in response.text and "private-password" not in response.text
        assert response.headers["cache-control"] == "no-store"
        assert app.state.auth_service is None and app.state.auth_engine is None
    assert not database.exists()


@pytest.mark.parametrize("initialize", [False, True])
def test_monitoring_worker_keeps_policy_reads_out_of_member_pool(monkeypatch, initialize):
    import app.modules.monitoring.__main__ as cli

    settings = Settings(_env_file=None, db_enabled=True, db_password="test-only")
    member_engine = MagicMock()
    policy_engine = MagicMock()
    policy_factory = MagicMock(return_value=policy_engine)
    repository = MagicMock()
    catalog_factory = MagicMock(return_value=repository)
    evaluate = MagicMock(return_value={"failed": 0})
    monkeypatch.setattr(cli, "load_settings", lambda: settings)
    monkeypatch.setattr(cli, "member_engine", lambda _: member_engine)
    monkeypatch.setattr(cli, "create_database_engine", policy_factory)
    monkeypatch.setattr(cli, "PolicyRepository", catalog_factory)
    monkeypatch.setattr(cli, "initialize_monitoring_schema", MagicMock())
    monkeypatch.setattr(cli, "run_once", evaluate)
    cli.main(["--init" if initialize else "--once"])
    member_engine.dispose.assert_called_once()
    if initialize:
        policy_factory.assert_not_called()
        catalog_factory.assert_not_called()
    else:
        policy_factory.assert_called_once_with(settings)
        catalog_factory.assert_called_once_with(policy_engine, auto_publish=True)
        assert evaluate.call_args.args[0] is repository
        assert evaluate.call_args.args[1].engine is member_engine
        assert evaluate.call_args.args[2].engine is member_engine
        policy_engine.dispose.assert_called_once()
