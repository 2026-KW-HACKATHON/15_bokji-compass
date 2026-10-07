"""Bounded category-4 list and detail adapters for the ingestion worker."""

import json
import re
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit
from urllib.request import Request

from app.modules.collectors.data_go_kr import CollectionTransportError
from app.modules.collectors.http import read_response, urlopen, validate_url
from app.modules.collectors.kwangwoon_notices import (
    DEFAULT_KWANGWOON_NOTICE_URL,
    build_kwangwoon_notice_url,
    parse_kwangwoon_notice,
)
from app.modules.collectors.pages import CollectionPage, page_number
from app.modules.discovery.models import canonicalize_url

KWANGWOON_PAGE_SIZE = 10
_CATEGORY = "[등록/장학]"
_VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
              "param", "source", "track", "wbr"}
_IGNORED_TAGS = {"script", "style", "noscript"}
_ICON_CLASSES = {"ico-new", "ico-file", "ico-notice"}


def is_kwangwoon_notice_url(url: str) -> bool:
    """Recognize a reviewed category-4 detail URL without making a request."""
    try:
        _notice_duid(url)
        return True
    except (TypeError, ValueError):
        return False


def _notice_duid(url: str) -> int:
    scheme, _, _ = validate_url(url, hosts={"www.kw.ac.kr"})
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    values = dict(query)
    if (scheme != "https" or parts.path != "/ko/life/notice.jsp"
            or any(sum(key == name for key, _ in query) != 1
                   for name in ("BoardMode", "DUID", "srCategoryId"))
            or values.get("BoardMode") != "view" or values.get("srCategoryId") != "4"):
        raise ValueError("Invalid Kwangwoon category-4 detail URL")
    return page_number(values.get("DUID"), "DUID")


def fetch_kwangwoon_page(*, page: int, per_page: int = KWANGWOON_PAGE_SIZE,
                         timeout: float = 15, max_response_bytes: int = 2_000_000,
                         deadline: float | None = None) -> CollectionPage:
    """Fetch ten normal rows plus the university's separately pinned notices."""
    if not isinstance(page, int) or isinstance(page, bool):
        raise ValueError("page must be a positive integer")
    page_number(page, "page")
    if (isinstance(per_page, bool) or not isinstance(per_page, int)
            or per_page != KWANGWOON_PAGE_SIZE):
        raise ValueError("Kwangwoon pages contain ten normal notices")
    url = DEFAULT_KWANGWOON_NOTICE_URL + "?" + urlencode({
        "BoardMode": "list", "MaxRows": per_page, "tpage": page,
        "searchKey": "1", "searchVal": "", "srCategoryId": "4",
    })
    html, raw = _request_html(url, timeout=timeout, max_response_bytes=max_response_bytes,
                              deadline=deadline)
    tree = _parse_tree(html)
    boards = list(tree.find_class("board-list-box"))
    if len(boards) != 1:
        raise CollectionTransportError("kwangwoon_list_content_missing")
    board = boards[0]
    rows = []
    seen = set()
    normal_numbers = []
    normal_count = 0
    for item in board.find_tag("li"):
        anchors = [link for link in item.find_tag("a")
                   if is_kwangwoon_notice_url(urljoin(url, link.attrs.get("href", "")))]
        if not anchors:
            continue
        if len(anchors) != 1:
            raise CollectionTransportError("kwangwoon_list_invalid")
        anchor = anchors[0]
        title = _clean(anchor.text(skip_icons=True))
        if not title.startswith(_CATEGORY) or not title[len(_CATEGORY):].strip():
            raise CollectionTransportError("kwangwoon_category_mismatch")
        canonical = build_kwangwoon_notice_url(_notice_duid(urljoin(url, anchor.attrs["href"])))
        info = _clean(" ".join(node.text() for node in item.find_class("info")))
        published = _date(info, "작성일")
        modified = _date(info, "수정일")
        if not published:
            raise CollectionTransportError("kwangwoon_list_invalid")
        if "top-notice" not in item.classes:
            normal_count += 1
            number = _clean(" ".join(node.text() for node in item.find_class("no")))
            if not number.isascii() or not number.isdigit() or int(number) < 1:
                raise CollectionTransportError("kwangwoon_list_invalid")
            normal_numbers.append(int(number))
        if canonical not in seen:
            seen.add(canonical)
            rows.append({"url": canonical, "title": title, "organization": "광운대학교",
                         "published_date": published, "modified_date": modified})
    if normal_count > per_page:
        raise CollectionTransportError("kwangwoon_list_invalid")
    if not rows:
        empty_text = _clean(board.text())
        if not re.search(r"(?:게시물|게시글|검색\s*결과|등록된\s*글).*?(?:없습니다|없음)",
                         empty_text):
            raise CollectionTransportError("kwangwoon_list_content_missing")
    current = [_clean(node.text()) for paging in tree.find_class("paging")
               for node in paging.find_class("current")]
    # A genuinely empty first-page board can omit pagination entirely.
    if (current or rows or page != 1) and (len(current) != 1 or current[0] != str(page)):
        raise CollectionTransportError("kwangwoon_page_mismatch")
    if normal_numbers:
        first_number = normal_numbers[0]
        expected = list(range(first_number, max(0, first_number - per_page), -1))
        if normal_numbers != expected:
            raise CollectionTransportError("kwangwoon_list_invalid")
    # Numbered rows exclude pinned notices. Their descending sequence gives the
    # normal-row total, so pins repeated on every page cannot end traversal early.
    total = (page - 1) * per_page + max(normal_numbers) if normal_numbers else (page - 1) * per_page
    return CollectionPage(rows, page, per_page, total, raw)


def fetch_kwangwoon_notice_detail(url: str, domains: list[str], http_budget):
    """Fetch one detail page; retain attachment and image evidence without downloading it."""
    duid = _notice_duid(url)
    # This explicitly configured provider has its own reviewed host, independent
    # of the optional search-discovery domain list passed through the interface.
    canonicalize_url(url, ["www.kw.ac.kr"])
    source_url = build_kwangwoon_notice_url(duid)
    options = http_budget.before("notice")
    html, raw = _request_html(source_url, timeout=options["timeout"],
                              max_response_bytes=options["max_response_bytes"],
                              deadline=options["deadline"])
    tree = _parse_tree(html)
    boards = list(tree.find_class("board-view-box"))
    if len(boards) != 1:
        raise CollectionTransportError("kwangwoon_notice_content_missing")
    try:
        title, text, published = parse_kwangwoon_notice(html)
    except ValueError:
        raise CollectionTransportError("kwangwoon_notice_content_missing") from None
    if not title.startswith(_CATEGORY) or not title[len(_CATEGORY):].strip():
        raise CollectionTransportError("kwangwoon_category_mismatch")
    text = re.sub(r"조회수\s*[\d,]+\s*\|?\s*", "", text).strip()
    board = boards[0]
    attachments = []
    links = []
    for anchor in board.find_tag("a"):
        absolute = _evidence_url(source_url, anchor.attrs.get("href", ""))
        if not absolute:
            continue
        label = _clean(anchor.text(skip_icons=True))
        links.append({"url": absolute, "label": label[:100]})
        parts = urlsplit(absolute)
        if (parts.path.lower() == "/include/download.jsp"
                or parts.path.lower().endswith((".pdf", ".hwp", ".hwpx", ".doc", ".docx",
                                               ".xls", ".xlsx", ".zip", ".png", ".jpg"))
                or re.search(r"\.(?:pdf|hwpx?|docx?|xlsx?|zip|png|jpe?g)$", label, re.I)):
            attachments.append(absolute)
    images = list(dict.fromkeys(value for contents in board.find_class("contents")
        for node in contents.find_tag("img")
        if (value := _evidence_url(source_url, node.attrs.get("src", "")))))
    attachments = list(dict.fromkeys(attachments))
    published = _date(text, "작성일") or published
    modified = _date(text, "수정일")
    return {"title": title, "text": text, "organization": "광운대학교",
            "source_url": source_url, "published_date": published or "",
            "modified_date": modified or "", "attachments": json.dumps(attachments,
                ensure_ascii=False), "attachment_status": "not_parsed" if attachments else
            "none_detected", "image_urls": json.dumps(images, ensure_ascii=False),
            "image_status": "not_parsed" if images else "none_detected",
            "links": json.dumps(links, ensure_ascii=False)}, raw


def _request_html(url, *, timeout, max_response_bytes, deadline):
    validate_url(url, hosts={"www.kw.ac.kr"})
    request = Request(url, headers={"User-Agent": "bokji-compass/0.1"})
    try:
        with urlopen(request, timeout=timeout, deadline=deadline) as response:
            if response.headers.get_content_type() not in {"text/html", "application/xhtml+xml"}:
                raise CollectionTransportError("kwangwoon_html_required")
            raw = read_response(response, max_response_bytes=max_response_bytes, timeout=timeout,
                                deadline=deadline)
            try:
                return raw.decode(response.headers.get_content_charset() or "utf-8"), raw
            except (UnicodeError, LookupError):
                raise CollectionTransportError("notice_encoding_unsupported") from None
    except HTTPError as error:
        raise CollectionTransportError(f"http_{error.code}", status_code=error.code,
            retryable=error.code == 429 or 500 <= error.code < 600) from None


def _evidence_url(base, value):
    if not value:
        return None
    try:
        return canonicalize_url(urljoin(base, value), ["www.kw.ac.kr"])
    except ValueError:
        return None


def _clean(text):
    return re.sub(r"\s+", " ", text).strip()


def _date(text, label):
    match = re.search(label + r"\s*(\d{4})[.-](\d{2})[.-](\d{2})", text)
    if match:
        try:
            return date(*(int(value) for value in match.groups())).isoformat()
        except ValueError:
            pass
    return ""


@dataclass
class _Node:
    tag: str
    attrs: dict[str, str | None] = field(default_factory=dict)
    parts: list = field(default_factory=list)

    @property
    def classes(self):
        return (self.attrs.get("class") or "").split()

    def find_tag(self, tag):
        for part in self.parts:
            if isinstance(part, _Node):
                if part.tag == tag:
                    yield part
                yield from part.find_tag(tag)

    def find_class(self, name):
        for part in self.parts:
            if isinstance(part, _Node):
                if name in part.classes:
                    yield part
                yield from part.find_class(name)

    def text(self, *, skip_icons=False):
        if self.tag in _IGNORED_TAGS or (skip_icons and _ICON_CLASSES.intersection(self.classes)):
            return ""
        return "".join(part.text(skip_icons=skip_icons) if isinstance(part, _Node) else part
                       for part in self.parts)


class _TreeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("document")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = _Node(tag, dict(attrs))
        self.stack[-1].parts.append(node)
        if tag not in _VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in _VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].parts.append(data)


def _parse_tree(html):
    parser = _TreeParser()
    parser.feed(html)
    return parser.root
