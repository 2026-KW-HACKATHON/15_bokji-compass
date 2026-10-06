"""Real signup proofs and SMTP transport, without sending live mail."""

import smtplib
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.api.auth import EMAIL_COOKIE, SignupInput
from app.core.config import Settings
from app.main import create_app
from app.modules.auth import mail
from app.modules.auth.mail import send_verification_code
from app.modules.auth.models import accounts, email_verifications, limits
from tests.email_helpers import mailbox, verify_email
from tests.test_auth import signup_body


@pytest.fixture
def client(tmp_path):
    with TestClient(
        create_app(
            Settings(_env_file=None, app_env="test", auth_sqlite_path=tmp_path / "email.sqlite3")
        ),
        headers={"X-Auth-Request": "1"},
    ) as value:
        yield value


def send(client, email="tester@example.com"):
    return client.post("/v1/auth/email/request", json={"email": email})


def verify(client, code=None, email="tester@example.com"):
    return client.post(
        "/v1/auth/email/verify", json={"email": email, "code": code or mailbox[email]}
    )


def test_verification_required_normalized_and_consumed_once(client):
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 401
    response = send(client, "  Tester@Example.COM ")
    assert response.status_code == 200
    code = mailbox["tester@example.com"]
    assert len(code) == 6 and code.isdigit()
    assert code not in response.text and "token" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    assert response.headers["cache-control"] == "no-store"
    token = client.cookies.get(EMAIL_COOKIE)
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 401
    assert verify(client).status_code == 200
    with client.app.state.auth_service.engine.connect() as connection:
        proof = connection.execute(select(email_verifications)).mappings().one()
        assert proof["verified"] and proof["attempts"] == 1
        assert code != proof["code_hash"] and token != proof["token_hash"]
    assert (
        client.post("/v1/auth/signup", json=signup_body(email=" Tester@Example.COM ")).status_code
        == 201
    )
    assert client.cookies.get(EMAIL_COOKIE) is None
    with client.app.state.auth_service.engine.connect() as connection:
        account = connection.execute(select(accounts)).mappings().one()
        assert account["email"] == "tester@example.com" and account["email_verified_at"]
        assert connection.execute(select(email_verifications)).first() is None
    client.cookies.set(EMAIL_COOKIE, token)
    assert client.post("/v1/auth/signup", json=signup_body(username="another")).status_code == 401


def test_code_requires_browser_and_exact_email_and_cannot_change_verified_email(client):
    send(client)
    token = client.cookies.get(EMAIL_COOKIE)
    client.cookies.clear()
    assert verify(client).status_code == 400
    client.cookies.set(EMAIL_COOKIE, token)
    assert (
        verify(client, email="other@example.com", code=mailbox["tester@example.com"]).status_code
        == 400
    )
    assert verify(client).status_code == 200
    assert (
        client.post("/v1/auth/signup", json=signup_body(email="other@example.com")).status_code
        == 401
    )
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 201


def test_five_wrong_attempts_commit_and_block_correct_code(client):
    send(client)
    wrong = "000000" if mailbox["tester@example.com"] != "000000" else "999999"
    for _ in range(5):
        assert verify(client, wrong).status_code == 400
    assert verify(client).status_code == 400
    with client.app.state.auth_service.engine.connect() as connection:
        proof = connection.execute(select(email_verifications)).mappings().one()
        assert proof["attempts"] == 5 and not proof["verified"]
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 401


def test_expired_code_and_verified_proof_cannot_create_account(client):
    send(client)
    engine = client.app.state.auth_service.engine
    with engine.begin() as connection:
        connection.execute(update(email_verifications).values(expires_at=0))
    assert verify(client).status_code == 400
    verify_email(client, "fresh@example.com")
    with engine.begin() as connection:
        connection.execute(update(email_verifications).values(expires_at=0))
    assert (
        client.post("/v1/auth/signup", json=signup_body(email="fresh@example.com")).status_code
        == 401
    )


def test_resend_cooldown_and_new_code_invalidates_old_proof(client, monkeypatch):
    monkeypatch.setattr("app.modules.auth.service.secrets.randbelow", lambda _: 123456)
    send(client)
    old_token = client.cookies.get(EMAIL_COOKIE)
    assert send(client, "TESTER@example.com").status_code == 429
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(limits).values(expires_at=0))
    monkeypatch.setattr("app.modules.auth.service.secrets.randbelow", lambda _: 654321)
    assert send(client).status_code == 200
    new_token = client.cookies.get(EMAIL_COOKIE)
    assert verify(client, "123456").status_code == 400
    client.cookies.set(EMAIL_COOKIE, old_token)
    assert verify(client, "123456").status_code == 400
    client.cookies.set(EMAIL_COOKIE, new_token)
    assert verify(client, "654321").status_code == 200


def test_signup_conflict_rolls_back_consumption_and_same_proof_is_race_safe(client):
    verify_email(client)
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 201
    token = verify_email(client, "retry@example.com")
    body = signup_body(email="retry@example.com")
    assert client.post("/v1/auth/signup", json=body).status_code == 409
    body["username"] = "retry_user"
    service = client.app.state.auth_service

    def attempt(index):
        try:
            service.register(SignupInput(**body), str(index), token)
            return 201
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, [1, 2])) == [201, 401]


@pytest.mark.parametrize(
    "email",
    [
        "",
        "missing-at",
        "a@localhost",
        "a..b@example.com",
        "a@-example.com",
        "a@example..com",
        "a@example.com\r\nBcc: leak@example.com",
        "a" * 65 + "@example.com",
        None,
    ],
)
def test_invalid_and_missing_email_rejected_for_both_signups(client, email):
    assert send(client, email).status_code == 422
    assert client.post("/v1/auth/signup", json=signup_body(email=email)).status_code == 422
    assert client.post("/v1/auth/kakao/complete", json={"email": email}).status_code == 422
    assert client.post("/v1/auth/kakao/complete", json={}).status_code == 422


def test_email_endpoints_guard_secret_validation_and_failed_delivery(client, monkeypatch):
    assert (
        client.post(
            "/v1/auth/email/request",
            json={"email": "tester@example.com"},
            headers={"X-Auth-Request": ""},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/v1/auth/email/verify",
            json={"email": "tester@example.com", "code": "sensitive"},
            headers={"X-Auth-Request": ""},
        ).status_code
        == 403
    )
    response = client.post(
        "/v1/auth/email/verify", json={"email": "tester@example.com", "code": "sensitive"}
    )
    assert response.status_code == 422 and "sensitive" not in response.text
    monkeypatch.setattr(mail, "send_verification_code", send_verification_code)
    response = send(client)
    assert response.status_code == 503 and "설정" in response.json()["detail"]
    assert client.cookies.get(EMAIL_COOKIE) is None
    with client.app.state.auth_service.engine.connect() as connection:
        assert connection.execute(select(email_verifications)).first() is None
        assert connection.execute(select(accounts)).first() is None


def test_send_limits_apply_across_email_addresses_and_browser_sessions(client):
    for index in range(20):
        client.cookies.clear()
        assert send(client, f"address{index}@example.com").status_code == 200
    assert send(client, "extra@example.com").status_code == 429


@pytest.mark.parametrize("security", ["starttls", "ssl"])
def test_smtp_uses_verified_tls_and_sends_six_digit_message(monkeypatch, security):
    transport = MagicMock()
    smtp = transport.return_value.__enter__.return_value
    smtp.send_message.return_value = {}
    monkeypatch.setattr(mail.smtplib, "SMTP_SSL" if security == "ssl" else "SMTP", transport)
    settings = Settings(
        _env_file=None,
        smtp_host="smtp.example.com",
        smtp_port=465 if security == "ssl" else 587,
        smtp_security=security,
        smtp_username="sender@example.com",
        smtp_password="server-only-password",
        smtp_from_email="sender@example.com",
    )
    send_verification_code(settings, "member@example.com", "012345")
    smtp.login.assert_called_once_with("sender@example.com", "server-only-password")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "member@example.com" and message["From"] == "sender@example.com"
    assert "012345" in message.get_content() and "server-only-password" not in str(message)
    context = (
        transport.call_args.kwargs["context"]
        if security == "ssl"
        else smtp.starttls.call_args.kwargs["context"]
    )
    assert context.check_hostname
    assert transport.call_args.kwargs["timeout"] == 10
    if security == "ssl":
        smtp.starttls.assert_not_called()


def test_smtp_failure_is_sanitized(monkeypatch):
    transport = MagicMock()
    transport.return_value.__enter__.return_value.starttls.side_effect = smtplib.SMTPException(
        "private-password 012345"
    )
    monkeypatch.setattr(mail.smtplib, "SMTP", transport)
    settings = Settings(
        _env_file=None, smtp_host="smtp.example.com", smtp_from_email="sender@example.com"
    )
    with pytest.raises(HTTPException) as caught:
        send_verification_code(settings, "member@example.com", "012345")
    assert caught.value.status_code == 503
    assert "private-password" not in caught.value.detail and "012345" not in caught.value.detail
