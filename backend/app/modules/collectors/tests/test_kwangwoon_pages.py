"""Offline coverage for the university's pinned list rows and image-only details."""

import json
import time
from email.message import Message
from io import BytesIO
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import pytest

from app.modules.collectors import kwangwoon_pages as collector
from app.modules.collectors.data_go_kr import CollectionTransportError
from app.modules.collectors.kwangwoon_notices import build_kwangwoon_notice_url


def _row(duid, number=None, *, category=4):
    pinned = 'class="top-notice"' if number is None else 'class=""'
    number_html = "" if number is None else f'<span class="no">{number}</span>'
    href = (f"/ko/life/notice.jsp?BoardMode=view&amp;DUID={duid}"
            f"&amp;tpage=1&amp;srCategoryId={category}")
    return f'''<li {pinned}>{number_html}<div class="board-text">
    <a href="{href}">
    <strong class="category">[등록/장학]</strong> 장학생 선발 {duid}
    <span class="ico-new">신규게시글</span><span class="ico-file">Attachment</span></a>
    <p class="info">조회수 521 | 작성일 2026-10-02 | 수정일 2026-10-06 | 학생복지팀</p>
    </div></li>'''


def _list(rows, page=1):
    return f'''<html><body><nav>{_row(99999, 999)}</nav>
    <div class="board-list-box"><ul>{rows}</ul></div>
    <div class="paging"><a class="current">{page}</a></div></body></html>'''


class Response:
    def __init__(self, html, *, content_type="text/html; charset=utf-8"):
        self.body = BytesIO(html.encode("utf-8"))
        self.headers = Message()
        self.headers["Content-Type"] = content_type

    def read(self, size):
        return self.body.read(size)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None


def _transport(monkeypatch, html):
    opener = Mock(return_value=Response(html))
    monkeypatch.setattr(collector, "urlopen", opener)
    return opener


def _budget():
    return Mock(before=Mock(return_value={"timeout": 3, "max_response_bytes": 300_000,
                                          "deadline": time.monotonic() + 30}))


def test_list_retains_pins_deduplicates_repeated_notices_and_uses_normal_page_size(monkeypatch):
    # A pinned notice can also appear in the numbered list. It is one source.
    html = _list(_row(53420) + _row(53217) + _row(53420)
                 + "".join(_row(53420 - i, 14 - i) for i in range(10)))
    opener = _transport(monkeypatch, html)
    deadline = time.monotonic() + 10
    page = collector.fetch_kwangwoon_page(page=1, timeout=2, max_response_bytes=200_000,
                                          deadline=deadline)

    assert page.per_page == collector.KWANGWOON_PAGE_SIZE == 10
    assert page.total_count == 14
    assert len(page.rows) == 11
    assert len({row["url"] for row in page.rows}) == 11
    assert all("99999" not in row["url"] for row in page.rows)
    assert page.rows[0] == {"url": build_kwangwoon_notice_url(53420),
        "title": "[등록/장학] 장학생 선발 53420", "organization": "광운대학교",
        "published_date": "2026-10-02", "modified_date": "2026-10-06"}
    assert page.raw == html.encode("utf-8")
    query = parse_qs(urlsplit(opener.call_args.args[0].full_url).query)
    assert query["srCategoryId"] == ["4"] and query["tpage"] == ["1"]
    assert query["MaxRows"] == ["10"]
    assert opener.call_args.kwargs == {"timeout": 2, "deadline": deadline}


def test_last_page_repeated_pins_do_not_inflate_the_total(monkeypatch):
    html = _list(_row(53420) + _row(53217)
                 + "".join(_row(53300 - i, 4 - i) for i in range(4)), page=2)
    _transport(monkeypatch, html)
    page = collector.fetch_kwangwoon_page(page=2)
    assert len(page.rows) == 6
    assert page.total_count == 14
    assert page.page * page.per_page >= page.total_count


@pytest.mark.parametrize("html", [
    "<html><h1>서비스 점검</h1></html>",
    _list(""),
    _list(_row(53420, 10, category=3)),
    _list(_row(53420, 10)).replace("작성일 2026-10-02", "작성일 2026-99-99"),
])
def test_malformed_or_noncategory_list_is_not_treated_as_successful_empty(monkeypatch, html):
    _transport(monkeypatch, html)
    with pytest.raises(CollectionTransportError):
        collector.fetch_kwangwoon_page(page=1)


def test_explicit_empty_board_is_valid(monkeypatch):
    _transport(monkeypatch, _list('<li class="no-data">등록된 게시물이 없습니다.</li>'))
    page = collector.fetch_kwangwoon_page(page=1)
    assert page.rows == [] and page.total_count == 0


def test_genuinely_empty_first_page_may_omit_pagination(monkeypatch):
    _transport(monkeypatch, '<div class="board-list-box">등록된 게시물이 없습니다.</div>')
    page = collector.fetch_kwangwoon_page(page=1)
    assert page.rows == [] and page.total_count == 0


def test_server_returning_first_page_instead_of_requested_page_fails(monkeypatch):
    _transport(monkeypatch, _list(_row(53420, 14), page=1))
    with pytest.raises(CollectionTransportError, match="kwangwoon_page_mismatch"):
        collector.fetch_kwangwoon_page(page=2)


def test_partial_numbered_page_is_not_checkpointed_as_the_end(monkeypatch):
    _transport(monkeypatch, _list(_row(53420, 14) + _row(53419, 13)))
    with pytest.raises(CollectionTransportError, match="kwangwoon_list_invalid"):
        collector.fetch_kwangwoon_page(page=1)


def test_list_without_page_marker_cannot_silently_repeat_first_page(monkeypatch):
    html = _list(_row(53420, 1)).replace('<a class="current">1</a>', "")
    _transport(monkeypatch, html)
    with pytest.raises(CollectionTransportError, match="kwangwoon_page_mismatch"):
        collector.fetch_kwangwoon_page(page=1)


@pytest.mark.parametrize("page,per_page", [(True, 10), (0, 10), (1, 20), (1, 10.0)])
def test_invalid_page_bounds_do_not_start_http(monkeypatch, page, per_page):
    opener = Mock(side_effect=AssertionError("No request expected"))
    monkeypatch.setattr(collector, "urlopen", opener)
    with pytest.raises(ValueError):
        collector.fetch_kwangwoon_page(page=page, per_page=per_page)
    opener.assert_not_called()


DETAIL = '''<html><head><title>광운대학교 공지사항 - 상세보기</title></head><body>
<nav>사이트 메뉴<a href="https://example.com/unrelated.pdf">다른 첨부</a></nav>
<div class="board-view-box"><ul><li class="title"><p class="title">
<strong class="category">[등록/장학]</strong> 2026년 든든 학업지원금 선발 안내</p>
<p class="info">조회수 1040 | 작성일 2026.10.02 | 수정일 2026.10.06 | 학생복지팀</p></li>
<li class="attachment"><p><a href="/include/Download.jsp?fuid=35374&amp;ano=53420">
<span class="ico-file">Attachment</span>2026년 연장 공고문.pdf</a></p></li>
<li class="contents"><p><img src="/KWData/webeditor/2026/poster.png" alt="든든학업지원금 포스터">
<script>이것은 공고문이 아니다.</script></p></li></ul></div>
<footer>다음 글과 학교 주소</footer></body></html>'''


def test_image_only_notice_retains_real_attachment_and_image_evidence(monkeypatch):
    opener = _transport(monkeypatch, DETAIL)
    budget = _budget()
    row, raw = collector.fetch_kwangwoon_notice_detail(build_kwangwoon_notice_url(53420),
                                                       ["youth.seoul.go.kr"], budget)
    assert row["title"] == "[등록/장학] 2026년 든든 학업지원금 선발 안내"
    assert row["organization"] == "광운대학교"
    assert row["published_date"] == "2026-10-02"
    assert row["modified_date"] == "2026-10-06"
    assert json.loads(row["attachments"]) == [
        "https://www.kw.ac.kr/include/Download.jsp?fuid=35374&ano=53420"]
    assert json.loads(row["image_urls"]) == ["https://www.kw.ac.kr/KWData/webeditor/2026/poster.png"]
    assert row["attachment_status"] == row["image_status"] == "not_parsed"
    assert all(value not in row["text"] for value in ("조회수", "학교 주소", "사이트 메뉴",
                                                      "공고문이 아니다"))
    assert raw == DETAIL.encode("utf-8")
    budget.before.assert_called_once_with("notice")
    opener.assert_called_once()
    assert opener.call_args.kwargs == {"timeout": 3,
                                        "deadline": budget.before.return_value["deadline"]}


def test_view_counter_changes_do_not_change_detail_source_text(monkeypatch):
    _transport(monkeypatch, DETAIL)
    original, _ = collector.fetch_kwangwoon_notice_detail(build_kwangwoon_notice_url(53420),
                                                         ["www.kw.ac.kr"], _budget())
    _transport(monkeypatch, DETAIL.replace("조회수 1040", "조회수 99,999"))
    later, _ = collector.fetch_kwangwoon_notice_detail(build_kwangwoon_notice_url(53420),
                                                      ["www.kw.ac.kr"], _budget())
    assert original == later


def test_text_notice_retains_body_and_reports_no_unresolved_media(monkeypatch):
    html = DETAIL[:DETAIL.index('<li class="attachment">')] + '''<li class="contents">
    <p>신청기간: 2026.10.07 ~ 2026.10.20</p><p>재학생에게 학업지원금을 지급합니다.</p>
    </li></ul></div><footer>학교 주소</footer></body></html>'''
    _transport(monkeypatch, html)
    row, _ = collector.fetch_kwangwoon_notice_detail(build_kwangwoon_notice_url(53420),
                                                     ["www.kw.ac.kr"], _budget())
    assert "재학생에게 학업지원금을 지급합니다." in row["text"]
    assert json.loads(row["attachments"]) == json.loads(row["image_urls"]) == []
    assert row["attachment_status"] == row["image_status"] == "none_detected"


@pytest.mark.parametrize("url", [
    "https://localhost/ko/life/notice.jsp?BoardMode=view&DUID=1&srCategoryId=4",
    "https://www.kw.ac.kr.evil.example/ko/life/notice.jsp?BoardMode=view&DUID=1&srCategoryId=4",
    "http://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=1&srCategoryId=4",
    "https://www.kw.ac.kr/include/Download.jsp?BoardMode=view&DUID=1&srCategoryId=4",
    "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=1&srCategoryId=3",
    "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=1",
    "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=1&DUID=2&srCategoryId=4",
    "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=0&srCategoryId=4",
])
def test_wrong_urls_are_rejected_before_consuming_budget_or_transport(monkeypatch, url):
    opener = Mock(side_effect=AssertionError("No request expected"))
    monkeypatch.setattr(collector, "urlopen", opener)
    budget = _budget()
    assert not collector.is_kwangwoon_notice_url(url)
    with pytest.raises(ValueError):
        collector.fetch_kwangwoon_notice_detail(url, ["www.kw.ac.kr"], budget)
    budget.before.assert_not_called()
    opener.assert_not_called()


def test_detail_rejects_noncategory_response_even_with_category_url(monkeypatch):
    _transport(monkeypatch, DETAIL.replace("[등록/장학]", "[일반]"))
    with pytest.raises(CollectionTransportError, match="kwangwoon_category_mismatch"):
        collector.fetch_kwangwoon_notice_detail(build_kwangwoon_notice_url(53420),
                                                ["www.kw.ac.kr"], _budget())


def test_detail_obeys_configured_response_size(monkeypatch):
    _transport(monkeypatch, DETAIL)
    budget = _budget()
    budget.before.return_value["max_response_bytes"] = 64
    with pytest.raises(CollectionTransportError, match="response_too_large"):
        collector.fetch_kwangwoon_notice_detail(build_kwangwoon_notice_url(53420),
                                                ["www.kw.ac.kr"], budget)
    budget.before.assert_called_once_with("notice")
