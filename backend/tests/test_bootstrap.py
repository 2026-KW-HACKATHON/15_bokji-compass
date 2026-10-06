from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import OperationalError

from app.core import config
from app.core.config import Settings
from app.core.database import create_database_engine
from app.main import create_app


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    import os

    for key in list(os.environ):
        if key.startswith(("DB_", "APP_", "SERVER_")) or key == "CORS_ORIGINS":
            monkeypatch.delenv(key)


def test_liveness_is_not_database_readiness():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["database"] == "disabled"
        schema = client.get("/openapi.json").json()
        assert set(schema["paths"]) == {
            "/health",
            "/health/ready",
            "/v1/auth/kakao/status",
            "/v1/auth/kakao/start",
            "/v1/auth/kakao/callback",
            "/v1/auth/kakao/pending",
            "/v1/auth/kakao/complete",
            "/v1/auth/kakao/cancel",
            "/v1/auth/signup",
            "/v1/auth/email/request",
            "/v1/auth/email/verify",
            "/v1/auth/login",
            "/v1/auth/logout",
            "/v1/auth/me",
            "/v1/finance/rules",
            "/v1/finance/calculate",
            "/v1/finance/profile",
            "/v1/finance/profile/delete",
            "/v1/mobile/auth/login",
            "/v1/mobile/auth/me",
            "/v1/mobile/auth/logout",
            "/v1/policies",
            "/v1/policies/{policy_key}",
            "/v1/assistant/questions",
            "/v1/auth/username/check",
            "/v1/auth/profile",
            "/v1/admin/session",
            "/v1/admin/accounts",
            "/v1/admin/policies",
            "/v1/admin/policies/{revision_id}",
            "/v1/admin/policies/{revision_id}/publication",
            "/v1/server-admin/login",
            "/v1/server-admin/session",
            "/v1/server-admin/logout",
            "/v1/server-admin/overview",
            "/v1/server-admin/settings",
            "/v1/server-admin/collection/{kind}",
            "/v1/server-admin/operations",
            "/v1/server-admin/schedule",
            "/v1/server-admin/processes",
            "/v1/server-admin/processes/{job_id}",
            "/v1/recommendations",
            "/v1/mobile/notifications/preferences",
            "/v1/mobile/notifications/devices",
            "/v1/mobile/notifications/devices/disable",
            "/v1/policies/calendar",
            "/v1/assistant/faqs",
        }


@pytest.mark.parametrize("available", [True, False])
def test_readiness_and_engine_cleanup(monkeypatch, available):
    engine = MagicMock()
    if not available:
        engine.connect.side_effect = OperationalError("secret", {}, Exception("private password"))
    monkeypatch.setattr("app.main.create_database_engine", lambda _: engine)
    settings = Settings(_env_file=None, db_enabled=True, db_password="example-only")
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")
        assert response.status_code == (200 if available else 503)
        assert "password" not in response.text
        assert "secret" not in response.text
    engine.dispose.assert_called_once()


def test_database_password_required_when_enabled():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, db_enabled=True, db_password="")


def test_policy_auto_publication_defaults_on_and_can_be_disabled(monkeypatch):
    monkeypatch.delenv("POLICY_AUTO_PUBLISH", raising=False)
    assert Settings(_env_file=None).policy_auto_publish is True
    monkeypatch.setenv("POLICY_AUTO_PUBLISH", "false")
    assert Settings(_env_file=None).policy_auto_publish is False


def test_settings_use_backend_path_and_environment_override(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("SERVER_PORT=8011\nDB_ENABLED=false\n", encoding="utf-8")
    monkeypatch.setattr(config, "BACKEND_ROOT", tmp_path)
    monkeypatch.chdir(tmp_path.parent)
    assert config.load_settings().server_port == 8011
    monkeypatch.setenv("SERVER_PORT", "8012")
    assert config.load_settings().server_port == 8012
    monkeypatch.setenv("APP_CONFIG_FILE", "does-not-exist.env")
    with pytest.raises(ValueError, match="does not exist"):
        config.load_settings()


def test_mysql_url_keeps_special_password_without_connecting():
    settings = Settings(_env_file=None, db_password="example@/:#?", db_enabled=True)
    engine = create_database_engine(settings)
    try:
        assert engine.url.password == "example@/:#?"
        assert engine.url.drivername == "mysql+pymysql"
        assert "example@" not in str(engine.url)
    finally:
        engine.dispose()


def test_only_configured_cors_origin_is_allowed():
    settings = Settings(_env_file=None, cors_origins=["http://localhost:5173"])
    with TestClient(create_app(settings)) as client:
        allowed = client.get("/health", headers={"Origin": "http://localhost:5173"})
        denied = client.get("/health", headers={"Origin": "http://untrusted.invalid"})
        assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "access-control-allow-origin" not in denied.headers
