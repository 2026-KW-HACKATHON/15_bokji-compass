"""Production transport checks run before authentication, JSON or database work."""

import pytest
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.auth import get_service
from app.core.config import Settings
from app.core.web_security import WebSecurityMiddleware
from app.main import create_app


def production_app(tmp_path):
    return create_app(
        Settings(
            _env_file=None,
            app_env="production",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "members.sqlite3",
        )
    )


@pytest.mark.parametrize("headers", [{}, {"X-Forwarded-Proto": "https"}])
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/v1/auth/me"),
        ("POST", "/v1/auth/login"),
        ("GET", "/v1/finance/profile"),
        ("GET", "/v1/server-admin/session"),
        ("HEAD", "/v1/policies"),
    ],
)
def test_plain_http_never_reaches_production_services(tmp_path, method, path, headers):
    app = production_app(tmp_path)

    def forbidden():
        pytest.fail("An insecure request must not reach authentication")

    app.dependency_overrides[get_service] = forbidden
    with TestClient(app, base_url="http://bokji.example") as client:
        response = client.request(method, path, headers=headers, content=b"not-json")
        assert response.status_code == 403
        assert response.headers["cache-control"] == "no-store"
        assert "location" not in response.headers
        assert "set-cookie" not in response.headers
        assert "not-json" not in response.text
        assert app.state.auth_service is None
        assert client.get("/health").status_code == 200
    assert not (tmp_path / "members.sqlite3").exists()


@pytest.mark.parametrize("environment", ["development", "test"])
def test_local_development_http_still_works(tmp_path, environment):
    app = create_app(
        Settings(
            _env_file=None,
            app_env=environment,
            db_enabled=False,
            auth_sqlite_path=tmp_path / "members.sqlite3",
        )
    )
    with TestClient(app) as client:
        assert client.get("/v1/finance/rules").status_code == 200


@pytest.mark.parametrize("client_ip,expected", [("127.0.0.1", 200), ("203.0.113.10", 403)])
def test_only_a_trusted_proxy_can_establish_https(tmp_path, client_ip, expected):
    wrapped = ProxyHeadersMiddleware(production_app(tmp_path), trusted_hosts=["127.0.0.1"])
    with TestClient(wrapped, client=(client_ip, 12345)) as client:
        response = client.get("/v1/finance/rules", headers={"X-Forwarded-Proto": "https"})
        assert response.status_code == expected


def test_direct_https_is_accepted_without_forwarding_headers(tmp_path):
    with TestClient(production_app(tmp_path), base_url="https://bokji.example") as client:
        assert client.get("/v1/finance/rules").status_code == 200


@pytest.mark.anyio
async def test_http_body_is_not_consumed_before_transport_rejection():
    async def forbidden(*args):
        pytest.fail("An insecure request must not consume its body or call the app")

    sent = []

    async def send(message):
        sent.append(message)

    middleware = WebSecurityMiddleware(forbidden, cors_origins=[], require_https=True)
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/v1/auth/login",
            "scheme": "http",
            "root_path": "",
            "server": ("bokji.example", 80),
            "query_string": b"",
            "headers": [(b"x-forwarded-proto", b"https")],
        },
        forbidden,
        send,
    )
    assert sent[0]["status"] == 403
