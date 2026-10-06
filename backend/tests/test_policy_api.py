"""Member HTTP boundary tests, with isolated account DB and a deterministic model."""

from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, update
from sqlalchemy.exc import OperationalError

from app.api import assistant, policies
from app.contracts.assistance import PolicyAnswer
from app.core.config import Settings
from app.main import create_app
from app.modules.assistant import public
from app.modules.auth.models import accounts
from app.modules.auth.service import password_hash
from app.modules.normalization.raw import normalize_record

REVISION = str(uuid4())
BODY = {"revision_id": REVISION, "question": "지원 대상은 누구인가요?"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "accounts.sqlite3",
        )
    )
    repo = Mock()
    record = normalize_record(
        {"document_id": "fixture-only", "title": "검증용 공고", "text": "신청자 만 19세 이상"}
    )
    repo.get_revision.return_value = {
        "source_json": record.model_dump(),
        "review_status": "published",
    }
    monkeypatch.setattr(assistant, "get_repository", lambda request: repo)
    with TestClient(app, headers={"X-Auth-Request": "1"}) as value:
        assert value.get("/v1/auth/me").status_code == 401
        with app.state.auth_service.engine.begin() as connection:
            for index, region, age in ((1, "서울", 27), (2, "경기", 65)):
                connection.execute(
                    insert(accounts).values(
                        **dict(
                            id=f"private-id-{index}",
                            username=f"member{index}",
                            name="private-name",
                            phone=f"0100000000{index}",
                            password_hash=password_hash("Password123!"),
                            age=age,
                            gender="undisclosed",
                            region=region,
                            created_at=1,
                        )
                    )
                )
        value.repository = repo
        yield value


def login(client, index=1, mobile=False):
    path = "/v1/mobile/auth/login" if mobile else "/v1/auth/login"
    result = client.post(path, json={"username": f"member{index}", "password": "Password123!"})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["access_token"]} if mobile else {}


def test_cookie_bearer_profiles_are_isolated_and_no_client_profile_override(client, monkeypatch):
    seen = []

    def answer(source, question, profile, settings, output):
        seen.append(profile.model_dump())
        assert settings.codex_timeout_seconds == 60
        return PolicyAnswer(
            status="grounded",
            answer="만 19세 이상입니다.",
            citations=[{"source_field": "text", "quote": "만 19세 이상"}],
            follow_up_questions=[],
        ), {"model": "fixture"}

    monkeypatch.setattr(public, "answer_policy_question", answer)
    login(client)
    first = client.post("/v1/assistant/questions", json=BODY)
    assert first.status_code == 200 and not first.json()["preview"]
    assert first.headers["cache-control"] == "no-store"
    token = login(client, index=2, mobile=True)
    assert client.post("/v1/assistant/questions", json=BODY, headers=token).status_code == 200
    assert seen == [
        {"region": "서울", "age_band": "20대", "interests": []},
        {"region": "경기", "age_band": "60대", "interests": []},
    ]
    rejected = client.post("/v1/assistant/questions", json={**BODY, "profile": {"id": "secret"}})
    assert rejected.status_code == 422 and "secret" not in rejected.text
    assert len(seen) == 2
    for authorization in ("", "Basic abc", "Bearer invalid"):
        assert (
            client.post(
                "/v1/assistant/questions", json=BODY, headers={"Authorization": authorization}
            ).status_code
            == 401
        )
    client.post("/v1/mobile/auth/logout", headers=token, json={})
    assert client.post("/v1/assistant/questions", json=BODY, headers=token).status_code == 401


@pytest.mark.parametrize("age,region", [(None, None), (None, "부산"), (0, None)])
def test_questions_work_with_incomplete_member_profile(client, monkeypatch, age, region):
    received = []

    def answer(source, question, profile, settings, output):
        received.append(profile.model_dump())
        return PolicyAnswer(
            status="grounded", answer="만 19세 이상입니다.",
            citations=[{"source_field": "text", "quote": "만 19세 이상"}],
            follow_up_questions=[],
        ), {"model": "fixture"}

    monkeypatch.setattr(public, "answer_policy_question", answer)
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(accounts).where(accounts.c.id == "private-id-1")
                           .values(age=age, region=region))
    login(client)
    response = client.post("/v1/assistant/questions", json=BODY)
    assert response.status_code == 200
    assert received == [{"region": region, "age_band": None if age is None else "10세 미만",
                         "interests": []}]


def test_unauthorized_drafts_guard_and_invalid_questions_never_invoke_model(client, monkeypatch):
    model = Mock()
    monkeypatch.setattr(public, "answer_policy_question", model)
    assert client.post("/v1/assistant/questions", json=BODY).status_code == 401
    client.repository.get_revision.assert_not_called()
    login(client)
    client.repository.get_revision.return_value = None
    assert client.post("/v1/assistant/questions", json=BODY).status_code == 404
    for body in (
        {**BODY, "question": " "},
        {**BODY, "question": "x" * 2001},
        {**BODY, "include_drafts": True},
    ):
        assert client.post("/v1/assistant/questions", json=body).status_code == 422
    client.headers.pop("X-Auth-Request")
    assert client.post("/v1/assistant/questions", json=BODY).status_code == 403
    model.assert_not_called()


def test_model_and_database_failures_are_sanitized_and_slots_released(client, monkeypatch):
    login(client)
    model = Mock(side_effect=ValueError("private prompt contents"))
    monkeypatch.setattr(public, "answer_policy_question", model)
    for _ in range(3):
        response = client.post("/v1/assistant/questions", json=BODY)
        assert response.status_code == 503 and "private" not in response.text
    assert model.call_count == 3
    client.repository.get_revision.side_effect = OperationalError("private SQL", {}, Exception())
    response = client.post("/v1/assistant/questions", json=BODY)
    assert response.status_code == 503 and "private" not in response.text


def test_rate_limit_capacity_and_withdrawal(client, monkeypatch):
    login(client)
    slots = client.app.state.assistant_slots
    slots.acquire()
    slots.acquire()
    try:
        assert client.post("/v1/assistant/questions", json=BODY).status_code == 429
    finally:
        slots.release()
        slots.release()
    monkeypatch.setattr(public, "answer_question", Mock(return_value={"answer": "unused"}))
    # Initial visibility, then withdrawal while the answer is generated.
    client.repository.get_revision.side_effect = [{"review_status": "published"}, None]
    assert client.post("/v1/assistant/questions", json=BODY).status_code == 404
    client.repository.get_revision.side_effect = None
    for _ in range(4):
        assert client.post("/v1/assistant/questions", json=BODY).status_code == 200
    assert client.post("/v1/assistant/questions", json=BODY).status_code == 429


def test_catalog_disabled_error_and_input_boundary():
    app = create_app(Settings(_env_file=None, db_enabled=False))
    with TestClient(app) as client:
        assert client.get("/v1/policies").status_code == 503
        app.dependency_overrides[policies.get_repository] = lambda: Mock()
        for query in ("cursor=-1", "cursor=1000000", "limit=0", "limit=101", "sort=bad"):
            assert client.get("/v1/policies?" + query).status_code == 422


def test_faq_authenticates_and_bypasses_llm_and_inference_limits(client, monkeypatch):
    path = "/v1/assistant/faqs?revision_id=" + REVISION
    assert client.get(path).status_code == 401
    client.repository.get_revision.assert_not_called()
    token = login(client, mobile=True)
    model = Mock()
    throttle = Mock()
    monkeypatch.setattr(public, "answer_policy_question", model)
    monkeypatch.setattr(client.app.state.auth_service, "throttle", throttle)
    slots = client.app.state.assistant_slots
    slots.acquire()
    slots.acquire()
    try:
        response = client.get(path, headers=token)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert len(response.json()["items"]) == 6
        assert "private-name" not in response.text and "private-id" not in response.text
        model.assert_not_called()
        throttle.assert_not_called()
    finally:
        slots.release()
        slots.release()
    assert client.get("/v1/assistant/faqs?revision_id=invalid", headers=token).status_code == 422
    for record in (None, {"review_status": "draft"}):
        client.repository.get_revision.return_value = record
        assert client.get(path, headers=token).status_code == 404
    assert client.get(path, headers={"Authorization": "Bearer invalid"}).status_code == 401
