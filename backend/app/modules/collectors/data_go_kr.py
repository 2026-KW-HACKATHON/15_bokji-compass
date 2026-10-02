"""Shared HTTP client for data.go.kr public APIs.

This module handles common request concerns such as service-key injection,
query encoding, and HTTP transport. Dataset-specific collectors such as
``gov24_services`` and ``bokjiro_services`` remain responsible for parsing
their own response formats and applying dataset-specific rules.
"""

import math
import re
import time
from collections.abc import Mapping
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.core.config import load_settings

DEFAULT_MAX_RESPONSE_BYTES = 2_000_000


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# A call consumes exactly one provider request and never forwards its service key to
# a redirect target. Keep the local urlopen symbol available for offline transports.
urlopen = build_opener(_NoRedirect()).open


class CollectionError(RuntimeError):
    """Safe machine-readable failure; never expose request URLs or remote error text."""

    def __init__(self, code: str, *, retryable: bool = False,
                 status_code: int | None = None, retry_after_seconds: int | None = None):
        safe_code = code if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", code) else "collector_error"
        super().__init__(safe_code)
        self.code = safe_code
        self.retryable = retryable
        self.status_code = status_code
        self.retry_after_seconds = retry_after_seconds


class CollectionTransportError(CollectionError):
    """HTTP, timeout, transport, deadline or response-size failure."""


class CollectionAPIError(CollectionError):
    """An unsuccessful provider business result, without its untrusted message."""


def _remaining_timeout(timeout: float, deadline: float | None) -> float:
    if deadline is None:
        return timeout
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise CollectionTransportError("request_deadline", retryable=True)
    return min(timeout, remaining)


def _retry_after(value: str | None) -> int | None:
    if not value:
        return None
    try:
        if value.isascii() and value.isdigit():
            return int(value)
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            return None
        return max(0, math.ceil((parsed - datetime.now(UTC)).total_seconds()))
    except (TypeError, ValueError, OverflowError):
        return None


def _read_bounded(response, limit: int, timeout: float, deadline: float | None) -> bytes:
    headers = getattr(response, "headers", None)
    length = headers.get("Content-Length") if headers is not None else None
    if length and str(length).isdigit() and (len(str(length)) > 20 or int(length) > limit):
        raise CollectionTransportError("response_too_large")
    chunks = []
    size = 0
    read = getattr(response, "read1", response.read)
    while True:
        remaining_timeout = _remaining_timeout(timeout, deadline)
        # urllib's HTTPResponse exposes its socket through its buffered stream. Updating
        # it prevents a later read from inheriting the full timeout after the deadline.
        raw = getattr(getattr(response, "fp", None), "raw", None)
        sock = getattr(raw, "_sock", None)
        if sock is not None:
            sock.settimeout(remaining_timeout)
        chunk = read(min(65_536, limit - size + 1))
        _remaining_timeout(timeout, deadline)
        if not chunk:
            return b"".join(chunks)
        size += len(chunk)
        if size > limit:
            raise CollectionTransportError("response_too_large")
        chunks.append(chunk)


def request_data_go_kr(
    api_url: str,
    *,
    params: Mapping[str, object] | None = None,
    api_key: str | None = None,
    timeout: float = 15,
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    deadline: float | None = None,
) -> bytes:
    """Request a data.go.kr endpoint using the shared service key.

    Dataset-specific collectors should parse the returned bytes according to
    their own API contract rather than putting parsing rules here.
    """

    if (isinstance(timeout, bool) or not isinstance(timeout, (int, float))
            or not math.isfinite(timeout) or timeout <= 0):
        raise ValueError("timeout must be positive and finite")
    if (isinstance(max_response_bytes, bool) or not isinstance(max_response_bytes, int)
            or max_response_bytes < 1):
        raise ValueError("max_response_bytes must be a positive integer")
    if deadline is not None and (
            isinstance(deadline, bool) or not isinstance(deadline, (int, float))
            or not math.isfinite(deadline)):
        raise ValueError("deadline must be a finite monotonic timestamp")
    parts = urlsplit(api_url)
    if (parts.scheme not in {"https", "http"} or not parts.hostname
            or parts.username or parts.password or parts.fragment):
        raise ValueError("api_url must be an HTTP(S) URL without credentials")
    _remaining_timeout(timeout, deadline)
    resolved_key = api_key or load_settings().data_go_kr_api_key.get_secret_value()
    if not resolved_key or not resolved_key.strip():
        raise ValueError("api_key or DATA_GO_KR_API_KEY must be provided")

    query = dict(params or {})
    query.setdefault("serviceKey", resolved_key.strip())
    query_string = urlencode(query)
    separator = "&" if "?" in api_url else "?"
    request = Request(
        f"{api_url}{separator}{query_string}",
        headers={"User-Agent": "bokji-compass/0.1"},
    )
    try:
        with urlopen(request, timeout=_remaining_timeout(timeout, deadline)) as response:
            return _read_bounded(response, max_response_bytes, timeout, deadline)
    except HTTPError as error:
        status = error.code
        retry_after = _retry_after(error.headers.get("Retry-After") if error.headers else None)
        error.close()
        raise CollectionTransportError(
            f"http_{status}", status_code=status,
            retryable=status in {408, 425, 429} or 500 <= status <= 599,
            retry_after_seconds=retry_after,
        ) from None
    except (TimeoutError, URLError, OSError, HTTPException):
        raise CollectionTransportError("request_failed", retryable=True) from None
