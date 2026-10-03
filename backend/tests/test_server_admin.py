"""Server-console security uses isolated auth SQLite and an isolated config file."""

import json
import time

import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, func, select, update

from app.core.config import Settings
from app.main import create_app
from app.modules.admin.access import admin_grants
from app.modules.admin.provision import create_operator
from app.modules.auth.migration import migrate_private_data
from app.modules.auth.models import accounts, sessions
from app.modules.auth.privacy import PrivacyCipher
from app.modules.auth.schema import initialize_auth_schema

ADMIN_COOKIE = "bokji_server_admin"
PASSWORD = "OfflineAdminPassword42!"
PORTAL_SECRET = "OfflinePortalKey42"
HEADERS = {"X-Auth-Request": "1"}
LOGIN = "/v1/server-admin/login"
SESSION = "/v1/server-admin/session"
SETTINGS = "/v1/server-admin/settings"
PROTECTED = [
    SESSION,
    "/v1/server-admin/overview",
    SETTINGS,
    "/v1/server-admin/collection/status",
    "/v1/server-admin/collection/changes",
    "/v1/server-admin/collection/candidates",
]


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch, test_privacy_keys):
    for field in Settings.model_fields:
        if field not in {"auth_encryption_keys", "auth_encryption_key_id", "auth_lookup_key"}:
            monkeypatch.delenv(field.upper(), raising=False)
    monkeypatch.delenv("APP_CONFIG_FILE", raising=False)


@pytest.fixture
def console(tmp_path):
    database = tmp_path / "isolated-auth.sqlite3"
    engine = create_engine("sqlite:///" + database.as_posix())
    settings = Settings(
        _env_file=None,
        app_env="test",
        db_enabled=False,
        auth_sqlite_path=database,
        bokjiro_api_key=PORTAL_SECRET,
    )
    cipher = PrivacyCipher(settings)
    initialize_auth_schema(engine)
    migrate_private_data(engine, cipher)
    admin_id = create_operator(engine, "server_admin", PASSWORD, cipher=cipher, role="superadmin")
    create_operator(engine, "qr_operator", PASSWORD, cipher=cipher, role="qr_admin")
    member_id = create_operator(
        engine, "ordinary_member", PASSWORD, cipher=cipher, role="qr_admin",
    )
    with engine.begin() as connection:
        connection.execute(delete(admin_grants).where(admin_grants.c.account_id == member_id))
    config_file = tmp_path / "isolated.env"
    config_file.write_text(
        "# Keep this comment and unrelated setting\n"
        "UNRELATED_SETTING=preserve-me\n"
        "DB_ENABLED=false\n"
        "INGESTION_PAGE_SIZE=50\n"
        f"BOKJIRO_API_KEY={PORTAL_SECRET}\n",
        encoding="utf-8",
    )
    application = create_app(settings, config_path=config_file)
    with TestClient(application, headers=HEADERS) as client:
        yield client, engine, admin_id, config_file
    engine.dispose()


def login(client, username="server_admin"):
    return client.post(LOGIN, json={"username": username, "password": PASSWORD})


def revision(client):
    response = client.get(SETTINGS)
    assert response.status_code == 200, response.text
    return response.json()["revision"]


def patch(client, changes, **kwargs):
    return client.patch(SETTINGS, json={"revision": revision(client), "changes": changes}, **kwargs)


def test_public_login_shell_never_embeds_configuration_or_credentials(console):
    client, _, _, _ = console
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "same-origin"
    assert PORTAL_SECRET not in response.text and PASSWORD not in response.text
    assert "bokji_server_admin=" not in response.text
    for path in PROTECTED:
        assert client.get(path).status_code == 401


def test_guest_session_does_not_initialize_auth_database(tmp_path):
    database = tmp_path / "must-not-exist.sqlite3"
    application = create_app(
        Settings(_env_file=None, app_env="test", auth_sqlite_path=database),
        config_path=tmp_path / "missing.env",
    )
    with TestClient(application) as client:
        assert client.get(SESSION).status_code == 401
        assert application.state.auth_service is None
    assert not database.exists()


def test_superadmin_login_issues_private_cookie_and_returns_minimal_identity(console):
    client, _, admin_id, _ = console
    response = login(client)
    assert response.status_code == 200, response.text
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert ADMIN_COOKIE in client.cookies
    assert "bokji_session" not in client.cookies
    response = client.get(SESSION)
    assert response.json() == {
        "user": {"id": admin_id, "username": "server_admin", "admin_role": "superadmin"}
    }
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("username", ["qr_operator", "ordinary_member"])
def test_non_superadmin_login_never_leaves_an_issued_session(console, username):
    client, engine, _, _ = console
    response = login(client, username)
    assert response.status_code == 403
    assert ADMIN_COOKIE not in client.cookies
    with engine.connect() as connection:
        assert connection.execute(select(func.count()).select_from(sessions)).scalar_one() == 0
    assert client.get(SESSION).status_code == 401


def test_web_login_does_not_grant_server_console_access(console):
    client, _, _, _ = console
    ordinary = client.post(
        "/v1/auth/login", json={"username": "server_admin", "password": PASSWORD}
    )
    assert ordinary.status_code == 200
    web_token = client.cookies.get("bokji_session")
    assert client.get(SESSION).status_code == 401
    assert login(client).status_code == 200
    assert client.cookies.get("bokji_session") == web_token
    assert client.post("/v1/server-admin/logout").status_code == 200
    assert ADMIN_COOKIE not in client.cookies
    assert client.cookies.get("bokji_session") == web_token
    assert client.get("/v1/auth/me").status_code == 200
    assert client.get(SESSION).status_code == 401


def test_session_tokens_cannot_be_relabelled_between_web_and_console(console):
    client, _, _, _ = console
    assert client.post("/v1/auth/login", json={
        "username": "server_admin", "password": PASSWORD,
    }).status_code == 200
    web_token = client.cookies.get("bokji_session")
    client.cookies.clear()
    client.cookies.set(ADMIN_COOKIE, web_token, domain="testserver.local", path="/")
    assert client.get(SESSION).status_code == 401
    assert client.post("/v1/server-admin/logout").status_code == 200
    client.cookies.set("bokji_session", web_token, domain="testserver.local", path="/")
    assert client.get("/v1/auth/me").status_code == 200
    assert login(client).status_code == 200
    console_token = client.cookies.get(ADMIN_COOKIE)
    client.cookies.clear()
    client.cookies.set("bokji_session", console_token, domain="testserver.local", path="/")
    assert client.get("/v1/auth/me").status_code == 401
    assert client.post("/v1/auth/logout").status_code == 200
    client.cookies.set(ADMIN_COOKIE, console_token, domain="testserver.local", path="/")
    assert client.get(SESSION).status_code == 200


@pytest.mark.parametrize("role", ["qr_admin", "unknown", None])
def test_every_endpoint_rechecks_role_and_does_not_trust_headers(console, role):
    client, engine, admin_id, config_file = console
    assert login(client).status_code == 200
    saved_revision = revision(client)
    before = config_file.read_bytes()
    with engine.begin() as connection:
        statement = (
            delete(admin_grants)
            if role is None
            else update(admin_grants).values(role=role)
        )
        connection.execute(statement.where(admin_grants.c.account_id == admin_id))
    for path in PROTECTED:
        assert client.get(path, headers={"X-Role": "superadmin"}).status_code == 403
    response = client.patch(
        SETTINGS,
        json={"revision": saved_revision, "changes": {"policy_auto_publish": False}},
    )
    assert response.status_code == 403
    assert config_file.read_bytes() == before
    # Even a revoked administrator can discard their stale console cookie.
    assert client.post("/v1/server-admin/logout").status_code == 200
    assert ADMIN_COOKIE not in client.cookies


def test_expired_forged_cookie_and_logout_are_rejected_safely(console):
    client, engine, _, _ = console
    assert login(client).status_code == 200
    with engine.begin() as connection:
        connection.execute(update(sessions).values(expires_at=int(time.time()) - 1))
    assert client.get(SESSION).status_code == 401
    assert client.post("/v1/server-admin/logout").status_code == 200
    client.cookies.set(ADMIN_COOKIE, "A" * 43, domain="testserver.local", path="/")
    assert client.get(SESSION).status_code == 401
    assert client.post("/v1/server-admin/logout").status_code == 200
    assert ADMIN_COOKIE not in client.cookies


@pytest.mark.parametrize("headers", [
    {"X-Auth-Request": ""},
    {"Origin": "https://foreign.invalid"},
    {"Origin": "null"},
    {"Origin": "http://testserver.evil.invalid"},
    {"Origin": "http://testserver", "Sec-Fetch-Site": "cross-site"},
    {"Origin": "http://testserver", "Sec-Fetch-Site": "same-site"},
])
def test_console_write_guard_rejects_cross_origin_and_missing_header(console, headers):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    saved_revision = revision(client)
    before = config_file.read_bytes()
    body = {"revision": saved_revision, "changes": {"policy_auto_publish": False}}
    assert client.patch(SETTINGS, json=body, headers=headers).status_code == 403
    assert client.post("/v1/server-admin/logout", headers=headers).status_code == 403
    assert config_file.read_bytes() == before
    assert client.get(SESSION).status_code == 200


@pytest.mark.parametrize("origin", ["null", "https://foreign.invalid"])
def test_console_read_guard_rejects_foreign_origin_even_when_authenticated(console, origin):
    client, _, _, _ = console
    assert login(client).status_code == 200
    for path in PROTECTED:
        assert client.get(path, headers={"Origin": origin}).status_code == 403


def test_same_origin_console_changes_are_saved_and_runtime_flags_apply(console):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    response = patch(
        client,
        {"ingestion_page_size": 10, "policy_auto_publish": False},
        headers={"Origin": "http://testserver", "Sec-Fetch-Site": "same-origin"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["values"]["ingestion_page_size"] == 10
    assert response.json()["values"]["policy_auto_publish"] is False
    assert client.app.state.settings.ingestion_page_size == 10
    assert client.app.state.settings.policy_auto_publish is False
    contents = config_file.read_text(encoding="utf-8")
    assert "# Keep this comment" in contents and "UNRELATED_SETTING=preserve-me" in contents
    assert dotenv_values(config_file)["INGESTION_PAGE_SIZE"] == "10"


def test_secrets_are_write_only_and_rejected_inputs_never_echo(console):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    response = client.get(SETTINGS)
    assert PORTAL_SECRET not in response.text
    assert "bokjiro_api_key" not in response.json()["values"]
    assert response.json()["secret_configured"]["bokjiro_api_key"] is True
    replacement = "NewOfflineSecret42"
    response = patch(client, {"bokjiro_api_key": replacement})
    assert response.status_code == 200, response.text
    assert replacement not in response.text
    assert replacement not in client.get(SETTINGS).text
    assert client.app.state.settings.bokjiro_api_key.get_secret_value() == replacement
    before = config_file.read_bytes()
    for invalid in (
        {"unexpected_field": replacement},
        {"codex_executable": replacement},
        {"bokjiro_api_key": {"private": replacement}},
        {"ingestion_page_size": replacement},
    ):
        response = patch(client, invalid)
        assert response.status_code == 422
        assert replacement not in response.text
        assert config_file.read_bytes() == before
    response = patch(client, {"bokjiro_api_key": ""})
    assert response.status_code == 200
    assert response.json()["secret_configured"]["bokjiro_api_key"] is False


def test_settings_revision_conflict_preserves_newer_configuration(console):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    stale_revision = revision(client)
    assert patch(client, {"ingestion_page_size": 10}).status_code == 200
    current = config_file.read_bytes()
    response = client.patch(
        SETTINGS, json={"revision": stale_revision, "changes": {"ingestion_page_size": 20}}
    )
    assert response.status_code == 409
    assert config_file.read_bytes() == current
    assert client.app.state.settings.ingestion_page_size == 10


def test_database_connection_changes_are_staged_until_restart(console):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    before_host = client.app.state.settings.db_host
    response = patch(client, {"db_host": "future-db.invalid", "db_port": 3310})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["values"]["db_host"] == "future-db.invalid"
    assert result["restart_required"] is True
    assert {"db_host", "db_port"}.issubset(result["restart_fields"])
    assert client.app.state.settings.db_host == before_host
    assert client.app.state.settings.db_port == 3307
    assert client.app.state.database_engine is None
    assert dotenv_values(config_file)["DB_HOST"] == "future-db.invalid"


def test_login_validation_never_echoes_password_or_accepts_role(console):
    client, engine, _, _ = console
    secret = "NeverEchoAdminCredential42"
    for body in (
        {"username": "x", "password": secret},
        {"username": "server_admin", "password": secret, "role": "superadmin"},
    ):
        response = client.post(LOGIN, json=body)
        assert response.status_code == 422
        assert secret not in response.text
    response = client.post(LOGIN, json={"username": "server_admin", "password": secret})
    assert response.status_code == 401
    assert secret not in response.text
    with engine.connect() as connection:
        assert connection.execute(select(func.count()).select_from(sessions)).scalar_one() == 0
        assert connection.execute(select(func.count()).select_from(accounts)).scalar_one() == 3


@pytest.mark.parametrize("headers", [
    {"X-Auth-Request": ""},
    {"Origin": "null"},
    {"Origin": "https://foreign.invalid"},
])
def test_login_guard_rejects_request_before_creating_session(console, headers):
    client, engine, _, _ = console
    response = client.post(
        LOGIN, json={"username": "server_admin", "password": PASSWORD}, headers=headers
    )
    assert response.status_code == 403
    assert ADMIN_COOKIE not in client.cookies
    with engine.connect() as connection:
        assert connection.execute(select(func.count()).select_from(sessions)).scalar_one() == 0


def test_invalid_combined_settings_update_is_atomic(console):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    before = config_file.read_bytes()
    response = patch(client, {"policy_auto_publish": False, "unexpected_field": "private"})
    assert response.status_code == 422
    assert config_file.read_bytes() == before
    assert client.app.state.settings.policy_auto_publish is True


def test_database_error_never_discloses_driver_details(console, monkeypatch):
    from sqlalchemy.exc import OperationalError

    client, _, _, _ = console
    assert login(client).status_code == 200

    def unavailable(*_args, **_kwargs):
        raise OperationalError("private-sql", {}, Exception("private-password@private-host"))

    monkeypatch.setattr(client.app.state.auth_service, "me", unavailable)
    response = client.get(SESSION)
    assert response.status_code == 503
    assert "private" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_overview_reports_disabled_database_without_secrets(console):
    client, _, _, _ = console
    assert login(client).status_code == 200
    response = client.get("/v1/server-admin/overview")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["database"] == {"enabled": False, "status": "disabled"}
    assert result["server"]["status"] == "running"
    assert result["collection"]["available"] is False
    assert PORTAL_SECRET not in response.text and PASSWORD not in response.text
    assert client.app.state.database_engine is None


def test_collection_views_are_bounded_and_read_only(console, monkeypatch):
    from app.modules.server_admin import public

    client, _, _, _ = console
    assert login(client).status_code == 200
    calls = []

    class ReadOnlyStore:
        def status(self, limit):
            calls.append(("status", limit))
            return {"jobs": {"pending": 1}, "failures": [], "usage": [], "state": {}}

        def changes(self, limit):
            calls.append(("changes", limit))
            return [{"policy_key": "offline:1", "changed_fields": ["title"]}]

        def list_candidates(self, limit):
            calls.append(("candidates", limit))
            return [{"candidate_id": "offline-candidate", "status": "candidate"}]

    monkeypatch.setattr(public, "collection_repository", lambda _: ReadOnlyStore())
    for kind in ("status", "changes", "candidates"):
        result = client.get(f"/v1/server-admin/collection/{kind}?limit=7")
        assert result.status_code == 200
        if kind == "status":
            assert "jobs" in result.json()
        else:
            assert "items" in result.json()
    assert calls == [("status", 7), ("changes", 7), ("candidates", 7)]
    for limit in ("0", "101", "private-invalid-limit"):
        response = client.get(f"/v1/server-admin/collection/changes?limit={limit}")
        assert response.status_code == 422
        assert "private-invalid-limit" not in response.text
    assert len(calls) == 3
    assert client.post("/v1/server-admin/collection/run").status_code in {404, 405}


@pytest.mark.parametrize("path", [LOGIN, SETTINGS])
@pytest.mark.parametrize("chunked", [False, True])
def test_oversized_console_request_is_rejected_before_auth_or_mutation(console, path, chunked):
    client, engine, _, config_file = console
    before = config_file.read_bytes()
    body = json.dumps(
        {"username": "server_admin", "password": "oversize-private-" + "x" * 66000}
        if path == LOGIN else
        {"revision": "0" * 64, "changes": {"policy_auto_publish": False,
                                           "ingestion_discovery_query": "x" * 66000}}
    ).encode()
    content = iter([body[:40000], body[40000:]]) if chunked else body
    response = client.request(
        "POST" if path == LOGIN else "PATCH",
        path,
        content=content,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert "oversize-private" not in response.text
    assert response.headers["cache-control"] == "no-store"
    if chunked:
        assert "content-length" not in response.request.headers
        assert response.request.headers["transfer-encoding"] == "chunked"
    assert client.app.state.auth_service is None
    assert ADMIN_COOKIE not in client.cookies
    assert client.app.state.settings.policy_auto_publish is True
    assert config_file.read_bytes() == before
    with engine.connect() as connection:
        assert connection.execute(select(func.count()).select_from(sessions)).scalar_one() == 0


def test_collection_pause_flag_persists_and_applies_without_running_collection(console):
    client, _, _, config_file = console
    assert login(client).status_code == 200
    assert client.app.state.settings.ingestion_enabled is True
    response = patch(client, {"ingestion_enabled": False})
    assert response.status_code == 200, response.text
    assert response.json()["values"]["ingestion_enabled"] is False
    assert client.app.state.settings.ingestion_enabled is False
    assert client.get(SETTINGS).json()["values"]["ingestion_enabled"] is False
    assert dotenv_values(config_file)["INGESTION_ENABLED"] == "false"
