"""Persistent accounts and isolated sessions with bounded authentication attempts."""

import hashlib
import hmac
import re
import secrets
import time

from fastapi import HTTPException
from sqlalchemy import delete, insert, inspect, select, update
from sqlalchemy.exc import IntegrityError

from app.modules.auth import mail
from app.modules.auth.account_write import account_write_transaction, require_active_account
from app.modules.auth.consent import consented_profile, save_signup_consent
from app.modules.auth.models import (
    ADDRESS_FIELDS,
    PROFILE_FIELDS,
    accounts,
    auth_consents,
    email_verifications,
    kakao_flows,
    kakao_identities,
    limits,
    mobile_oauth_flows,
    sessions,
)
from app.modules.auth.privacy import PrivacyError

SESSION_SECONDS = 7 * 24 * 60 * 60


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    value = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64 * 1024 * 1024
    )
    return f"scrypt${salt}${value.hex()}"


def check_password(password: str, encoded: str) -> bool:
    if not isinstance(encoded, str) or not re.fullmatch(
        r"scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}", encoded
    ):
        # Corrupt/unsupported stored credentials never produce an error or skip the KDF.
        password_hash(password, "0" * 32)
        return False
    return hmac.compare_digest(password_hash(password, encoded.split("$")[1]), encoded)


class AuthService:
    def __init__(self, engine, settings=None):
        self.engine = engine
        self.settings = settings
        self.dummy_password = password_hash(secrets.token_urlsafe(32))

    def throttle(self, key: str, maximum: int, seconds: int, *, account_id: str | None = None):
        now = int(time.time())
        key = digest(key)
        try:
            transaction = (
                account_write_transaction(self.engine)
                if account_id is not None
                else self.engine.begin()
            )
            with transaction as connection:
                if account_id is not None:
                    require_active_account(connection, account_id)
                connection.execute(delete(limits).where(limits.c.expires_at <= now))
                changed = connection.execute(
                    update(limits)
                    .where(limits.c.key == key, limits.c.hits < maximum)
                    .values(hits=limits.c.hits + 1)
                )
                if changed.rowcount:
                    return
                if connection.execute(select(limits.c.key).where(limits.c.key == key)).first():
                    raise HTTPException(429, "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.")
                connection.execute(
                    insert(limits).values(
                        key=key,
                        hits=1,
                        expires_at=now + seconds,
                    )
                )
        except IntegrityError:
            # Concurrent first requests must not bypass a limit.
            raise HTTPException(429, "잠시 후 다시 시도해 주세요.") from None

    def check_username(self, username: str, ip: str):
        self.throttle("username-check-ip:" + ip, 30, 60)
        with self.engine.connect() as connection:
            exists = connection.execute(
                select(accounts.c.id).where(accounts.c.username == username.lower())
            ).first()
        return {"username": username, "available": exists is None}

    def update_profile(self, account_id: str, data, *, token: str | None = None):
        # HTTP callers supply the current web token; tokenless calls are trusted local operations.
        with account_write_transaction(self.engine) as connection:
            account = require_active_account(connection, account_id)
            if token is not None:
                active = connection.execute(
                    select(sessions.c.token_hash)
                    .where(
                        sessions.c.account_id == account_id,
                        sessions.c.token_hash == self.session_digest(token),
                        sessions.c.expires_at > int(time.time()),
                    )
                    .with_for_update()
                ).first()
                if active is None:
                    raise HTTPException(401, "로그인이 필요해요.")
            self.private_account(account)
            values = data.model_dump(
                include={"name", "age", "gender", "region", *ADDRESS_FIELDS}, exclude_unset=True
            )
            if not values:
                return self.public_account(account)
            changed = connection.execute(
                update(accounts).where(accounts.c.id == account_id).values(**values)
            )
            if changed.rowcount != 1:
                raise HTTPException(401, "로그인이 필요해요.")
            if any(field in values and values[field] != account[field]
                   for field in ("age", "gender", "region")):
                from app.modules.monitoring.storage import invalidate_member_candidates

                invalidate_member_candidates(connection, account_id, {**account, **values})
        return self.public_account({**account, **values})

    def request_email_code(self, email: str, ip: str, previous: str = ""):
        self.throttle("email-send-ip:" + ip, 20, 3600)
        self.throttle("email-send-cooldown:" + email, 1, mail.RESEND_SECONDS)
        self.throttle("email-send-hour:" + email, 6, 3600)
        token = secrets.token_urlsafe(32)
        code = f"{secrets.randbelow(1000000):06d}"
        now = int(time.time())
        with self.engine.begin() as connection:
            connection.execute(
                delete(email_verifications).where(email_verifications.c.expires_at <= now)
            )
            connection.execute(
                insert(email_verifications).values(
                    token_hash=digest(token),
                    email=email,
                    # The raw browser secret is required to check guesses against this hash.
                    code_hash=digest("email-code:" + token + ":" + code),
                    attempts=0,
                    verified=False,
                    expires_at=now + mail.EMAIL_SECONDS,
                )
            )
        try:
            mail.send_verification_code(self.settings, email, code)
        except HTTPException:
            with self.engine.begin() as connection:
                connection.execute(
                    delete(email_verifications).where(
                        email_verifications.c.token_hash == digest(token)
                    )
                )
            raise
        if previous:
            with self.engine.begin() as connection:
                connection.execute(
                    delete(email_verifications).where(
                        email_verifications.c.token_hash == digest(previous)
                    )
                )
        return token

    def verify_email_code(self, email: str, code: str, token: str, ip: str):
        self.throttle("email-verify-ip:" + ip, 60, 900)
        now = int(time.time())
        valid = False
        with self.engine.begin() as connection:
            # This write serializes simultaneous guesses and commits failed attempts too.
            changed = connection.execute(
                update(email_verifications)
                .where(
                    email_verifications.c.token_hash == digest(token),
                    email_verifications.c.email == email,
                    email_verifications.c.expires_at > now,
                    email_verifications.c.verified.is_(False),
                    email_verifications.c.attempts < 5,
                )
                .values(attempts=email_verifications.c.attempts + 1)
            )
            if changed.rowcount == 1:
                stored = connection.execute(
                    select(email_verifications.c.code_hash).where(
                        email_verifications.c.token_hash == digest(token)
                    )
                ).scalar_one()
                valid = hmac.compare_digest(stored, digest("email-code:" + token + ":" + code))
                if valid:
                    connection.execute(
                        update(email_verifications)
                        .where(email_verifications.c.token_hash == digest(token))
                        .values(verified=True, expires_at=now + mail.EMAIL_SECONDS)
                    )
        if not valid:
            raise HTTPException(
                400, "인증번호를 확인해 주세요. 만료됐거나 5회 틀렸다면 다시 발송해 주세요."
            )

    def register(self, data, ip: str, email_token: str = ""):
        from app.modules.auth.ai_privacy import validate_ai_consent

        validate_ai_consent(data.consent, self.settings)
        self.throttle("signup-ip:" + ip, 20, 3600)
        now = int(time.time())
        account_id = secrets.token_urlsafe(24)
        encoded = password_hash(data.password.get_secret_value())
        try:
            with self.engine.begin() as connection:
                consumed = connection.execute(
                    delete(email_verifications).where(
                        email_verifications.c.token_hash == digest(email_token),
                        email_verifications.c.email == data.email,
                        email_verifications.c.verified.is_(True),
                        email_verifications.c.expires_at > now,
                    )
                )
                if consumed.rowcount != 1:
                    raise HTTPException(
                        401, "이메일 인증이 필요하거나 만료됐어요. 이메일을 다시 인증해 주세요."
                    )
                connection.execute(
                    insert(accounts).values(
                        id=account_id,
                        username=data.username,
                        password_hash=encoded,
                        **consented_profile(data),
                        phone=None,
                        email=data.email,
                        email_verified_at=now,
                        created_at=now,
                    )
                )
                save_signup_consent(connection, account_id, data.consent, now)
        except IntegrityError:
            raise HTTPException(409, "이미 사용 중인 아이디예요.") from None
        return {"message": "회원가입이 완료됐어요. 로그인해 주세요."}

    def withdraw(
        self,
        token: str | None,
        *,
        signup_email_token: str = "",
        kakao_flow_binding: str = "",
        kakao_pending_token: str = "",
    ):
        from app.modules.admin.access import admin_grants
        from app.modules.finance.storage import financial_profiles
        from app.modules.monitoring.storage import MONITORING_TABLES
        from app.modules.notifications.storage import devices, preferences

        if not token:
            raise HTTPException(401, "로그인이 필요해요.")
        with account_write_transaction(self.engine) as connection:
            # Recheck the live web session inside the deletion transaction.
            account_id = connection.execute(
                select(accounts.c.id)
                .join(sessions, sessions.c.account_id == accounts.c.id)
                .where(
                    sessions.c.token_hash == self.session_digest(token),
                    sessions.c.expires_at > int(time.time()),
                )
                .with_for_update()
            ).scalar_one_or_none()
            if account_id is None:
                raise HTTPException(401, "로그인이 필요해요.")
            account = require_active_account(connection, account_id)
            connection.execute(
                delete(mobile_oauth_flows).where(
                    (mobile_oauth_flows.c.account_id == account_id)
                    | mobile_oauth_flows.c.subject.in_(
                        select(kakao_identities.c.subject).where(
                            kakao_identities.c.account_id == account_id,
                        )
                    )
                )
            )
            connection.execute(
                delete(kakao_flows).where(
                    kakao_flows.c.subject.in_(
                        select(kakao_identities.c.subject).where(
                            kakao_identities.c.account_id == account_id
                        )
                    )
                )
            )
            for table in (financial_profiles, preferences, devices, *MONITORING_TABLES):
                if inspect(connection).has_table(table.name):
                    connection.execute(delete(table).where(table.c.account_id == account_id))
            for table in (admin_grants, sessions, kakao_identities, auth_consents):
                connection.execute(delete(table).where(table.c.account_id == account_id))
            rate_limit_keys = [
                "assistant:" + account_id,
                "assistant-dialogue:" + account_id,
                "assistant-dialogue-save:" + account_id,
                "recommendations:" + account_id,
                "monitoring:" + account_id,
                "monitoring-refresh:" + account_id,
                "login-user:" + account["username"],
            ]
            if (
                account["email"]
                and not connection.execute(
                    select(accounts.c.id).where(
                        accounts.c.email == account["email"], accounts.c.id != account_id
                    )
                ).first()
            ):
                rate_limit_keys.extend(
                    [
                        "email-send-cooldown:" + account["email"],
                        "email-send-hour:" + account["email"],
                    ]
                )
            connection.execute(
                delete(limits).where(limits.c.key.in_([digest(key) for key in rate_limit_keys]))
            )
            if signup_email_token:
                connection.execute(
                    delete(email_verifications).where(
                        email_verifications.c.token_hash == digest(signup_email_token)
                    )
                )
            if kakao_flow_binding:
                connection.execute(
                    delete(kakao_flows).where(
                        kakao_flows.c.binding_hash == digest(kakao_flow_binding)
                    )
                )
            if kakao_pending_token:
                connection.execute(
                    delete(kakao_flows).where(
                        kakao_flows.c.token_hash == digest(kakao_pending_token)
                    )
                )
            deleted = connection.execute(delete(accounts).where(accounts.c.id == account_id))
            if deleted.rowcount != 1:
                raise HTTPException(401, "로그인이 필요해요.")

    def login(
        self,
        username: str,
        password: str,
        ip: str,
        previous: str | None = None,
        *,
        mobile: bool = False,
        console: bool = False,
    ):
        self.throttle("login-ip:" + ip, 50, 900)
        username = username.lower()
        self.throttle("login-user:" + username, 10, 900)
        with self.engine.connect() as connection:
            account = (
                connection.execute(
                    select(accounts).where(
                        accounts.c.username == username,
                    )
                )
                .mappings()
                .first()
            )
        valid = check_password(
            password, account["password_hash"] if account else self.dummy_password
        )
        if not account or not valid:
            raise HTTPException(401, "아이디 또는 비밀번호를 확인해 주세요.")
        return self.issue_session(account, previous, mobile=mobile, console=console)

    def issue_session(self, account, previous=None, *, mobile=False, console=False):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        with account_write_transaction(self.engine) as connection:
            # An in-flight login must not recreate a session after account withdrawal.
            current = require_active_account(connection, account["id"])
            if not hmac.compare_digest(current["password_hash"], account["password_hash"]):
                raise HTTPException(401, "아이디 또는 비밀번호를 확인해 주세요.")
            user = self.public_account(current)
            connection.execute(delete(sessions).where(sessions.c.expires_at <= now))
            if previous:
                connection.execute(
                    delete(sessions).where(
                        sessions.c.token_hash
                        == self.session_digest(previous, mobile=mobile, console=console)
                    )
                )
            connection.execute(
                insert(sessions).values(
                    token_hash=self.session_digest(token, mobile=mobile, console=console),
                    account_id=account["id"],
                    expires_at=now + SESSION_SECONDS,
                )
            )
        return token, user

    def private_account(self, account):
        if account.get("profile_ciphertext"):
            raise PrivacyError("Restore the older encrypted account before using it")
        return {key: account.get(key) for key in PROFILE_FIELDS}

    def public_account(self, account):
        private = self.private_account(account)
        return {
            "id": account["id"],
            "email": account.get("email"),
            "email_verified": account.get("email_verified_at") is not None,
            **{key: private[key] for key in PROFILE_FIELDS if key != "phone"},
        }

    @staticmethod
    def session_digest(token: str, *, mobile: bool = False, console: bool = False) -> str:
        # A copied cookie/token cannot cross the web, native or server-console boundary.
        if mobile and console:
            raise ValueError("A session can have only one authentication scope")
        prefix = "console:" if console else "mobile:" if mobile else ""
        return digest(prefix + token)

    def me(self, token: str | None, *, mobile: bool = False, console: bool = False):
        if token:
            with self.engine.connect() as connection:
                account = (
                    connection.execute(
                        select(accounts)
                        .join(
                            sessions,
                            sessions.c.account_id == accounts.c.id,
                        )
                        .where(
                            sessions.c.token_hash
                            == self.session_digest(token, mobile=mobile, console=console),
                            sessions.c.expires_at > int(time.time()),
                        )
                    )
                    .mappings()
                    .first()
                )
            if account:
                return self.public_account(account)
        raise HTTPException(401, "로그인이 필요해요.")

    def logout(self, token: str | None, *, mobile: bool = False, console: bool = False):
        if token:
            with self.engine.begin() as connection:
                connection.execute(
                    delete(sessions).where(
                        sessions.c.token_hash
                        == self.session_digest(token, mobile=mobile, console=console)
                    )
                )
