"""Attack payloads are rejected before parsing, mutation, or outbound connections."""

import json
import socket
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select

from app.core.config import Settings
from app.core.web_security import WebSecurityMiddleware
from app.main import create_app
from app.modules.auth.models import accounts
from app.modules.auth.service import password_hash
from app.modules.collectors.data_go_kr import CollectionTransportError
from app.modules.ingestion import web
from app.modules.server_admin import operations, runtime

PASSWORD = "SecurityTestPassword42!"
PROFILE = "/v1/auth/profile"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        _env_file=None,
        app_env="test",
        db_enabled=False,
        auth_sqlite_path=tmp_path / "members.db",
        cors_origins=["https://trusted.example"],
    )
    with TestClient(
        create_app(settings), base_url="https://bokji.example", headers={"X-Auth-Request": "1"}
    ) as client:
        assert client.get("/v1/auth/me").status_code == 401
        service = client.app.state.auth_service
        hashed = password_hash(PASSWORD)
        with service.engine.begin() as connection:
            connection.execute(
                insert(accounts),
                [
                    {
                        "id": name,
                        "username": name,
                        "name": name,
                        "password_hash": hashed,
                        "gender": "undisclosed",
                        "created_at": 1,
                    }
                    for name in ("member", "second")
                ],
            )
        assert (
            client.post(
                "/v1/auth/login",
                json={
                    "username": "member",
                    "password": PASSWORD,
                },
            ).status_code
            == 200
        )
        yield client


@pytest.mark.parametrize(
    "headers",
    [
        {"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
        {"Origin": "https://sub.bokji.example", "Sec-Fetch-Site": "same-site"},
        {"Origin": "https://bokji.example.evil.example"},
        {"Origin": "https://bokji.example@evil.example"},
        {"Origin": "https://bokji.example:444"},
        {"Origin": "https://bokji.example:0"},
        {"Origin": "http://bokji.example"},
        {"Origin": "https://bokji.example/path"},
        {"Origin": "https://bokji.example#fragment"},
        {"Origin": "null"},
        {"Sec-Fetch-Site": "cross-site"},
        {"Sec-Fetch-Site": "same-site"},
        {"Sec-Fetch-Site": "invalid"},
    ],
)
def test_cross_site_write_never_changes_member(client, headers):
    response = client.post(PROFILE, json={"name": "attacker"}, headers=headers)
    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/v1/auth/me").json()["user"]["name"] == "member"


@pytest.mark.parametrize(
    "headers",
    [
        {},  # Native/CLI clients do not send browser metadata.
        {"Origin": "https://bokji.example", "Sec-Fetch-Site": "same-origin"},
        {"Origin": "https://bokji.example:443", "Sec-Fetch-Site": "same-origin"},
        {"Origin": "https://trusted.example", "Sec-Fetch-Site": "cross-site"},
    ],
)
def test_explicitly_trusted_writes_work(client, headers):
    response = client.post(PROFILE, json={"name": "allowed"}, headers=headers)
    assert response.status_code == 200
    if headers.get("Origin") == "https://trusted.example":
        assert response.headers["access-control-allow-origin"] == "https://trusted.example"


@pytest.mark.parametrize(
    "headers",
    [
        [("Origin", "https://bokji.example"), ("Origin", "https://evil.example")],
        [("Sec-Fetch-Site", "same-origin"), ("Sec-Fetch-Site", "cross-site")],
        [("X-Auth-Request", "1"), ("X-Auth-Request", "1")],
    ],
)
def test_ambiguous_security_headers_are_rejected(client, headers):
    assert client.post(PROFILE, json={"name": "attacker"}, headers=headers).status_code == 403


@pytest.mark.parametrize(
    "content_type",
    [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=a",
        "application/javascript",
    ],
)
def test_non_json_write_is_rejected_before_mutation(client, content_type):
    response = client.post(
        PROFILE, content='{"name":"attacker"}', headers={"Content-Type": content_type}
    )
    assert response.status_code == 415
    assert client.get("/v1/auth/me").json()["user"]["name"] == "member"


def test_json_and_empty_logout_are_supported(client):
    assert (
        client.post(
            PROFILE,
            content='{"name":"allowed"}',
            headers={
                "Content-Type": "application/json; charset=utf-8",
            },
        ).status_code
        == 200
    )
    assert client.post("/v1/auth/logout").status_code == 200
    assert client.get("/v1/auth/me").status_code == 401


@pytest.mark.parametrize("declared", [None, "1", "9999999999999999999999"])
def test_actual_body_size_is_bounded_even_without_honest_content_length(client, declared):
    headers = {"Content-Type": "application/json"}
    if declared:
        headers["Content-Length"] = declared
    response = client.post(PROFILE, content=iter([b"a" * 140_000, b"b" * 140_000]), headers=headers)
    assert response.status_code == 413
    assert client.get("/v1/auth/me").json()["user"]["name"] == "member"


@pytest.mark.anyio
async def test_chunked_body_never_reaches_json_parser():
    reached = False

    async def downstream(scope, receive, send):
        nonlocal reached
        reached = True

    chunks = iter(
        [
            {"type": "http.request", "body": b"a" * 140_000, "more_body": True},
            {"type": "http.request", "body": b"b" * 140_000, "more_body": False},
        ]
    )
    sent = []

    async def receive():
        return next(chunks)

    async def send(message):
        sent.append(message)

    middleware = WebSecurityMiddleware(downstream, cors_origins=[])
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": PROFILE,
            "scheme": "https",
            "root_path": "",
            "server": ("bokji.example", 443),
            "query_string": b"",
            "headers": [(b"content-type", b"application/json")],
        },
        receive,
        send,
    )
    assert not reached
    assert sent[0]["status"] == 413


def test_security_headers_and_preflight_remain_available(client):
    response = client.get("/v1/auth/me")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cross-origin-resource-policy"] == "same-origin"
    assert response.headers["cross-origin-opener-policy"] == "same-origin"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert "sec-fetch-site" in response.headers["vary"].lower()
    response = client.options(
        PROFILE,
        headers={
            "Origin": "https://trusted.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type,X-Auth-Request",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://trusted.example"


@pytest.mark.parametrize("method", ["GET", "HEAD"])
@pytest.mark.parametrize(
    "headers",
    [
        {
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
        },
        {"Sec-Fetch-Site": "same-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "image"},
        {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "script"},
        {"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe"},
        {"Origin": "https://evil.example"},
        {"Origin": "https://sub.bokji.example", "Sec-Fetch-Site": "same-site"},
        {"Sec-Fetch-Site": "invalid"},
        {"Origin": "https://trusted.example", "Sec-Fetch-Site": "cross-site"},
        [("Sec-Fetch-Site", "same-origin"), ("Sec-Fetch-Site", "cross-site")],
        [("Sec-Fetch-Mode", "cors"), ("Sec-Fetch-Mode", "no-cors")],
        [("Sec-Fetch-Dest", "empty"), ("Sec-Fetch-Dest", "image")],
        [("Origin", "https://bokji.example"), ("Origin", "https://trusted.example")],
    ],
)
def test_cross_origin_search_probes_are_rejected_before_auth_or_database(client, method, headers):
    from app.api.auth import get_service
    from app.api.policies import get_repository

    def forbidden():
        pytest.fail("A rejected probe must not reach authentication or search")

    client.app.dependency_overrides[get_service] = forbidden
    client.app.dependency_overrides[get_repository] = forbidden
    for path in ("/v1/auth/me", "/v1/policies?eligible_only=true&q=secret", "/v1/policies/missing"):
        response = client.request(method, path, headers=headers)
        assert response.status_code == 403
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["cross-origin-resource-policy"] == "same-origin"
        assert "set-cookie" not in response.headers
        assert "location" not in response.headers


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty"},
        {"Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"},
        {
            "Origin": "https://trusted.example",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        },
    ],
)
def test_native_same_origin_and_explicit_cors_reads_still_work(client, headers):
    response = client.get("/v1/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["user"]["name"] == "member"
    if headers.get("Origin"):
        assert response.headers["access-control-allow-origin"] == "https://trusted.example"


def test_console_reads_do_not_inherit_member_cors_permissions(client):
    response = client.get(
        "/v1/server-admin/session",
        headers={
            "Origin": "https://trusted.example",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        },
    )
    assert response.status_code == 403


@pytest.mark.parametrize("path", ["/v1/auth/kakao/callback", "/v1/mobile/auth/kakao/authorize"])
def test_oauth_allows_top_level_callback_but_rejects_embedded_flow_consumption(client, path):
    navigation = client.get(
        path,
        headers={
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
        },
        follow_redirects=False,
    )
    assert navigation.status_code != 403  # Existing OAuth/configuration validation handles it.
    for dest, mode in (("iframe", "navigate"), ("image", "no-cors"), ("empty", "cors")):
        response = client.get(
            path,
            headers={
                "Sec-Fetch-Site": "cross-site",
                "Sec-Fetch-Mode": mode,
                "Sec-Fetch-Dest": dest,
            },
            follow_redirects=False,
        )
        assert response.status_code == 403
        assert "set-cookie" not in response.headers


def test_console_never_inherits_member_cors_permissions(client):
    response = client.post(
        "/v1/server-admin/login",
        json={
            "username": "member",
            "password": PASSWORD,
        },
        headers={"Origin": "https://trusted.example", "Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    "body",
    [
        b'{"name":"member","name":"attacker"}',
        b'{"name":',
        b"[" * 2000 + b"0" + b"]" * 2000,
    ],
)
def test_ambiguous_or_deep_json_is_rejected_safely(client, body):
    response = client.post(PROFILE, content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert "attacker" not in response.text
    assert client.get("/v1/auth/me").json()["user"]["name"] == "member"


def test_trusted_cors_client_can_read_security_errors(client):
    response = client.post(
        PROFILE,
        content="name=attacker",
        headers={
            "Content-Type": "text/plain",
            "Origin": "https://trusted.example",
            "Sec-Fetch-Site": "cross-site",
        },
    )
    assert response.status_code == 415
    assert response.headers["access-control-allow-origin"] == "https://trusted.example"


@pytest.mark.parametrize(
    "payload",
    [
        "x'; UPDATE auth_accounts SET name='hacked'; --",
        '<img src=x onerror="alert(1)">',
    ],
)
def test_profile_payload_is_literal_data_and_cannot_change_other_accounts(client, payload):
    response = client.post(PROFILE, json={"name": payload})
    assert response.status_code == 200
    assert response.json()["user"]["name"] == payload
    with client.app.state.auth_service.engine.connect() as connection:
        stored = dict(connection.execute(select(accounts.c.id, accounts.c.name)).all())
    assert stored == {"member": payload, "second": "second"}
    assert (
        client.post(
            "/v1/auth/login",
            json={
                "username": "' OR 1=1 --",
                "password": PASSWORD,
            },
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "0.0.0.0",
        "224.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "fe80::1%eth0",
        "ff02::1",
        "fec0::1",
        "2002:7f00:1::",
        "2001:0:4136:e378:8000:63bf:3fff:fdd2",
        "64:ff9b::a00:1",
        "not-an-address",
    ],
)
def test_dns_rejects_internal_multicast_and_transition_addresses(address, monkeypatch):
    records = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
        (socket.AF_INET6, socket.SOCK_STREAM, 6, "", (address, 443)),
    ]
    monkeypatch.setattr(web.socket, "getaddrinfo", lambda *args, **kwargs: records)
    with pytest.raises(CollectionTransportError, match="private_address"):
        web.resolve_public("official.example", 443)


@pytest.mark.parametrize("address", ["93.184.216.34", "2606:4700:4700::1111"])
def test_dns_still_allows_public_unicast(address, monkeypatch):
    monkeypatch.setattr(
        web.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443)),
        ],
    )
    assert web.resolve_public("official.example", 443) == address


@pytest.mark.parametrize(
    "changes",
    [
        {"action": "Restart; calc.exe"},
        {"action": "-Command"},
        {"target": "all & calc.exe"},
        {"job_id": "../job"},
        {"job_id": str(uuid4()) + " -Command calc.exe"},
    ],
)
def test_runtime_command_rejects_injected_arguments(changes):
    values = {"action": "Restart", "target": "backend", "job_id": str(uuid4()), **changes}
    with pytest.raises(runtime.RuntimeErrorCode, match="invalid_command"):
        runtime.command(**values)


def test_fixed_runtime_command_uses_separate_arguments():
    job = str(uuid4())
    command = runtime.command("Restart", target="backend", job_id=job)
    assert command[command.index("-File") + 1] == str(runtime.SCRIPT)
    assert command[-2:] == ["-JobId", job]
    assert "-Command" not in command


def test_scheduler_rejects_injected_action_before_launch(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("Injected input must never reach subprocess")

    monkeypatch.setattr(operations.subprocess, "run", forbidden)
    with pytest.raises(operations.OperationError, match="invalid_command"):
        operations.scheduler("Install; calc.exe")


def test_login_rejects_unexpected_privilege_fields(client):
    response = client.post(
        "/v1/auth/login",
        content=json.dumps(
            {
                "username": "member",
                "password": PASSWORD,
                "is_admin": True,
            }
        ),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert PASSWORD not in response.text
