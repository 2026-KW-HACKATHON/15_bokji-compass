"""Only a current superadmin session may inspect drafts or change publication."""

from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, update
from sqlalchemy.exc import OperationalError

from app.api import admin
from app.core.config import Settings
from app.main import create_app
from app.modules.admin.access import admin_grants
from app.modules.admin.provision import create_operator
from app.modules.auth.schema import initialize_auth_schema
from app.modules.storage.public import PublicationConflict

REVISION = str(uuid4())
PATH = f"/v1/admin/policies/{REVISION}"
BODY = {"action": "publish", "expected_status": "draft", "note": "원문 검토 완료"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "admin.sqlite3"
    engine = create_engine("sqlite:///" + path.as_posix())
    settings = Settings(_env_file=None, app_env="test", auth_sqlite_path=path, db_enabled=False)
    initialize_auth_schema(engine)
    identity = create_operator(
        engine,
        "test_admin",
        "TestPassword42!",
        role="superadmin",
    )
    create_operator(engine, "qr_helper", "TestPassword42!", role="qr_admin")
    repository = Mock()
    loader = Mock(return_value=repository)
    monkeypatch.setattr(admin, "get_repository", loader)
    app = create_app(settings)
    with TestClient(app, headers={"X-Auth-Request": "1"}) as value:
        value.loader, value.repository = loader, repository
        value.auth_engine, value.identity = engine, identity
        yield value
    engine.dispose()


def login(client, username="test_admin"):
    assert (
        client.post(
            "/v1/auth/login", json={"username": username, "password": "TestPassword42!"}
        ).status_code
        == 200
    )


def test_drafts_and_publication_require_superadmin_before_loading_database(client):
    for path in ("/v1/admin/policies", PATH):
        assert client.get(path).status_code == 401
    assert client.post(PATH + "/publication", json=BODY).status_code == 401
    login(client, "qr_helper")
    for path in ("/v1/admin/policies", PATH):
        assert client.get(path, headers={"X-Role": "superadmin"}).status_code == 403
    assert client.post(PATH + "/publication", json=BODY).status_code == 403
    client.loader.assert_not_called()


def test_superadmin_list_review_change_and_immediate_revocation(client, monkeypatch):
    login(client)
    listing = Mock(return_value={"items": [], "total": 0, "nextCursor": None})
    review = Mock(return_value={"revisionId": REVISION})
    change = Mock(return_value={"revisionId": REVISION, "reviewStatus": "published"})
    monkeypatch.setattr(admin.storage, "list_publication_revisions", listing)
    monkeypatch.setattr(admin.storage, "review_publication_revision", review)
    monkeypatch.setattr(admin.storage, "set_publication_status", change)
    response = client.get("/v1/admin/policies?limit=10&cursor=20")
    assert response.status_code == 200
    assert response.json()["autoPublish"] is True
    assert response.headers["cache-control"] == "no-store"
    listing.assert_called_once_with(client.repository, limit=10, offset=20)
    assert client.get(PATH).status_code == 200
    assert client.post(PATH + "/publication", json=BODY).status_code == 200
    change.assert_called_once_with(
        client.repository,
        REVISION,
        action="publish",
        expected_status="draft",
        actor_id=client.identity,
        note="원문 검토 완료",
    )
    with client.auth_engine.begin() as connection:
        connection.execute(
            update(admin_grants)
            .where(admin_grants.c.account_id == client.identity)
            .values(role="qr_admin")
        )
    assert client.post(PATH + "/publication", json=BODY).status_code == 403
    assert change.call_count == 1


def test_publication_csrf_payload_uuid_and_error_boundaries(client, monkeypatch):
    login(client)
    change = Mock(return_value={})
    monkeypatch.setattr(admin.storage, "set_publication_status", change)
    assert (
        client.post(PATH + "/publication", json=BODY, headers={"X-Auth-Request": ""}).status_code
        == 403
    )
    for payload in (
        {**BODY, "matching_enabled": True},
        {**BODY, "action": "approve"},
        {**BODY, "note": ""},
        {**BODY, "expected_status": "anything"},
    ):
        assert client.post(PATH + "/publication", json=payload).status_code == 422
    assert client.get("/v1/admin/policies/not-a-uuid").status_code == 422
    change.assert_not_called()
    for error, code in (
        (PublicationConflict("상태 변경"), 409),
        (LookupError(), 404),
        (ValueError("secret source"), 422),
        (OperationalError("private SQL", {}, Exception("secret")), 503),
    ):
        change.side_effect = error
        response = client.post(PATH + "/publication", json=BODY)
        assert response.status_code == code
        assert "secret" not in response.text and "private SQL" not in response.text


def test_publication_review_missing_revision_returns_404(client, monkeypatch):
    login(client)
    monkeypatch.setattr(admin.storage, "review_publication_revision", Mock(return_value=None))
    assert client.get(PATH).status_code == 404
