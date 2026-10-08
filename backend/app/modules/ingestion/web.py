"""Allowlisted notice fetches with DNS validation, pinned connections and bounded reads."""

import http.client
import ipaddress
import json
import socket
import ssl
import threading
import time
from html.parser import HTMLParser
from queue import Empty, Queue
from urllib.parse import urljoin, urlsplit

from app.modules.collectors.data_go_kr import CollectionTransportError
from app.modules.discovery.models import canonicalize_url


def public_address(value):
    """Require unicast Internet addresses, including embedded IPv4 destinations."""
    try:
        if "%" in value:
            return False
        address = ipaddress.ip_address(value)
        if (not address.is_global or address.is_multicast or address.is_reserved
                or address.is_unspecified or address.is_loopback or address.is_link_local):
            return False
        if isinstance(address, ipaddress.IPv6Address):
            if address.is_site_local or address.sixtofour is not None or address.teredo is not None:
                return False
            if address.ipv4_mapped is not None:
                return public_address(str(address.ipv4_mapped))
            # Translation prefixes can route globally classified IPv6 to private IPv4.
            if address in ipaddress.ip_network("64:ff9b::/96"):
                return public_address(str(ipaddress.IPv4Address(int(address) & 0xFFFFFFFF)))
        return True
    except (ValueError, TypeError):
        return False


def resolve_public(host, port, timeout=15):
    result = Queue(maxsize=1)
    def lookup():
        try:
            result.put(socket.getaddrinfo(host, port, type=socket.SOCK_STREAM))
        except OSError:
            result.put(None)
    # A stalled resolver must not hold the worker process beyond its budget.
    threading.Thread(target=lookup, daemon=True).start()
    try:
        addresses = result.get(timeout=max(0, timeout))
    except Empty:
        raise CollectionTransportError("notice_dns_timeout", retryable=True) from None
    if addresses is None:
        raise CollectionTransportError("notice_dns_failed", retryable=True)
    if not addresses or any(not public_address(row[4][0]) for row in addresses):
        raise CollectionTransportError("notice_private_address")
    return addresses[0][4][0]


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, address, timeout):
        super().__init__(host, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, self.port), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


class NoticeParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.in_title = False
        self.ignored = 0
        self.main = 0
        self.all_text = []
        self.main_text = []
        self.links = []
        self._active_link = None
        self.published_dates = []
        self.modified_dates = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag == "meta":
            name = (attributes.get("property") or attributes.get("name")
                    or attributes.get("itemprop") or "").strip().lower()
            content = (attributes.get("content") or "").strip()
            if content and name in {
                "article:published_time", "datepublished", "dc.date", "dcterms.created",
                "publishdate", "pubdate",
            } and content not in self.published_dates and len(self.published_dates) < 4:
                self.published_dates.append(content)
            elif content and name in {
                "article:modified_time", "datemodified", "dc.modified", "dcterms.modified",
                "last-modified", "modified",
            } and content not in self.modified_dates and len(self.modified_dates) < 4:
                self.modified_dates.append(content)
        if tag in {"script", "style", "noscript", "nav", "footer", "header"}:
            self.ignored += 1
        if tag in {"main", "article"}:
            self.main += 1
        if tag == "a":
            href = attributes.get("href")
            if href:
                self._active_link = {"href": href, "text": []}

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "a" and self._active_link is not None:
            self.links.append((self._active_link["href"], " ".join(
                self._active_link["text"]).strip()))
            self._active_link = None
        if tag in {"script", "style", "noscript", "nav", "footer", "header"}:
            self.ignored = max(0, self.ignored - 1)
        if tag in {"main", "article"}:
            self.main = max(0, self.main - 1)

    def handle_data(self, value):
        if self.in_title:
            self.title += value
        if self._active_link is not None and value.strip():
            self._active_link["text"].append(value.strip())
        if self.ignored or not value.strip():
            return
        self.all_text.append(value.strip())
        if self.main:
            self.main_text.append(value.strip())


def fetch_notice(url, domains, http_budget):
    """HTTP is not used; each HTTPS redirect rechecks domains, DNS and call budgets."""
    current = canonicalize_url(url, domains)
    for _ in range(4):
        parts = urlsplit(current)
        if parts.scheme != "https":
            raise CollectionTransportError("notice_https_required")
        options = http_budget.before("notice")
        address = resolve_public(parts.hostname, 443,
                                 min(options["timeout"], options["deadline"] - time.monotonic()))
        remaining = min(options["timeout"], options["deadline"] - time.monotonic())
        if remaining <= 0:
            raise CollectionTransportError("request_deadline", retryable=True)
        conn = PinnedHTTPSConnection(parts.hostname, address, remaining)
        try:
            conn.request("GET", parts.path + ("?" + parts.query if parts.query else ""),
                         headers={"User-Agent": "bokji-compass/0.1", "Accept-Encoding": "identity"})
            response = conn.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location:
                    raise CollectionTransportError("notice_invalid_redirect")
                current = canonicalize_url(urljoin(current, location), domains)
                continue
            if response.status != 200:
                retry = response.getheader("Retry-After")
                raise CollectionTransportError(f"http_{response.status}",
                    status_code=response.status, retryable=response.status == 429 or
                    500 <= response.status < 600,
                    retry_after_seconds=int(retry) if retry and retry.isdigit() else None)
            if response.getheader("Content-Encoding", "identity") != "identity":
                raise CollectionTransportError("notice_compression_unsupported")
            if response.headers.get_content_type() not in {"text/html", "application/xhtml+xml"}:
                raise CollectionTransportError("notice_attachment_requires_adapter")
            limit = options["max_response_bytes"]
            declared = response.getheader("Content-Length")
            if declared and declared.isdigit() and int(declared) > limit:
                raise CollectionTransportError("response_too_large")
            raw = bytearray()
            while True:
                remaining = options["deadline"] - time.monotonic()
                if remaining <= 0:
                    raise CollectionTransportError("request_deadline", retryable=True)
                if conn.sock:
                    conn.sock.settimeout(min(options["timeout"], remaining))
                chunk = response.read1(min(65536, limit - len(raw) + 1))
                raw.extend(chunk)
                if len(raw) > limit:
                    raise CollectionTransportError("response_too_large")
                if not chunk:
                    break
            charset = response.headers.get_content_charset() or "utf-8"
            try:
                html = bytes(raw).decode(charset)
            except (UnicodeError, LookupError):
                raise CollectionTransportError("notice_encoding_unsupported") from None
            parser = NoticeParser()
            parser.feed(html)
            text = "\n".join(parser.main_text or parser.all_text)
            if len(text.strip()) < 30 or not parser.title.strip():
                raise CollectionTransportError("notice_content_missing")
            links = []
            for href, label in parser.links[:20]:
                absolute = urljoin(current, href)
                link_parts = urlsplit(absolute)
                if (link_parts.scheme in {"http", "https"} and link_parts.netloc
                        and len(absolute) <= 512):
                    links.append({"label": label[:100], "url": absolute})
            attachments = sorted({url for link in links
                if urlsplit(link["url"]).path.lower().endswith((".pdf", ".hwp", ".hwpx"))
                for url in [link["url"]]})
            published_date = (parser.published_dates[0] if len(parser.published_dates) == 1
                              else json.dumps(parser.published_dates, ensure_ascii=False)
                              if parser.published_dates else "")
            modified_date = (parser.modified_dates[0] if len(parser.modified_dates) == 1
                             else json.dumps(parser.modified_dates, ensure_ascii=False)
                             if parser.modified_dates else "")
            return {"title": parser.title.strip(), "text": text,
                    "source_url": current, "attachments": json.dumps(attachments,
                        ensure_ascii=False), "attachment_status": "not_parsed" if attachments else
                    "none_detected", "links": json.dumps(links, ensure_ascii=False),
                    "published_date": published_date,
                    "modified_date": modified_date}, bytes(raw)
        except (TimeoutError, OSError, http.client.HTTPException):
            raise CollectionTransportError("notice_request_failed", retryable=True) from None
        finally:
            conn.close()
    raise CollectionTransportError("notice_redirect_limit")
