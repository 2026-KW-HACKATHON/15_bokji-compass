"""Public attachment catalog and bounded, locally cached official downloads."""

import hashlib
import json
import re
import threading
from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit
from urllib.request import Request
from uuid import uuid4

from app.core.config import BACKEND_ROOT
from app.modules.collectors.data_go_kr import CollectionTransportError
from app.modules.collectors.http import read_response, urlopen, validate_url

CACHE_ROOT = BACKEND_ROOT / "data" / "policy-attachments"
MAX_FILE_BYTES = 25_000_000
EXTENSIONS = r"pdf|hwpx?|docx?|xlsx?|pptx?|zip|png|jpe?g|gif|txt"
_FILE_LINE = re.compile(r"^\s*Attachment\s*.+\.(?:" + EXTENSIONS + r")\s*$", re.I)
_IDENTIFIER = re.compile(r"^[a-f0-9]{64}$")
_LOCK = threading.RLock()


class AttachmentUnavailable(ValueError):
    """An official file could not be safely retrieved; HTML is never a file."""


def clean_notice_content(value: str) -> str:
    """Remove collector icon/file-list lines only, retaining actual body references."""
    return "\n".join(line for line in value.splitlines() if not _FILE_LINE.fullmatch(line))


def _notice_url(source_url):
    try:
        scheme, _, _ = validate_url(source_url, hosts={"www.kw.ac.kr", "m.kw.ac.kr",
                                                      "www-1.kw.ac.kr"})
        parts = urlsplit(source_url)
        identifiers = parse_qs(parts.query).get("DUID", [])
        if (scheme != "https" or parts.path != "/ko/life/notice.jsp"
                or len(identifiers) != 1 or not re.fullmatch(r"[1-9]\d*", identifiers[0])):
            return None
        from app.modules.collectors.kwangwoon_notices import build_kwangwoon_notice_url
        return build_kwangwoon_notice_url(int(identifiers[0]))
    except (TypeError, ValueError):
        return None


def _file_url(value, source_url):
    scheme, _, _ = validate_url(value, hosts={"www.kw.ac.kr"})
    parts = urlsplit(value)
    if scheme != "https":
        raise ValueError("HTTPS official attachment required")
    if parts.path.lower() == "/include/download.jsp":
        query = parse_qs(parts.query)
        for key in ("fuid", "ano"):
            if len(query.get(key, [])) != 1 or not re.fullmatch(r"[1-9]\d*", query[key][0]):
                raise ValueError("Official file identifier required")
        if query["ano"] != parse_qs(urlsplit(source_url).query)["DUID"]:
            raise ValueError("Attachment must belong to this notice")
    elif not re.search(r"\.(?:" + EXTENSIONS + r")$", parts.path, re.I):
        raise ValueError("Unsupported official attachment path")
    return value


def _filename(value):
    value = re.sub(r"^\s*Attachment\s*", "", str(value or ""), flags=re.I)
    value = re.sub(r"[\x00-\x1f\x7f/\\]", "_", value).strip(" .")[:240]
    return value or "첨부 파일"


def _descriptor(item, source_url):
    if isinstance(item, str):
        item = {"url": item}
    if not isinstance(item, dict):
        raise ValueError("Attachment object required")
    url = _file_url(item.get("url"), source_url)
    return {"id": hashlib.sha256(url.encode()).hexdigest(), "url": url,
            "name": _filename(item.get("name") or item.get("label")
                              or Path(urlsplit(url).path).name)}


def _manifest_path(source_url, root):
    key = hashlib.sha256(source_url.encode()).hexdigest()
    return root / "manifests" / (key + ".json")


def _load_manifest(source_url, root):
    try:
        payload = json.loads(_manifest_path(source_url, root).read_text(encoding="utf-8"))
        if payload.get("source_url") == source_url and isinstance(payload.get("files"), list):
            return payload["files"][:32]
    except (OSError, ValueError, AttributeError):
        pass
    return None


def _atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid4().hex + ".tmp")
    try:
        temporary.write_bytes(payload)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _save_manifest(source_url, files, root):
    _atomic_write(_manifest_path(source_url, root), json.dumps(
        {"source_url": source_url, "files": files}, ensure_ascii=False).encode("utf-8"))


def _source_files(source, source_url, root):
    cached = _load_manifest(source_url, root)
    fields = source.get("fields") or {}
    try:
        if "attachment_files" in fields:
            declared = json.loads(fields["attachment_files"])
            if not isinstance(declared, list):
                return []
            metadata = {item.get("url"): item for item in (cached or [])
                        if isinstance(item, dict)}
            return [{**metadata.get(item.get("url"), {}), **item}
                    if isinstance(item, dict) else item for item in declared]
        if cached is not None:
            return cached
        declared = json.loads(fields.get("attachments") or fields.get("attachment_urls") or "[]")
        return declared or _reference_files(source_url)
    except (TypeError, ValueError):
        return []


@lru_cache(maxsize=1)
def _reference_catalog():
    path = BACKEND_ROOT / "reference" / "attachments" / "kwangwoon.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _reference_files(source_url):
    duid = parse_qs(urlsplit(source_url).query)["DUID"][0]
    catalog = _reference_catalog()
    return catalog.get(duid, []) if isinstance(catalog, dict) else []


def _files(source, root):
    source_url = _notice_url(source.get("source_url"))
    if not source_url:
        return None, []
    values = _source_files(source, source_url, root)
    if not isinstance(values, list):
        return source_url, []
    result, seen = [], set()
    for value in values[:32]:
        try:
            item = _descriptor(value, source_url)
        except (ValueError, TypeError, KeyError):
            continue
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        # Only metadata produced by our downloader can describe a local file.
        if isinstance(value, dict):
            item.update({key: value[key] for key in ("size", "content_type", "sha256")
                         if key in value})
        result.append(item)
    return source_url, result


def _cached_file(item, root):
    identifier = item.get("id", "")
    if not _IDENTIFIER.fullmatch(identifier):
        return None
    path = root / "objects" / (identifier + ".bin")
    try:
        if (path.resolve().is_relative_to(root.resolve()) and path.is_file()
                and 0 < path.stat().st_size == item.get("size") <= MAX_FILE_BYTES
                and _IDENTIFIER.fullmatch(item.get("sha256", ""))):
            return path
    except (OSError, TypeError):
        pass
    return None


def public_attachments(source, policy_key, *, cache_root=None):
    """Return named, same-API file links; listing never makes a network request."""
    root = Path(cache_root) if cache_root is not None else CACHE_ROOT
    _, files = _files(source, root)
    result = []
    for item in files:
        path = f"/v1/policies/{quote(policy_key, safe='')}/attachments/{item['id']}"
        cached = _cached_file(item, root)
        pdf = item["name"].lower().endswith(".pdf") or (
            cached is not None and item.get("content_type") == "application/pdf")
        result.append({"id": item["id"], "name": item["name"], "sourceUrl": item["url"],
                       "downloadUrl": path + "?download=true",
                       "previewUrl": path if pdf else None,
                       "sizeBytes": item.get("size") if cached else None,
                       "contentType": item.get("content_type") if cached else None,
                       "stored": cached is not None})
    return result


def _download(item, source_url, root):
    cached = _cached_file(item, root)
    if cached is not None:
        return cached
    # The official download servlet returns a 200 HTML error without this Referer.
    request = Request(item["url"], headers={"User-Agent": "Mozilla/5.0 bokji-compass/0.1",
                                            "Referer": source_url})
    with urlopen(request, timeout=30) as response:
        payload = read_response(response, max_response_bytes=MAX_FILE_BYTES, timeout=30)
        declared = response.headers.get_content_type()
    if not payload or len(payload) > MAX_FILE_BYTES:
        raise AttachmentUnavailable("empty_or_oversized_file")
    if payload.startswith(b"%PDF-"):
        content_type = "application/pdf"
    else:
        prefix = payload[:1024].lstrip().lower()
        if (declared in {"text/html", "application/xhtml+xml"}
                or b"<html" in prefix or b"<!doctype html" in prefix
                or item["name"].lower().endswith(".pdf")):
            raise AttachmentUnavailable("official_file_response_invalid")
        content_type = "application/octet-stream"
    path = root / "objects" / (item["id"] + ".bin")
    _atomic_write(path, payload)
    item.update(size=len(payload), content_type=content_type,
                sha256=hashlib.sha256(payload).hexdigest())
    return path


def attachment_file(source, identifier, *, cache_root=None):
    """Fetch/cache an attachment already associated with this published source."""
    if not isinstance(identifier, str) or not _IDENTIFIER.fullmatch(identifier):
        raise KeyError("attachment_not_found")
    root = Path(cache_root) if cache_root is not None else CACHE_ROOT
    with _LOCK:
        source_url, files = _files(source, root)
        item = next((item for item in files if item["id"] == identifier), None)
        if item is None:
            raise KeyError("attachment_not_found")
        path = _download(item, source_url, root)
        _save_manifest(source_url, files, root)
        return path, item["name"], item["content_type"]


def sync_notice_attachments(source, *, download=True, refresh=False, cache_root=None):
    """Explicit backfill: discover official filenames/URLs and cache actual files."""
    root = Path(cache_root) if cache_root is not None else CACHE_ROOT
    source_url = _notice_url(source.get("source_url"))
    if not source_url:
        raise ValueError("unsupported_notice_source")
    files = _load_manifest(source_url, root)
    if files is None or refresh:
        from app.modules.collectors.kwangwoon_notices import fetch_kwangwoon_notice_html
        from app.modules.collectors.kwangwoon_pages import parse_kwangwoon_attachment_files
        duid = int(parse_qs(urlsplit(source_url).query)["DUID"][0])
        html = fetch_kwangwoon_notice_html(duid)
        files = [_descriptor(item, source_url) for item in
                 parse_kwangwoon_attachment_files(html, source_url)][:32]
        _save_manifest(source_url, files, root)
    errors = []
    if download:
        for item in files:
            try:
                _download(item, source_url, root)
            except (OSError, ValueError, CollectionTransportError) as error:
                errors.append({"id": item["id"], "error": type(error).__name__})
            # Save each successful file so interrupted backfills can resume.
            _save_manifest(source_url, files, root)
    return {"files": len(files), "stored": sum(_cached_file(item, root) is not None
                                              for item in files), "errors": errors}
