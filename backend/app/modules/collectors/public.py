"""Public entry point for collecting notice text supplied by an adapter."""

import hashlib
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

from app.contracts.public import RawDocument, utc_now_iso
from app.modules.storage.public import DEFAULT_STORAGE_PATH, save_raw_document


def collect_notice_text(
    *,
    title: str,
    text: str,
    source_url: str,
    published_at: str | None = None,
    storage_path: Path = DEFAULT_STORAGE_PATH,
) -> RawDocument:
    """Validate, identify, and store notice text without interpreting its meaning."""

    _validate_required_text("title", title)
    _validate_required_text("text", text)
    _validate_required_text("source_url", source_url)

    document_id = hashlib.sha256(source_url.strip().encode("utf-8")).hexdigest()[:16]
    document = RawDocument(
        document_id=document_id,
        title=title.strip(),
        text=text,
        source_url=source_url.strip(),
        collected_at=utc_now_iso(),
        published_at=published_at,
    )
    return save_raw_document(document, storage_path)


def collect_notice_from_url(
    source_url: str, storage_path: Path = DEFAULT_STORAGE_PATH
) -> RawDocument:
    """Fetch an HTML notice, extract visible text, and store the raw result."""

    _validate_required_text("source_url", source_url)
    request = Request(source_url.strip(), headers={"User-Agent": "bokji-compass/0.1"})
    with urlopen(request, timeout=15) as response:
        html = response.read().decode(response.headers.get_content_charset() or "utf-8")

    parser = _NoticeHtmlParser()
    parser.feed(html)
    title = parser.title.strip() or source_url.strip()
    text = "\n".join(line.strip() for line in parser.text_lines if line.strip())
    return collect_notice_text(
        title=title,
        text=text,
        source_url=source_url,
        storage_path=storage_path,
    )


class _NoticeHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.text_lines: list[str] = []
        self._in_title = False
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        elif tag in {"script", "style", "noscript"}:
            self._ignored_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag in {"script", "style", "noscript"} and self._ignored_depth:
            self._ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        if self._in_title:
            self.title += data
        else:
            self.text_lines.append(data)


def _validate_required_text(field_name: str, value: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")