"""Actual file delivery, immutable body evidence and publication/access boundaries."""

import hashlib
import io
import json
from email.message import Message
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.api.policies import get_repository
from app.core.config import Settings
from app.main import create_app
from app.modules.attachments import public
from app.modules.collectors.kwangwoon_notices import build_kwangwoon_notice_url
from app.modules.collectors.kwangwoon_pages import parse_kwangwoon_attachment_files
from app.modules.normalization.raw import normalize_record
from app.modules.storage import catalog
from tests.test_policy_search import add_policy
from tests.test_policy_search import repository as search_repository

NOTICE = "https://www.kw.ac.kr/ko/life/notice.jsp?BoardMode=view&DUID=53187&srCategoryId=4"
URL = "https://www.kw.ac.kr/include/Download.jsp?fuid=35180&ano=53187"
FILE = {"url": URL, "name": "공식 안내.pdf"}
SOURCE = {"source_url": NOTICE, "fields": {"attachment_files": json.dumps([FILE])}}
PDF = b"%PDF-1.4\nsynthetic fixture only\n%%EOF"


@pytest.fixture
def repository():
    yield from search_repository.__wrapped__()


class Response(io.BytesIO):
    def __init__(self, payload, content_type):
        super().__init__(payload)
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["Content-Length"] = str(len(payload))


def transport(monkeypatch, payload=PDF, content_type="application/octet-stream"):
    opener = Mock(side_effect=lambda *args, **kwargs: Response(payload, content_type))
    monkeypatch.setattr(public, "urlopen", opener)
    return opener


def test_file_list_removed_but_real_document_instructions_and_source_are_retained():
    original = "공고 제목\nAttachment공식 안내.pdf\nAttachment신청서.hwp\n신청서.pdf를 제출하세요."
    assert public.clean_notice_content(original) == "공고 제목\n신청서.pdf를 제출하세요."
    assert "Attachment공식 안내.pdf" in original
    assert public.clean_notice_content("첨부한 가이드북 (1／2).pdf를 참고하세요.") == (
        "첨부한 가이드북 (1／2).pdf를 참고하세요.")


def test_html_files_have_names_without_icon_and_exclude_navigation_or_foreign_links():
    html = f'''<a href="{URL}">사이트 메뉴.pdf</a><div class="board-view-box">
    <li class="attachment"><a href="/include/Download.jsp?fuid=35180&amp;ano=53187">
    <span class="ico-file">Attachment</span>공식 안내.pdf</a>
    <a href="{URL}">중복.pdf</a><a href="https://evil.example/a.pdf">외부.pdf</a></li>
    <li class="contents"><a href="{URL}">본문에서 참조</a></li></div>'''
    assert parse_kwangwoon_attachment_files(html, NOTICE) == [FILE]


def test_collected_names_and_urls_survive_normalization_for_future_notices(tmp_path):
    row = {"document_id": "fixture", "title": "새 공고", "organization": "광운대학교",
           "source_url": NOTICE, "text": "실제 공고 본문",
           "attachments": json.dumps([URL]), "attachment_files": json.dumps([FILE]),
           "attachment_status": "not_parsed"}
    source = normalize_record(row)
    assert json.loads(source.fields["attachment_files"]) == [FILE]
    assert public.public_attachments(source.model_dump(), source.policy_key,
                                     cache_root=tmp_path)[0]["name"] == "공식 안내.pdf"


def test_fresh_servers_have_real_links_for_seeded_notices_without_network(tmp_path, monkeypatch):
    opener = transport(monkeypatch)
    reference = public._reference_catalog()
    assert len(reference) == 190
    total = 0
    for duid, files in reference.items():
        source = {"source_url": build_kwangwoon_notice_url(int(duid)), "fields": {}}
        attachments = public.public_attachments(source, "notice:fixture", cache_root=tmp_path)
        assert len(attachments) == len(files)
        assert all(not item["stored"] for item in attachments)
        total += len(attachments)
    assert total == 238
    opener.assert_not_called()


def test_actual_collector_empty_list_overrides_older_reference_files(tmp_path):
    source = {"source_url": NOTICE, "fields": {"attachment_files": "[]"}}
    assert public.public_attachments(source, "fixture", cache_root=tmp_path) == []


def test_download_uses_required_referrer_and_reuses_actual_cached_bytes(tmp_path, monkeypatch):
    opener = transport(monkeypatch)
    before = public.public_attachments(SOURCE, "notice:fixture", cache_root=tmp_path)
    assert not before[0]["stored"]
    opener.assert_not_called()
    path, name, content_type = public.attachment_file(SOURCE, before[0]["id"], cache_root=tmp_path)
    assert path.read_bytes() == PDF
    assert name == "공식 안내.pdf" and content_type == "application/pdf"
    request = opener.call_args.args[0]
    assert request.get_header("Referer").startswith("https://www.kw.ac.kr/ko/life/notice.jsp?")
    assert opener.call_args.kwargs["timeout"] == 30
    after = public.public_attachments(SOURCE, "notice:fixture", cache_root=tmp_path)[0]
    assert after["stored"] and after["sizeBytes"] == len(PDF)
    assert after["downloadUrl"].startswith("/v1/policies/notice%3Afixture/attachments/")
    assert public.attachment_file(SOURCE, after["id"], cache_root=tmp_path)[0] == path
    assert opener.call_count == 1


@pytest.mark.parametrize("payload,content_type", [
    (b"<html>HTTP 404</html>", "text/html"),
    (b"<!doctype html><html>failure</html>", "application/octet-stream"),
    (b"not a PDF", "application/octet-stream"), (b"", "application/pdf"),
])
def test_200_html_or_invalid_pdf_is_never_saved_as_an_attachment(
    tmp_path, monkeypatch, payload, content_type
):
    transport(monkeypatch, payload, content_type)
    identifier = public.public_attachments(SOURCE, "fixture", cache_root=tmp_path)[0]["id"]
    with pytest.raises(public.AttachmentUnavailable):
        public.attachment_file(SOURCE, identifier, cache_root=tmp_path)
    assert not list(tmp_path.rglob("*.bin"))


@pytest.mark.parametrize("url", [
    "https://127.0.0.1/a.pdf", "file:///C:/secret.pdf", "https://evil.example/a.pdf",
    "https://www.kw.ac.kr.evil.example/a.pdf", URL.replace("https:", "http:"),
    URL.replace("ano=53187", "ano=53188"), URL + "&ano=53187",
    "https://www.kw.ac.kr/include/Download.jsp?fuid=1", "https://www.kw.ac.kr/script.jsp",
])
def test_unrelated_and_unsafe_file_urls_cannot_be_downloaded(tmp_path, monkeypatch, url):
    opener = transport(monkeypatch)
    source = {"source_url": NOTICE, "fields": {"attachment_files": json.dumps([
        {"url": url, "name": "안내.pdf"}])}}
    assert public.public_attachments(source, "fixture", cache_root=tmp_path) == []
    with pytest.raises(KeyError):
        public.attachment_file(source, hashlib.sha256(url.encode()).hexdigest(),
                               cache_root=tmp_path)
    opener.assert_not_called()


def test_new_collection_removes_obsolete_files_even_if_older_manifest_exists(tmp_path, monkeypatch):
    transport(monkeypatch)
    identifier = public.public_attachments(SOURCE, "fixture", cache_root=tmp_path)[0]["id"]
    public.attachment_file(SOURCE, identifier, cache_root=tmp_path)
    source = {"source_url": NOTICE, "fields": {"attachment_files": "[]"}}
    assert public.public_attachments(source, "fixture", cache_root=tmp_path) == []


def test_public_detail_and_file_routes_preserve_original_and_check_publication(
    repository, tmp_path, monkeypatch
):
    monkeypatch.setattr(public, "CACHE_ROOT", tmp_path / "files")
    opener = transport(monkeypatch)
    fields = {**SOURCE["fields"], "text": "제목\nAttachment공식 안내.pdf\n신청서.pdf 제출"}
    add_policy(repository, "notice:fixture", fields=fields)
    documents = repository.tables["condition_documents"]
    with repository.engine.begin() as connection:
        source = connection.execute(select(documents.c.source_json)).scalar_one()
        source["source_url"] = NOTICE
        connection.execute(update(documents).values(source_json=source))

    def get_revision(revision_id):
        with repository.engine.connect() as connection:
            row = connection.execute(select(documents).where(
                documents.c.revision_id == revision_id,
                documents.c.review_status == "published")).mappings().first()
            return dict(row) if row else None

    repository.get_revision = get_revision
    app = create_app(Settings(_env_file=None, app_env="test", db_enabled=False,
                              auth_sqlite_path=tmp_path / "accounts.sqlite3"))
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as client:
        detail = client.get("/v1/policies/notice:fixture").json()
        assert detail["content"] == detail["sourceFields"]["text"] == "제목\n신청서.pdf 제출"
        assert get_revision(detail["revisionId"])["source_json"]["fields"]["text"] == fields["text"]
        file = detail["attachments"][0]
        opener.assert_not_called()
        assert client.get("/v1/policies/notice:fixture/attachments/" + "f" * 64).status_code == 404
        preview = client.get(file["previewUrl"])
        assert preview.status_code == 200 and preview.content == PDF
        assert preview.headers["content-type"] == "application/pdf"
        assert preview.headers["content-disposition"].startswith("inline;")
        downloaded = client.get(file["downloadUrl"])
        assert downloaded.content == PDF
        assert downloaded.headers["content-disposition"].startswith("attachment;")
        partial = client.get(file["previewUrl"], headers={"Range": "bytes=0-4"})
        assert partial.status_code == 206 and partial.content == b"%PDF-"
        with repository.engine.begin() as connection:
            connection.execute(update(documents).values(review_status="reviewed"))
        assert client.get(file["previewUrl"]).status_code == 404
        assert opener.call_count == 1


def test_catalog_body_cleanup_leaves_database_fields_unchanged(repository):
    original = "첫 줄\nAttachment공식 안내.pdf\n서류를 제출하세요."
    add_policy(repository, "fixture", fields={"text": original})
    assert catalog.get_policy(repository, "fixture")["content"] == "첫 줄\n서류를 제출하세요."
    with repository.engine.connect() as connection:
        assert connection.execute(select(repository.tables["condition_documents"].c.source_json
            )).scalar_one()["fields"]["text"] == original
