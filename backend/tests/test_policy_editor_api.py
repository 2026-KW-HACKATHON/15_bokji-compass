"""Console policy editing requires its own live superadmin session and same-origin requests."""

from unittest.mock import Mock

from app.api import server_admin
from app.modules.storage.publication import PublicationConflict
from tests.test_policy_database import source
from tests.test_server_admin import login

pytest_plugins = ["tests.test_server_admin"]
PATH = "/v1/server-admin/policies/test:editor"


def body():
    s = source()
    return {"version": "a" * 64, "title": "관리자 수정 제목", "organization": "기관",
        "fields": s.fields, "category": "교육", "display": {"summary": "수정 요약"},
        "published": True, "note": "검증 수정"}


def test_editor_authenticated_read_save_actor_conflict_and_validation(console, monkeypatch):
    client, _, admin_id, _ = console
    repo = Mock()
    monkeypatch.setattr(server_admin, "get_repository", lambda _: repo)
    read = Mock(return_value={"policyKey": "test:editor", "published": True})
    save = Mock(return_value=read.return_value)
    monkeypatch.setattr(server_admin.editor, "read_policy_edit", read)
    monkeypatch.setattr(server_admin.editor, "save_policy_edit", save)
    assert client.get(PATH).status_code == 401
    assert client.patch(PATH, json=body()).status_code == 401
    read.assert_not_called()
    save.assert_not_called()
    assert login(client).status_code == 200
    assert client.get(PATH).status_code == 200
    assert client.patch(PATH, json=body(), headers={
        "Origin": "https://foreign.invalid"}).status_code == 403
    save.assert_not_called()
    assert client.patch(PATH, json=body()).status_code == 200
    assert save.call_args.args[3] == admin_id
    save.side_effect = PublicationConflict("공고가 변경됐습니다.")
    assert client.patch(PATH, json=body()).status_code == 409
    count = save.call_count
    for change in ({"category": "임의 분류"}, {"title": " "}, {"fields": {"_editor_bad": "x"}},
                   {"source_url": "javascript:alert(1)"}, {"version": "invalid"}):
        assert client.patch(PATH, json={**body(), **change}).status_code == 422
    assert save.call_count == count
    read.return_value = None
    assert client.get(PATH).status_code == 404


def test_editor_large_source_limit_and_admin_role(console, monkeypatch):
    client, _, _, _ = console
    repo, save = Mock(), Mock(return_value={"published": False})
    monkeypatch.setattr(server_admin, "get_repository", lambda _: repo)
    monkeypatch.setattr(server_admin.editor, "save_policy_edit", save)
    assert login(client, "qr_operator").status_code == 403
    assert client.get(PATH).status_code == 401
    assert login(client).status_code == 200
    large = {**body(), "fields": {"text": "공고 원문" * 30000}}
    assert client.patch(PATH, json=large).status_code == 200
    assert save.call_args.args[2].fields["text"] == large["fields"]["text"]
    count = save.call_count
    assert client.patch(PATH, content=b"x" * 1048577,
                        headers={"Content-Type": "application/json"}).status_code == 413
    assert save.call_count == count
