from email.message import Message
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest

from app.modules.collectors.public import collect_notice_from_url, collect_notice_text
from app.modules.storage.public import list_raw_documents


def test_collect_notice_text_saves_original_text(tmp_path: Path) -> None:
    document = collect_notice_text(
        title="청년 주거 지원 공고",
        text="만 19세부터 34세까지 신청할 수 있습니다.",
        source_url="https://example.gov/notices/123",
        storage_path=tmp_path,
    )

    saved_documents = list(list_raw_documents(tmp_path))

    assert document.document_id == "343d9e4c976e3af2"
    assert saved_documents == [document]
    assert (tmp_path / f"{document.document_id}.json").exists()


def test_collect_notice_from_url_extracts_html_text(tmp_path: Path) -> None:
    response = type(
        "Response",
        (),
        {
            "headers": Message(),
            "read": BytesIO((
                "<html><title>지원 공고</title>"
                "<script>ignore()</script><p>신청 조건</p></html>"
            ).encode()).read,
            "__enter__": lambda self: self,
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.public.urlopen", return_value=response):
        document = collect_notice_from_url("https://example.gov/notice/1", tmp_path)

    assert document.title == "지원 공고"
    assert document.text == "신청 조건"


@pytest.mark.parametrize("field", ["title", "text", "source_url"])
def test_collect_notice_text_rejects_missing_required_fields(
    field: str, tmp_path: Path
) -> None:
    values = {
        "title": "공고",
        "text": "공고문 원문",
        "source_url": "https://example.gov/notices/123",
    }
    values[field] = "  "

    with pytest.raises(ValueError, match=field):
        collect_notice_text(**values, storage_path=tmp_path)
