from email.message import Message
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from app.modules.collectors.kwangwoon_notices import (
    build_kwangwoon_notice_probe_url,
    build_kwangwoon_notice_url,
    collect_kwangwoon_notice,
    collect_kwangwoon_notices,
    fetch_kwangwoon_notice_html,
    parse_kwangwoon_notice,
)
from app.modules.metrics.kwangwoon import count_kwangwoon_notices

NOTICE_HTML = """
<html><head><title>공지사항 등록/장학 상세보기</title></head>
<body>
<nav>로그인 Search</nav>
<div class="notice-title">[등록/장학] 국가근로장학금 신청 안내</div>
<div>조회수 3528 | 작성일 2026.08.06 | 수정일 2026.08.07</div>
<div class="notice-body">
<p>신청기간 : 2026. 8. 7. ~ 8. 13.</p><p>자세한 내용은 첨부파일을 확인하세요.</p>
</div>
<script>이 내용은 저장하지 않습니다.</script>
</body></html>
"""


def test_parse_kwangwoon_notice_extracts_title_date_and_body() -> None:
    title, text, published_at = parse_kwangwoon_notice(NOTICE_HTML)

    assert title == "[등록/장학] 국가근로장학금 신청 안내"
    assert published_at == "2026-08-06"
    assert "신청기간 : 2026. 8. 7. ~ 8. 13." in text
    assert "이 내용은 저장하지 않습니다." not in text


def test_parse_kwangwoon_notice_uses_notice_body_without_page_navigation() -> None:
    html = """
    <nav>사이트 메뉴</nav>
    <div class="board-view-box">
      <div><p class="title"><strong>[등록/장학]</strong> 장학금 신청 안내</p></div>
      <div><p>작성일 2026.10.05</p></div>
      <div class="contents"><p>신청기간 : 2026. 10. 6. ~ 2026. 10. 20.</p></div>
    </div>
    <footer>광운대학교 주소</footer>
    """

    title, text, published_at = parse_kwangwoon_notice(html)

    assert title == "[등록/장학] 장학금 신청 안내"
    assert published_at == "2026-10-05"
    assert "신청기간" in text
    assert "사이트 메뉴" not in text
    assert "광운대학교 주소" not in text


def test_collect_kwangwoon_notice_stores_parsed_document(tmp_path: Path) -> None:
    response = type(
        "Response",
        (),
        {
            "headers": Message(),
            "read": lambda self, size: self.body.read(size),
            "__enter__": lambda self: (
                setattr(self, "body", BytesIO(NOTICE_HTML.encode())), self)[1],
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.kwangwoon_notices.urlopen", return_value=response):
        document = collect_kwangwoon_notice(
            "https://www.kw.ac.kr/ko/life/notice.jsp?DUID=53017", tmp_path
        )

    assert document.title == "[등록/장학] 국가근로장학금 신청 안내"
    assert document.published_at == "2026-08-06"
    assert (tmp_path / f"{document.document_id}.json").exists()


def test_build_kwangwoon_notice_url_forces_category_four() -> None:
    url = build_kwangwoon_notice_url(53018)

    assert "DUID=53018" in url
    assert "srCategoryId=4" in url


def test_build_kwangwoon_notice_probe_url_uses_only_duid() -> None:
    url = build_kwangwoon_notice_probe_url(53018)

    assert "DUID=53018" in url
    assert "srCategoryId" not in url

def test_fetch_kwangwoon_notice_html_returns_original_category_four_html() -> None:
    response = type(
        "Response",
        (),
        {
            "headers": Message(),
            "read": lambda self, size: self.body.read(size),
            "__enter__": lambda self: (
                setattr(self, "body", BytesIO(NOTICE_HTML.encode())), self)[1],
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.kwangwoon_notices.urlopen", return_value=response) as mocked:
        html = fetch_kwangwoon_notice_html(53017)

    assert html == NOTICE_HTML
    assert "srCategoryId=4" in mocked.call_args.args[0].full_url


def test_count_kwangwoon_notices_counts_only_existing_category_four_pages() -> None:
    response = type(
        "Response",
        (),
        {
            "headers": Message(),
            "read": lambda self, size: self.body.read(size),
            "__enter__": lambda self: (
                setattr(self, "body", BytesIO(NOTICE_HTML.encode())), self)[1],
            "__exit__": lambda self, *args: None,
        },
    )()

    def fetch(request: object, timeout: int) -> object:
        if "DUID=53018" in request.full_url and "srCategoryId" not in request.full_url:
            from urllib.error import HTTPError

            raise HTTPError(request.full_url, 404, "Not Found", {}, None)
        return response

    with patch("app.modules.collectors.kwangwoon_notices.urlopen", side_effect=fetch):
        count = count_kwangwoon_notices(53017, 53019)

    assert count == 2


def test_collect_kwangwoon_notices_skips_missing_duids(tmp_path: Path) -> None:
    response = type(
        "Response",
        (),
        {
            "headers": Message(),
            "read": lambda self, size: self.body.read(size),
            "__enter__": lambda self: (
                setattr(self, "body", BytesIO(NOTICE_HTML.encode())), self)[1],
            "__exit__": lambda self, *args: None,
        },
    )()

    def fetch(request: object, timeout: int) -> object:
        if "DUID=53018" in request.full_url:
            from urllib.error import HTTPError

            raise HTTPError(request.full_url, 404, "Not Found", {}, None)
        return response

    with patch("app.modules.collectors.kwangwoon_notices.urlopen", side_effect=fetch):
        documents = collect_kwangwoon_notices(53017, 53019, tmp_path)

    assert len(documents) == 2
