"""Stable content identities; never reinterpret the historic source_hash contract."""

import hashlib
import json
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from app.contracts.parsing import SourcePolicy

HASH_VERSION = "collection-content-v1"
VOLATILE = {"collected_at", "inqNum", "조회수", "viewCount", "view_count"}


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def canonical_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme.lower() not in {"https", "http"} or not parsed.hostname:
        raise ValueError("Public HTTP URL required")
    if parsed.username or parsed.password:
        raise ValueError("URL credentials are unsupported")
    host = parsed.hostname.encode("idna").decode().lower()
    port = parsed.port
    if port and port not in {80, 443}:
        raise ValueError("Nonstandard URL port")
    netloc = host if not port or (parsed.scheme == "https" and port == 443) or (
        parsed.scheme == "http" and port == 80) else f"{host}:{port}"
    query = sorted((k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
                   if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"})
    return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "/", urlencode(query), ""))


def input_content(source: SourcePolicy) -> dict:
    def clean(value):
        return value.replace("\r\n", "\n").replace("\r", "\n").strip()
    url = source.source_url
    if url:
        try:
            url = canonical_url(url)
        except ValueError:
            pass
    return {"version": HASH_VERSION, "policy_key": source.policy_key,
            "title": clean(source.title), "organization": clean(source.organization),
            "source_url": url,
            "fields": {k: clean(v) for k, v in source.fields.items()
                       if k not in VOLATILE and clean(v)}}


def content_hash(source: SourcePolicy) -> str:
    return digest(input_content(source))


def listing_hash(row: dict) -> str:
    return digest({k: v for k, v in row.items() if k not in VOLATILE})


def changed_fields(previous: dict | None, current: dict) -> list[str]:
    if previous is None:
        return []
    a, b = input_content(SourcePolicy.model_validate(previous)), input_content(
        SourcePolicy.model_validate(current))
    changes = [k for k in ("title", "organization", "source_url") if a[k] != b[k]]
    changes.extend(f"fields.{k}" for k in sorted(a["fields"].keys() | b["fields"].keys())
                   if a["fields"].get(k) != b["fields"].get(k))
    return changes


def matching_title(value: str) -> str:
    # Suggest a review relationship; never merge policy identities.
    return re.sub(r"[\W_]+", "", value).casefold()
