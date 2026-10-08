"""Signup consent cannot be omitted or coerced, and belongs to the account transaction."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, insert, select, update

from app.api.kakao_auth import PENDING_COOKIE, create_flow
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.consent import NOTICE_VERSION
from app.modules.auth.migration import import_sqlite_accounts
from app.modules.auth.models import (
    accounts,
    auth_consents,
    email_verifications,
    kakao_flows,
    kakao_identities,
)
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import AuthService
from tests.email_helpers import SIGNUP_CONSENT, verify_email
from tests.test_auth import signup_body

HEADERS = {"X-Auth-Request": "1"}


@pytest.fixture
def client(tmp_path):
    with TestClient(
        create_app(
            Settings(
                _env_file=None,
                app_env="test",
                db_enabled=False,
                auth_sqlite_path=tmp_path / "members.sqlite3",
            )
        ),
        headers=HEADERS,
    ) as value:
        yield value


def pending_kakao(client):
    # Create exactly the short-lived proof that a successful OAuth callback would issue.
    client.get("/v1/auth/me")
    create_flow(client.app.state.auth_service, "pending", "pending", "kakao-subject", "카카오별명")
    client.cookies.set(PENDING_COOKIE, "pending")


@pytest.mark.parametrize("path", ["/signup", "/kakao/complete"])
@pytest.mark.parametrize(
    "consent",
    [
        None,
        {},
        {"notice_version": NOTICE_VERSION, "collection": False},
        {"notice_version": NOTICE_VERSION, "collection": 1},
        {"notice_version": NOTICE_VERSION, "collection": "true"},
        {"notice_version": "2026-10-06.1", "collection": True},
        {"notice_version": NOTICE_VERSION, "collection": True, "profile": 1},
        {"notice_version": NOTICE_VERSION, "collection": True, "ai": "false"},
        {"notice_version": NOTICE_VERSION, "collection": True, "accepted_at": 1},
    ],
)
def test_signup_rejects_missing_declined_coerced_stale_or_forged_consent(client, path, consent):
    body = signup_body() if path == "/signup" else {"email": "member@example.com"}
    if consent is None:
        body.pop("consent", None)
    else:
        body["consent"] = consent
    response = client.post("/v1/auth" + path, json=body)
    assert response.status_code == 422, response.text
    with client.app.state.auth_service.engine.connect() as connection:
        assert connection.execute(select(accounts)).first() is None
        assert connection.execute(select(auth_consents)).first() is None


@pytest.mark.parametrize("path", ["/signup", "/kakao/complete"])
def test_signup_saves_server_timestamp_and_drops_declined_profile(client, path):
    if path == "/signup":
        verify_email(client)
    else:
        pending_kakao(client)
    body = signup_body(consent={"notice_version": NOTICE_VERSION, "collection": True})
    if path != "/signup":
        body = {key: body[key] for key in ("email", "name", "age", "gender", "region", "consent")}
    earliest = int(time.time())
    response = client.post("/v1/auth" + path, json=body)
    assert response.status_code == 201, response.text
    with client.app.state.auth_service.engine.connect() as connection:
        account = connection.execute(select(accounts)).mappings().one()
        consent = connection.execute(select(auth_consents)).mappings().one()
    assert account["name"] is None and account["age"] is None and account["region"] is None
    assert account["gender"] == "undisclosed"
    assert consent["account_id"] == account["id"]
    assert consent["notice_version"] == NOTICE_VERSION and consent["collection"] is True
    assert consent["profile"] is False and consent["ai"] is False
    assert consent["ai_notice_version"] is None
    assert earliest <= consent["accepted_at"] <= int(time.time())


@pytest.mark.parametrize("path", ["/signup", "/kakao/complete"])
def test_account_and_consumed_signup_proof_rollback_when_consent_write_fails(
    client, monkeypatch, path
):
    if path == "/signup":
        verify_email(client)
        module = "app.modules.auth.service.save_signup_consent"
        proof_table = email_verifications
    else:
        pending_kakao(client)
        module = "app.api.kakao_auth.save_signup_consent"
        proof_table = kakao_flows

    def unavailable(*_):
        raise RuntimeError("consent storage unavailable")

    monkeypatch.setattr(module, unavailable)
    body = signup_body()
    if path != "/signup":
        body = {"email": body["email"], "consent": body["consent"]}
    with pytest.raises(RuntimeError, match="consent storage unavailable"):
        client.post("/v1/auth" + path, json=body)
    with client.app.state.auth_service.engine.connect() as connection:
        assert connection.execute(select(accounts)).first() is None
        assert connection.execute(select(auth_consents)).first() is None
        assert connection.execute(select(kakao_identities)).first() is None
        assert connection.execute(select(proof_table)).first() is not None


def test_privacy_notice_uses_configured_contact_without_creating_member_storage(client):
    client.app.state.settings.privacy_operator_name = "운영팀"
    client.app.state.settings.privacy_contact_email = "privacy@example.com"
    notice = client.get("/v1/auth/privacy-notice")
    assert notice.status_code == 200
    assert notice.json()["version"] == NOTICE_VERSION
    assert notice.json()["operator_name"] == "운영팀"
    assert notice.json()["contact_email"] == "privacy@example.com"
    assert (
        notice.json()["retention"] == "계정 유지 기간 동안 보유하며, 회원 탈퇴 시 즉시 삭제합니다."
    )
    assert notice.json()["ai"]["enabled"] is False
    assert client.app.state.auth_service is None


def test_import_preserves_recorded_consent_and_does_not_infer_or_restore_deleted_choices(tmp_path):
    source = create_engine("sqlite:///" + (tmp_path / "source.sqlite3").as_posix())
    target = create_engine("sqlite:///" + (tmp_path / "target.sqlite3").as_posix())
    for engine in (source, target):
        initialize_auth_schema(engine)
    with source.begin() as connection:
        for account_id in ("recorded", "legacy"):
            connection.execute(
                insert(accounts).values(
                    id=account_id,
                    username=account_id,
                    password_hash="unchanged",
                    gender="undisclosed",
                    created_at=1,
                )
            )
        connection.execute(
            insert(auth_consents).values(account_id="recorded", accepted_at=123, **SIGNUP_CONSENT)
        )
    try:
        assert import_sqlite_accounts(source, target) == 2
        with target.connect() as connection:
            row = connection.execute(select(auth_consents)).mappings().one()
        assert row["account_id"] == "recorded" and row["accepted_at"] == 123
        with target.begin() as connection:
            connection.execute(update(auth_consents).values(profile=False, accepted_at=456))
        assert import_sqlite_accounts(source, target) == 0
        with target.connect() as connection:
            live = connection.execute(select(auth_consents)).mappings().one()
        assert live["profile"] is False and live["accepted_at"] == 456
        with target.begin() as connection:
            connection.execute(delete(auth_consents))
        assert import_sqlite_accounts(source, target) == 0
        with target.connect() as connection:
            assert connection.execute(select(auth_consents)).first() is None
        # Missing consent never prevents a legacy member from receiving a normal session.
        with target.connect() as connection:
            legacy = (
                connection.execute(select(accounts).where(accounts.c.id == "legacy"))
                .mappings()
                .one()
            )
        service = AuthService(target)
        token, _ = service.issue_session(legacy)
        assert service.me(token)["id"] == "legacy"
    finally:
        source.dispose()
        target.dispose()


def test_additive_ai_notice_column_upgrade_preserves_existing_record(tmp_path):
    engine = create_engine("sqlite:///" + (tmp_path / "older-consent.sqlite3").as_posix())
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE auth_consents (account_id VARCHAR(64) PRIMARY KEY, "
            "notice_version VARCHAR(32) NOT NULL, collection BOOLEAN NOT NULL, "
            "profile BOOLEAN NOT NULL, ai BOOLEAN NOT NULL, accepted_at INTEGER NOT NULL)"
        )
        connection.exec_driver_sql(
            "INSERT INTO auth_consents VALUES (?, ?, ?, ?, ?, ?)",
            ("previous-member", NOTICE_VERSION, True, False, False, 123),
        )
    try:
        initialize_auth_schema(engine)
        initialize_auth_schema(engine)
        with engine.connect() as connection:
            row = connection.execute(select(auth_consents)).mappings().one()
        assert row["account_id"] == "previous-member" and row["accepted_at"] == 123
        assert row["ai_notice_version"] is None and row["profile"] is False
    finally:
        engine.dispose()
