"""Public-site HTTP transport for explicit legacy collectors; no local files or redirects."""

import http.client
import socket
import time
from contextlib import contextmanager
from urllib.error import HTTPError
from urllib.parse import urlsplit

from app.modules.collectors.data_go_kr import CollectionTransportError, _read_bounded
from app.modules.discovery.models import public_hostname
from app.modules.ingestion.web import PinnedHTTPSConnection, resolve_public

MAX_RESPONSE_BYTES = 2_000_000


def validate_url(value: str, *, hosts: set[str] | None = None) -> tuple[str, str, int]:
    if (not isinstance(value, str) or not value or len(value) > 2048 or "\\" in value
            or any(ord(char) <= 32 or ord(char) == 127 for char in value)):
        raise ValueError("A public HTTP(S) URL is required")
    try:
        parts = urlsplit(value)
        host = public_hostname(parts.hostname or "")
        port = parts.port or (443 if parts.scheme == "https" else 80)
    except ValueError:
        raise ValueError("A public HTTP(S) URL is required") from None
    if (parts.scheme not in {"http", "https"} or parts.username is not None
            or parts.password is not None or parts.fragment
            or port not in ({443} if parts.scheme == "https" else {80, 8088})
            or (hosts is not None and host not in hosts)):
        raise ValueError("A public HTTP(S) URL on an allowed host and port is required")
    return parts.scheme, host, port


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host, address, port, timeout):
        super().__init__(host, port=port, timeout=timeout)
        self.address = address

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)


@contextmanager
def urlopen(request, timeout=15, *, deadline=None):
    """Connect to one validated public address, ignoring environment proxy settings."""
    value = request.full_url
    scheme, host, port = validate_url(value)
    explicit_deadline = deadline is not None
    deadline = min(deadline, time.monotonic() + timeout) if explicit_deadline else (
        time.monotonic() + timeout)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise CollectionTransportError("request_deadline", retryable=True)
    address = resolve_public(host, port, remaining if explicit_deadline else timeout)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise CollectionTransportError("request_deadline", retryable=True)
    connection = (PinnedHTTPSConnection(host, address, remaining) if scheme == "https"
                  else _PinnedHTTPConnection(host, address, port, remaining))
    try:
        parts = urlsplit(value)
        headers = dict(request.header_items())
        headers["Accept-Encoding"] = "identity"
        connection.request("GET", (parts.path or "/") + ("?" + parts.query if parts.query else ""),
                           headers=headers)
        response = connection.getresponse()
        if response.status != 200:
            raise HTTPError("", response.status, "Public-site request failed", response.headers,
                            None)
        if response.getheader("Content-Encoding", "identity").lower() != "identity":
            raise CollectionTransportError("response_encoding_unsupported")
        response._collector_deadline = deadline
        yield response
    except HTTPError:
        raise
    except (OSError, TimeoutError, http.client.HTTPException):
        raise CollectionTransportError("request_failed", retryable=True) from None
    finally:
        connection.close()


def read_response(response, *, max_response_bytes=None, timeout=15, deadline=None) -> bytes:
    response_deadline = getattr(response, "_collector_deadline", time.monotonic() + timeout)
    if deadline is not None:
        response_deadline = min(response_deadline, deadline)
    return _read_bounded(response, max_response_bytes or MAX_RESPONSE_BYTES, timeout,
                         response_deadline)
