"""Isolate browser API reads/writes and bound bodies before JSON parsing."""

import json
from urllib.parse import urlsplit

from starlette.requests import Request
from starlette.responses import JSONResponse

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
OAUTH_NAVIGATIONS = frozenset(
    {"/v1/auth/kakao/callback", "/v1/mobile/auth/kakao/authorize"}
)


def unique_json_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def origin_key(value: str) -> tuple[str, str, int] | None:
    """Compare exact origins, including default ports; reject ambiguous URL syntax."""
    if not value or any(ord(char) <= 32 or ord(char) == 127 for char in value) or "\\" in value:
        return None
    try:
        parts = urlsplit(value)
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username is not None
            or parts.password is not None
            or parts.path not in {"", "/"}
            or parts.query
            or parts.fragment
        ):
            return None
        port = parts.port if parts.port is not None else (443 if parts.scheme == "https" else 80)
        return parts.scheme, parts.hostname.lower(), port
    except ValueError:
        return None


def trusted_browser_write(request: Request, cors_origins: list[str]) -> bool:
    origins = request.headers.getlist("origin")
    sites = request.headers.getlist("sec-fetch-site")
    if len(origins) > 1 or len(sites) > 1:
        return False
    allowed = {origin_key(str(request.base_url))}
    allowed.update(origin_key(value) for value in cors_origins)
    allowed.discard(None)
    # Non-browser clients have neither header. Cookie APIs also require X-Auth-Request.
    if origins and origin_key(origins[0]) not in allowed:
        return False
    if sites:
        if sites[0] not in {"same-origin", "same-site", "cross-site", "none"}:
            return False
        if sites[0] in {"same-site", "cross-site"} and not origins:
            return False
    return True


def body_limit(path: str, method: str) -> int:
    if path.startswith("/v1/server-admin/"):
        if method == "PATCH" and path.startswith("/v1/server-admin/policies/"):
            return 1_048_576
        return 65_536
    return 262_144


def trusted_browser_read(request: Request, cors_origins: list[str]) -> bool:
    """Stop cross-site search/login oracles before authentication or database work."""
    names = ("origin", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest")
    values = {name: request.headers.getlist(name) for name in names}
    if any(len(items) > 1 for items in values.values()):
        return False
    site = request.headers.get("sec-fetch-site")
    mode = request.headers.get("sec-fetch-mode")
    dest = request.headers.get("sec-fetch-dest")
    if site not in {None, "same-origin", "same-site", "cross-site", "none"}:
        return False
    # OAuth alone accepts external top-level navigation. Embedding must not consume a flow.
    if request.url.path in OAUTH_NAVIGATIONS:
        return mode in {None, "navigate"} and dest in {None, "document"}
    allowed = {origin_key(str(request.base_url))}
    allowed.update(origin_key(value) for value in cors_origins)
    allowed.discard(None)
    if values["origin"] and origin_key(values["origin"][0]) not in allowed:
        return False
    if site in {"same-site", "cross-site"}:
        # Only an explicitly trusted CORS fetch may read from another origin.
        return bool(values["origin"]) and mode == "cors" and dest == "empty"
    # Native clients/CLI have no Fetch Metadata. Existing authentication still applies.
    return True


class WebSecurityMiddleware:
    """Check read isolation first; buffer only bounded writes before JSON parsing."""

    def __init__(self, app, *, cors_origins: list[str]):
        self.app = app
        self.cors_origins = cors_origins

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/v1/"):
            await self.app(scope, receive, send)
            return
        request = Request(scope)

        async def reject(status, detail):
            response = JSONResponse(
                {"detail": detail},
                status_code=status,
                headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
            )
            await response(scope, receive, send)

        origins = [] if scope["path"].startswith("/v1/server-admin/") else self.cors_origins
        if scope["method"] in {"GET", "HEAD"}:
            if not trusted_browser_read(request, origins):
                await reject(403, "허용된 사이트에서 요청해 주세요.")
                return
            await self.app(scope, receive, send)
            return
        if scope["method"] not in WRITE_METHODS:
            await self.app(scope, receive, send)
            return
        if not trusted_browser_write(request, origins):
            await reject(403, "허용된 사이트에서 요청해 주세요.")
            return
        maximum = body_limit(scope["path"], scope["method"])
        lengths = request.headers.getlist("content-length")
        if lengths:
            if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
                await reject(400, "요청 크기 형식이 올바르지 않아요.")
                return
            # Compare text first so an arbitrarily long integer cannot exhaust parsing.
            declared = lengths[0].lstrip("0") or "0"
            if len(declared) > len(str(maximum)) or int(declared) > maximum:
                await reject(413, "요청 내용이 허용된 크기를 초과했어요.")
                return
        chunks, total = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > maximum:
                await reject(413, "요청 내용이 허용된 크기를 초과했어요.")
                return
            if chunk:
                chunks.append(chunk)
            if not message.get("more_body", False):
                break
        if total:
            types = request.headers.getlist("content-type")
            if len(types) != 1 or types[0].split(";", 1)[0].strip().lower() != "application/json":
                await reject(415, "JSON 형식으로 요청해 주세요.")
                return
        body = b"".join(chunks)
        if body:
            try:
                json.loads(body, object_pairs_hook=unique_json_fields)
            except (ValueError, RecursionError):
                await reject(422, "JSON 요청 형식을 확인해 주세요.")
                return
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
