"""Immediate withdrawal needs current web auth and explicit confirmation; never archives data."""

import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import event, insert, select, update

from app.api.kakao_auth import create_flow
from app.core.config import Settings
from app.main import create_app
from app.modules.admin.access import admin_grants
from app.modules.auth.consent import NOTICE_VERSION
from app.modules.auth.models import (
    accounts,
    auth_consents,
    email_verifications,
    kakao_flows,
    kakao_identities,
    limits,
    sessions,
)
from app.modules.auth.service import digest
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import financial_profiles
from app.modules.notifications.storage import devices, initialize_notification_schema, preferences
from tests.email_helpers import verify_email
from tests.test_auth import PASSWORD, signup_body

HEADERS = {"X-Auth-Request": "1"}
WITHDRAWAL = {"confirmation": True, "notice_version": NOTICE_VERSION}


@pytest.fixture
def client(tmp_path):
    with TestClient(
        create_app(
            Settings(
                _env_file=None,
                app_env="test",
                db_enabled=False,
                auth_sqlite_path=tmp_path / "withdrawal.sqlite3",
            )
        ),
        headers=HEADERS,
    ) as value:
        yield value


def set_cookie(client, name, value):
    client.cookies.set(name, value, domain="testserver.local", path="/")


def member(client):
    verify_email(client)
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 201
    result = client.post("/v1/auth/login", json={"username": "tester", "password": PASSWORD})
    assert result.status_code == 200
    return result.json()["user"]["id"]


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"notice_version": NOTICE_VERSION},
        {"notice_version": NOTICE_VERSION, "confirmation": False},
        {"notice_version": NOTICE_VERSION, "confirmation": 1},
        {"notice_version": NOTICE_VERSION, "confirmation": "true"},
        {"notice_version": NOTICE_VERSION, "confirmation": None},
        {"notice_version": "2026-10-07.1", "confirmation": True},
        {**WITHDRAWAL, "account_id": "someone-else"},
    ],
)
def test_withdrawal_rejects_missing_coerced_declined_stale_or_foreign_confirmation(client, body):
    identity = member(client)
    assert client.post("/v1/auth/withdraw", json=body).status_code == 422
    assert client.get("/v1/auth/me").json()["user"]["id"] == identity


def test_withdrawal_rejects_anonymous_invalid_expired_and_cross_scope_sessions(client):
    assert client.post("/v1/auth/withdraw", json=WITHDRAWAL).status_code == 401
    identity = member(client)
    service = client.app.state.auth_service
    original = client.cookies.get("bokji_session")
    assert (
        client.post(
            "/v1/auth/withdraw", json=WITHDRAWAL, headers={"X-Auth-Request": ""}
        ).status_code
        == 403
    )
    with service.engine.connect() as connection:
        account = connection.execute(select(accounts)).mappings().one()
    native, _ = service.issue_session(account, mobile=True)
    for token in ("invalid", native):
        set_cookie(client, "bokji_session", token)
        assert client.post("/v1/auth/withdraw", json=WITHDRAWAL).status_code == 401
    set_cookie(client, "bokji_session", original)
    with service.engine.begin() as connection:
        connection.execute(
            update(sessions).where(sessions.c.token_hash == digest(original)).values(expires_at=0)
        )
    assert client.post("/v1/auth/withdraw", json=WITHDRAWAL).status_code == 401
    with service.engine.connect() as connection:
        assert connection.execute(select(accounts.c.id)).scalar_one() == identity


def test_immediate_withdrawal_deletes_every_own_row_revokes_all_scopes_and_preserves_other_member(
    client,
):
    identity = member(client)
    verify_email(client, "second@example.com")
    assert (
        client.post(
            "/v1/auth/signup", json=signup_body(username="second", email="second@example.com")
        ).status_code
        == 201
    )
    service = client.app.state.auth_service
    original_session = client.cookies.get("bokji_session")
    initialize_finance_schema(service.engine)
    initialize_notification_schema(service.engine)
    with service.engine.begin() as connection:
        own_account = (
            connection.execute(select(accounts).where(accounts.c.id == identity)).mappings().one()
        )
        other_id = connection.execute(
            select(accounts.c.id).where(accounts.c.username == "second")
        ).scalar_one()
        for account_id in (identity, other_id):
            connection.execute(insert(admin_grants).values(account_id=account_id, created_at=1))
            connection.execute(
                insert(kakao_identities).values(
                    subject="kakao-" + account_id, account_id=account_id
                )
            )
            connection.execute(
                insert(financial_profiles).values(
                    account_id=account_id, profile_json='{"members":[]}', updated_at="now"
                )
            )
            connection.execute(
                insert(preferences).values(account_id=account_id, preferences_json="{}")
            )
            connection.execute(
                insert(devices).values(
                    token_hash=digest("push-" + account_id),
                    push_token="push-" + account_id,
                    account_id=account_id,
                    session_hash="mobile-session",
                    platform="android",
                    active=1,
                )
            )
        connection.execute(
            insert(email_verifications).values(
                token_hash=digest("browser-email-proof"),
                email=own_account["email"],
                code_hash="code-hash",
                attempts=0,
                verified=True,
                expires_at=int(time.time()) + 600,
            )
        )
    native, _ = service.issue_session(own_account, mobile=True)
    console, _ = service.issue_session(own_account, console=True)
    create_flow(service, "own-pending", "own-pending", "kakao-" + identity, "내 별명")
    create_flow(service, "own-start", "own-binding")
    create_flow(service, "other-pending", "other-binding", "kakao-" + other_id, "다른 별명")
    for account_id in (identity, other_id):
        for prefix in ("assistant:", "recommendations:"):
            service.throttle(prefix + account_id, 6, 60, account_id=account_id)
    set_cookie(client, "bokji_signup_email", "browser-email-proof")
    set_cookie(client, "bokji_kakao_flow", "own-binding")
    set_cookie(client, "bokji_kakao_signup", "own-pending")
    response = client.post("/v1/auth/withdraw", json=WITHDRAWAL)
    assert response.status_code == 200 and response.json()["deleted"] is True
    with service.engine.connect() as connection:
        for key in (
            "login-user:tester",
            "email-send-cooldown:tester@example.com",
            "email-send-hour:tester@example.com",
        ):
            assert (
                connection.execute(select(limits).where(limits.c.key == digest(key))).first()
                is None
            )
    for name in ("bokji_session", "bokji_signup_email", "bokji_kakao_flow", "bokji_kakao_signup"):
        assert client.cookies.get(name) is None
    assert client.get("/v1/auth/me").status_code == 401
    assert client.get("/v1/finance/profile").status_code == 401
    assert (
        client.post("/v1/auth/login", json={"username": "tester", "password": PASSWORD}).status_code
        == 401
    )
    assert client.post("/v1/auth/withdraw", json=WITHDRAWAL).status_code == 401
    set_cookie(client, "bokji_session", original_session)
    assert client.get("/v1/auth/me").status_code == 401
    for token, scope in ((native, {"mobile": True}), (console, {"console": True})):
        with pytest.raises(HTTPException) as denied:
            service.me(token, **scope)
        assert denied.value.status_code == 401
    with pytest.raises(HTTPException):
        service.issue_session(own_account)
    with pytest.raises(HTTPException):
        service.throttle("assistant:" + identity, 6, 60, account_id=identity)
    with service.engine.connect() as connection:
        for table in (
            accounts,
            auth_consents,
            admin_grants,
            kakao_identities,
            financial_profiles,
            preferences,
            devices,
        ):
            identity_column = table.c.id if table is accounts else table.c.account_id
            assert (
                connection.execute(select(table).where(identity_column == identity)).first() is None
            )
            assert (
                connection.execute(select(table).where(identity_column == other_id)).first()
                is not None
            )
        assert (
            connection.execute(select(sessions).where(sessions.c.account_id == identity)).first()
            is None
        )
        assert connection.execute(select(email_verifications)).first() is None
        for prefix in ("assistant:", "recommendations:"):
            assert (
                connection.execute(
                    select(limits).where(limits.c.key == digest(prefix + identity))
                ).first()
                is None
            )
            assert (
                connection.execute(
                    select(limits).where(limits.c.key == digest(prefix + other_id))
                ).first()
                is not None
            )
        assert connection.execute(select(kakao_flows.c.token_hash)).scalars().all() == [
            digest("other-pending")
        ]
    assert (
        client.post("/v1/auth/login", json={"username": "second", "password": PASSWORD}).status_code
        == 200
    )


def test_withdrawal_works_before_optional_finance_and_notification_tables_are_initialized(client):
    member(client)
    assert client.post("/v1/auth/withdraw", json=WITHDRAWAL).status_code == 200
    assert client.get("/v1/auth/me").status_code == 401


def test_failed_account_delete_rolls_back_related_rows_and_preserves_session(client):
    identity = member(client)
    service = client.app.state.auth_service
    initialize_finance_schema(service.engine)
    with service.engine.begin() as connection:
        connection.execute(
            insert(financial_profiles).values(
                account_id=identity, profile_json='{"members":[]}', updated_at="now"
            )
        )

    def reject_account_delete(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("DELETE FROM auth_accounts"):
            raise RuntimeError("account deletion unavailable")

    event.listen(service.engine, "before_cursor_execute", reject_account_delete)
    try:
        with pytest.raises(RuntimeError, match="account deletion unavailable"):
            client.post("/v1/auth/withdraw", json=WITHDRAWAL)
    finally:
        event.remove(service.engine, "before_cursor_execute", reject_account_delete)
    assert client.get("/v1/auth/me").json()["user"]["id"] == identity
    with service.engine.connect() as connection:
        for table in (accounts, auth_consents, sessions, financial_profiles):
            assert connection.execute(select(table)).first() is not None
