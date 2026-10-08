"""Exercise the real Caddy template on private random ports and a synthetic upstream."""

import os
import shutil
import socket
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def gateway(tmp_path_factory):
    executable = os.environ.get("BOKJI_TEST_CADDY") or shutil.which("caddy")
    if not executable:
        executable = str(ROOT / "tmp/tunnel-tools/caddy/caddy.exe")
    if not Path(executable).is_file():
        pytest.skip("Install Caddy or set BOKJI_TEST_CADDY to run the real gateway checks")
    requests = []

    class Upstream(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append((self.path, dict(self.headers)))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Set-Cookie", "audit=synthetic; HttpOnly")
            self.end_headers()
            self.wfile.write(b'{"status":"synthetic-upstream"}')

        do_POST = do_GET

        def log_message(self, *args):
            pass

    upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    thread = threading.Thread(target=upstream.serve_forever, daemon=True)
    thread.start()
    work = tmp_path_factory.mktemp("tunnel-transport")
    dist = work / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>Isolated transport test</title>")
    with socket.socket() as available:
        available.bind(("127.0.0.1", 0))
        port = available.getsockname()[1]
    template = (ROOT / "frontend/web/deploy/Caddyfile.tunnel").read_text(encoding="utf-8")
    configuration = (
        template.replace("__DIST_ROOT__", dist.as_posix())
        .replace("http://:8080", f"http://:{port}")
        .replace("127.0.0.1:8001", f"127.0.0.1:{upstream.server_port}")
        .replace("127.0.0.1:5181", f"127.0.0.1:{upstream.server_port}")
    )
    config_path = work / "Caddyfile"
    config_path.write_text(configuration, encoding="utf-8")
    environment = {
        **os.environ,
        "XDG_DATA_HOME": str(work / "data"),
        "XDG_CONFIG_HOME": str(work / "config"),
    }
    command = [executable, "--config", str(config_path), "--adapter", "caddyfile"]
    process = None
    try:
        validation = subprocess.run(
            [command[0], "validate", *command[1:]],
            capture_output=True,
            text=True,
            timeout=15,
            env=environment,
        )
        assert validation.returncode == 0, validation.stdout + validation.stderr
        with (work / "caddy.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                [command[0], "run", *command[1:]],
                stdout=log,
                stderr=log,
                env=environment,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            with httpx.Client(
                base_url=f"http://127.0.0.1:{port}",
                follow_redirects=False,
                trust_env=False,
                timeout=3,
            ) as client:
                deadline = time.monotonic() + 10
                while True:
                    try:
                        if client.get("/api/health").status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    assert process.poll() is None, (work / "caddy.log").read_text()
                    assert time.monotonic() < deadline, "Isolated Caddy did not become ready"
                    time.sleep(0.05)
                yield client, requests
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        upstream.shutdown()
        upstream.server_close()
        thread.join(timeout=5)


@pytest.mark.parametrize("protocol", [None, "http", "https,http", "invalid"])
def test_insecure_navigation_redirects_before_static_and_qr_handlers(gateway, protocol):
    client, requests = gateway
    headers = {"Host": "bokji.example"}
    if protocol is not None:
        headers["X-Forwarded-Proto"] = protocol
    for path in ("/?q=audit", "/app-config.js", "/admin/exhibition/"):
        before = len(requests)
        response = client.get(path, headers=headers)
        assert response.status_code == 308
        assert response.headers["location"] == "https://bokji.example" + path
        assert response.headers["cache-control"] == "no-store"
        assert len(requests) == before


@pytest.mark.parametrize("method", ["GET", "HEAD", "POST", "OPTIONS", "PATCH", "DELETE"])
def test_http_api_requests_never_reach_the_upstream(gateway, method):
    client, requests = gateway
    before = len(requests)
    response = client.request(
        method,
        "/api/v1/auth/login",
        headers={"Host": "bokji.example", "X-Forwarded-Proto": "http"},
        content=b"synthetic-invalid-input",
    )
    assert response.status_code == 403
    assert "location" not in response.headers
    assert "set-cookie" not in response.headers
    assert len(requests) == before


def test_http_non_api_writes_are_rejected_without_body_redirect(gateway):
    client, requests = gateway
    before = len(requests)
    response = client.post("/admin/exhibition/", headers={"Host": "bokji.example"})
    assert response.status_code == 403
    assert "location" not in response.headers
    assert len(requests) == before


def test_https_tunnel_requests_preserve_scheme_headers_and_cookie_security(gateway):
    client, requests = gateway
    headers = {"Host": "bokji.example", "X-Forwarded-Proto": "https"}
    page = client.get("/", headers=headers)
    assert page.status_code == 200
    assert "Isolated transport test" in page.text
    assert "style-src-elem 'self'" in page.headers["content-security-policy"]
    assert page.headers["cross-origin-opener-policy"] == "same-origin"
    assert page.headers["cross-origin-resource-policy"] == "same-origin"
    assert page.headers["strict-transport-security"] == "max-age=31536000"
    assert page.headers["cache-control"] == "no-store"
    response = client.post("/api/v1/auth/login", headers=headers)
    assert response.status_code == 200
    assert requests[-1][0] == "/v1/auth/login"
    assert requests[-1][1]["X-Forwarded-Proto"] == "https"
    assert "Secure" in response.headers["set-cookie"]


def test_loopback_checks_work_but_forwarded_http_is_not_exempt(gateway):
    client, _ = gateway
    assert client.get("/api/health").status_code == 200
    response = client.get("/", headers={"Host": "localhost", "X-Forwarded-Proto": "http"})
    assert response.status_code == 308


def test_secure_tunnel_does_not_expose_server_admin(gateway):
    client, requests = gateway
    before = len(requests)
    response = client.get(
        "/api/v1/server-admin/settings",
        headers={"Host": "bokji.example", "X-Forwarded-Proto": "https"},
    )
    assert response.status_code == 404
    assert len(requests) == before


def test_guest_dialogue_reaches_upstream_only_over_https(gateway):
    client, requests = gateway
    path = "/api/v1/assistant/chat/dialogue"
    secure = {"Host": "bokji.example", "X-Forwarded-Proto": "https"}
    response = client.post(path, headers=secure, json={"question": "학생 지원금"})
    assert response.status_code == 200
    assert requests[-1][0] == "/v1/assistant/chat/dialogue"
    assert "Secure" in response.headers["set-cookie"]
    before = len(requests)
    response = client.post(path, headers={**secure, "X-Forwarded-Proto": "http"})
    assert response.status_code == 403
    assert client.post(path + "/admin", headers=secure).status_code == 404
    assert len(requests) == before
