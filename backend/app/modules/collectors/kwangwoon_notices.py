"""Collector for notice detail pages published by Kwangwoon University."""

import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request

from app.contracts.public import RawDocument
from app.modules.collectors.http import read_response, urlopen, validate_url
from app.modules.collectors.public import collect_notice_text
from app.modules.storage.public import DEFAULT_STORAGE_PATH

DEFAULT_KWANGWOON_NOTICE_URL = (
    "https://www.kw.ac.kr/ko/life/notice.jsp"
)
KWANGWOON_NOTICE_CATEGORY_ID = "4"


def build_kwangwoon_notice_url(duid: int) -> str:
    """Build a Kwangwoon notice URL for the welfare-related notice category."""

    if not isinstance(duid, int) or duid < 1:
        raise ValueError("duid must be a positive integer")
    query = urlencode(
        {
            "BoardMode": "view",
            "DUID": duid,
            "searchKey": "1",
            "searchVal": "",
            "srCategoryId": KWANGWOON_NOTICE_CATEGORY_ID,
        }
    )
    return f"{DEFAULT_KWANGWOON_NOTICE_URL}?{query}"


def build_kwangwoon_notice_probe_url(duid: int) -> str:
    """Build a detail URL that checks existence using only the DUID."""

    if not isinstance(duid, int) or duid < 1:
        raise ValueError("duid must be a positive integer")
    query = urlencode({"BoardMode": "view", "DUID": duid})
    return f"{DEFAULT_KWANGWOON_NOTICE_URL}?{query}"


def find_latest_kwangwoon_duid() -> int:
    """Find the largest DUID currently linked from the all-notices list."""

    html = _fetch_html(DEFAULT_KWANGWOON_NOTICE_URL)
    duids = [int(value) for value in re.findall(r"DUID=(\d+)", html)]
    if not duids:
        raise ValueError("No Kwangwoon notice DUIDs found")
    return max(duids)


def collect_kwangwoon_notice(
    source_url: str = build_kwangwoon_notice_url(53017),
    storage_path: Path = DEFAULT_STORAGE_PATH,
) -> RawDocument:
    """Fetch, parse, and store one Kwangwoon University notice."""

    if not isinstance(source_url, str) or not source_url.strip():
        raise ValueError("source_url must be a non-empty string")

    source_url = _force_notice_category(source_url)
    html = _fetch_html(source_url)

    title, text, published_at = parse_kwangwoon_notice(html)
    return collect_notice_text(
        title=title,
        text=text,
        source_url=source_url,
        published_at=published_at,
        storage_path=storage_path,
    )


def fetch_kwangwoon_notice_html(duid: int) -> str:
    """Fetch the original category-4 detail HTML for a passed DUID."""

    return _fetch_html(build_kwangwoon_notice_url(duid))


def fetch_kwangwoon_notice_probe(duid: int) -> str:
    """Fetch a notice page using only its DUID to check whether it exists."""

    return _fetch_html(build_kwangwoon_notice_probe_url(duid))


def collect_kwangwoon_notices(
    start_duid: int,
    end_duid: int,
    storage_path: Path = DEFAULT_STORAGE_PATH,
) -> list[RawDocument]:
    """Collect existing notices while skipping missing DUID pages."""

    if not isinstance(start_duid, int) or not isinstance(end_duid, int):
        raise ValueError("start_duid and end_duid must be integers")
    if start_duid < 1 or end_duid < start_duid:
        raise ValueError("start_duid must be positive and no greater than end_duid")

    documents = []
    for duid in range(start_duid, end_duid + 1):
        try:
            fetch_kwangwoon_notice_probe(duid)
            documents.append(
                collect_kwangwoon_notice(build_kwangwoon_notice_url(duid), storage_path)
            )
        except (HTTPError, ValueError):
            continue
    return documents


def _fetch_html(source_url: str) -> str:
    validate_url(source_url, hosts={"www.kw.ac.kr"})
    request = Request(source_url, headers={"User-Agent": "bokji-compass/0.1"})
    with urlopen(request, timeout=15) as response:
        return read_response(response).decode(response.headers.get_content_charset() or "utf-8")


def _force_notice_category(source_url: str) -> str:
    """Keep caller URL parameters while always restricting the category to 4."""

    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(source_url.strip())
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["srCategoryId"] = KWANGWOON_NOTICE_CATEGORY_ID
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def parse_kwangwoon_notice(html: str) -> tuple[str, str, str | None]:
    """Extract the title, visible notice text, and publication date from HTML."""

    parser = _KwangwoonNoticeParser()
    parser.feed(html)
    lines = _normalized_lines(parser.board_view_parts or parser.text_parts)
    full_text = "\n".join(lines)

    title = next(
        (line for line in lines if re.match(r"^\[[^\]]+\]\s*.+", line)),
        "",
    )
    published_match = re.search(r"작성일\s*(\d{4}\.\d{2}\.\d{2})", full_text)
    published_at = published_match.group(1).replace(".", "-") if published_match else None

    if not title:
        raise ValueError("Kwangwoon notice title could not be found")
    if not full_text.strip():
        raise ValueError("Kwangwoon notice text could not be found")
    return title, full_text, published_at


class _KwangwoonNoticeParser(HTMLParser):
    _ignored_tags = {"script", "style", "noscript"}
    _block_tags = {"br", "div", "li", "p", "tr", "section"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.board_view_parts: list[str] = []
        self._ignored_depth = 0
        self._board_view_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "div" and (self._board_view_depth or "board-view-box" in
                             (attributes.get("class") or "").split()):
            self._board_view_depth += 1
        if tag in self._ignored_tags:
            self._ignored_depth += 1
        elif not self._ignored_depth and tag in self._block_tags:
            self.text_parts.append("\n")
            if self._board_view_depth:
                self.board_view_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._ignored_tags and self._ignored_depth:
            self._ignored_depth -= 1
        elif not self._ignored_depth and tag in self._block_tags:
            self.text_parts.append("\n")
            if self._board_view_depth:
                self.board_view_parts.append("\n")
        if tag == "div" and self._board_view_depth:
            self._board_view_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth:
            self.text_parts.append(data)
            if self._board_view_depth:
                self.board_view_parts.append(data)


def _normalized_lines(parts: list[str]) -> list[str]:
    text = "".join(parts).replace("\xa0", " ")
    normalized = (re.sub(r"\s+", " ", line).strip() for line in text.splitlines())
    return [line for line in normalized if line]
