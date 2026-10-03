"""Shared site keeps configured MySQL, privacy keys and callback destinations."""

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api import policies
from app.core.config import Settings
from app.main import create_app


def test_share_settings_keep_database_privacy_and_kakao_configuration(monkeypatch):
    path = Path(__file__).resolve().parents[1] / "scripts/share-server.py"
    spec = importlib.util.spec_from_file_location("share_server", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    configured = Settings(
        _env_file=None, app_env="production", db_enabled=True, db_password="test-only",
        db_host="policy-db.example", db_port=3308, db_name="policy_test",
        kakao_redirect_uri="https://shared.example/api/auth/kakao/callback",
        kakao_web_url="https://shared.example",
        cors_origins=["https://old.example"],
    )
    monkeypatch.setattr(module, "load_settings", lambda: configured)
    result = module.share_settings()
    assert result.db_enabled
    assert (result.db_host, result.db_port, result.db_name) == (
        "policy-db.example", 3308, "policy_test")
    assert result.db_password == configured.db_password
    assert result.auth_uses_mysql
    assert result.app_env == "production"
    assert result.auth_encryption_keys == configured.auth_encryption_keys
    assert result.auth_lookup_key == configured.auth_lookup_key
    assert result.kakao_redirect_uri == configured.kakao_redirect_uri
    assert result.kakao_web_url == configured.kakao_web_url
    assert result.cors_origins == []
    assert result.server_host == "127.0.0.1"
    assert result.server_port == 8001


def test_share_policy_reads_use_configured_mysql(monkeypatch):
    mysql = MagicMock()
    repository = MagicMock()
    monkeypatch.setattr("app.main.create_database_engine", lambda _: mysql)
    constructor = MagicMock(return_value=repository)
    monkeypatch.setattr(policies, "PolicyRepository", constructor)
    listing = MagicMock(return_value={"items": [], "total": 0, "nextCursor": None})
    monkeypatch.setattr(policies.catalog, "list_policies", listing)
    settings = Settings(_env_file=None, db_enabled=True, db_password="test-only")
    app = create_app(settings)
    with TestClient(app, headers={"X-Auth-Request": "1"}) as client:
        assert client.get("/health/ready").status_code == 200
        response = client.get("/v1/policies?limit=6&sort=recent")
        assert response.status_code == 200
        assert response.json()["total"] == 0
        constructor.assert_called_once_with(mysql)
        assert listing.call_args.args[0] is repository
    mysql.dispose.assert_called_once()


@pytest.mark.parametrize("environment", ["development", "production"])
def test_share_auth_never_falls_back_to_sqlite_outside_tests(tmp_path, environment):
    account_path = tmp_path / "must-not-exist.sqlite3"
    settings = Settings(_env_file=None, app_env=environment, db_enabled=False,
                        auth_sqlite_path=account_path)
    with TestClient(create_app(settings), headers={"X-Auth-Request": "1"}) as client:
        response = client.post("/v1/auth/login", json={
            "username": "existing", "password": "Password123!",
        })
        assert response.status_code == 503
        assert "MySQL" in response.json()["detail"]
    assert not account_path.exists()
