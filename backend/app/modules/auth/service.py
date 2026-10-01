"""Persistent authentication with atomic proof consumption and bounded attempts."""

import hashlib
import hmac
import secrets
import time
from typing import Protocol

from fastapi import HTTPException
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError

from app.modules.auth.models import accounts, challenges, limits, sessions

SESSION_SECONDS = 7 * 24 * 60 * 60
CODE_SECONDS = 300


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    value = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64 * 1024 * 1024
    )
    return f"scrypt${salt}${value.hex()}"


def check_password(password: str, encoded: str) -> bool:
    return hmac.compare_digest(password_hash(password, encoded.split("$")[1]), encoded)


class SmsSender(Protocol):
    """A future real provider must deliver the code or raise without logging secrets."""

    def send_code(self, phone: str, code: str) -> None: ...


class DevelopmentSmsSender:
    """No SMS is sent. The API explicitly labels the development-only code."""

    def send_code(self, phone: str, code: str) -> None:
        pass


class AuthService:
    def __init__(self, engine, *, development_sms=False, sender: SmsSender | None = None):
        self.engine = engine
        self.development_sms = development_sms
        self.sender = sender
        self.dummy_password = password_hash(secrets.token_urlsafe(32))

    def throttle(self, key: str, maximum: int, seconds: int):
        now = int(time.time())
        key = digest(key)
        try:
            with self.engine.begin() as connection:
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

    def request_code(self, phone: str, ip: str):
        if self.sender is None:
            raise HTTPException(503, "문자 인증 서비스가 아직 설정되지 않았어요.")
        self.throttle("sms-ip:" + ip, 20, 3600)
        self.throttle("sms-phone:" + phone, 5, 3600)
        self.throttle("sms-cooldown:" + phone, 1, 60)
        now = int(time.time())
        challenge_id = secrets.token_urlsafe(32)
        code = f"{secrets.randbelow(1000000):06d}"
        with self.engine.begin() as connection:
            connection.execute(delete(challenges).where(challenges.c.expires_at <= now))
            connection.execute(
                update(challenges).where(challenges.c.phone == phone).values(consumed=1)
            )
            connection.execute(
                insert(challenges).values(
                    id=challenge_id,
                    phone=phone,
                    code_hash=digest(challenge_id + code),
                    expires_at=now + CODE_SECONDS,
                    attempts=0,
                    verified=0,
                    consumed=0,
                )
            )
        try:
            self.sender.send_code(phone, code)
        except Exception:
            with self.engine.begin() as connection:
                connection.execute(delete(challenges).where(challenges.c.id == challenge_id))
            raise HTTPException(
                503, "문자를 발송하지 못했어요. 잠시 후 다시 시도해 주세요."
            ) from None
        result = {"challenge_id": challenge_id, "expires_in": CODE_SECONDS, "retry_after": 60}
        if self.development_sms:
            result["development_code"] = code
        return result

    def verify_code(self, challenge_id: str, phone: str, code: str, ip: str):
        self.throttle("verify-ip:" + ip, 50, 900)
        now = int(time.time())
        proof = secrets.token_urlsafe(32)
        valid = False
        with self.engine.begin() as connection:
            # Reserve an attempt before checking; failures must commit this counter.
            reserved = connection.execute(
                update(challenges)
                .where(
                    challenges.c.id == challenge_id,
                    challenges.c.phone == phone,
                    challenges.c.expires_at > now,
                    challenges.c.attempts < 5,
                    challenges.c.verified == 0,
                    challenges.c.consumed == 0,
                )
                .values(attempts=challenges.c.attempts + 1)
            )
            if reserved.rowcount:
                row = (
                    connection.execute(
                        select(challenges).where(
                            challenges.c.id == challenge_id,
                        )
                    )
                    .mappings()
                    .one()
                )
                valid = hmac.compare_digest(row["code_hash"], digest(challenge_id + code))
                if valid:
                    connection.execute(
                        update(challenges)
                        .where(challenges.c.id == challenge_id)
                        .values(verified=1, proof_hash=digest(proof), expires_at=now + CODE_SECONDS)
                    )
        if not valid:
            raise HTTPException(400, "인증번호가 틀렸거나 만료됐어요. 5회 실패 시 재발급해 주세요.")
        return {"verification_token": proof, "expires_in": CODE_SECONDS}

    def register(self, data, ip: str):
        self.throttle("signup-ip:" + ip, 20, 3600)
        now = int(time.time())
        encoded = password_hash(data.password.get_secret_value())
        try:
            with self.engine.begin() as connection:
                consumed = connection.execute(
                    update(challenges)
                    .where(
                        challenges.c.phone == data.phone,
                        challenges.c.proof_hash == digest(data.verification_token),
                        challenges.c.expires_at > now,
                        challenges.c.verified == 1,
                        challenges.c.consumed == 0,
                    )
                    .values(consumed=1)
                )
                if consumed.rowcount != 1:
                    raise HTTPException(400, "전화번호 인증을 다시 진행해 주세요.")
                connection.execute(
                    insert(accounts).values(
                        id=secrets.token_urlsafe(24),
                        username=data.username,
                        name=data.name,
                        password_hash=encoded,
                        age=data.age,
                        gender=data.gender,
                        region=data.region,
                        phone=data.phone,
                        created_at=now,
                    )
                )
        except IntegrityError:
            raise HTTPException(409, "이미 사용 중인 아이디 또는 전화번호예요.") from None
        return {"message": "회원가입이 완료됐어요. 로그인해 주세요."}

    def login(
        self,
        username: str,
        password: str,
        ip: str,
        previous: str | None = None,
        *,
        mobile: bool = False,
    ):
        self.throttle("login-ip:" + ip, 50, 900)
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
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        with self.engine.begin() as connection:
            connection.execute(delete(sessions).where(sessions.c.expires_at <= now))
            if previous:
                connection.execute(
                    delete(sessions).where(
                        sessions.c.token_hash == self.session_digest(previous, mobile=mobile)
                    )
                )
            connection.execute(
                insert(sessions).values(
                    token_hash=self.session_digest(token, mobile=mobile),
                    account_id=account["id"],
                    expires_at=now + SESSION_SECONDS,
                )
            )
        return token, self.public_account(account)

    @staticmethod
    def public_account(account):
        return {key: account[key] for key in ("id", "username", "name", "age", "gender", "region")}

    @staticmethod
    def session_digest(token: str, *, mobile: bool = False) -> str:
        # Separate bearer tokens from web cookies without changing existing sessions/schema.
        return digest("mobile:" + token if mobile else token)

    def me(self, token: str | None, *, mobile: bool = False):
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
                            sessions.c.token_hash == self.session_digest(token, mobile=mobile),
                            sessions.c.expires_at > int(time.time()),
                        )
                    )
                    .mappings()
                    .first()
                )
            if account:
                return self.public_account(account)
        raise HTTPException(401, "로그인이 필요해요.")

    def logout(self, token: str | None, *, mobile: bool = False):
        if token:
            with self.engine.begin() as connection:
                connection.execute(
                    delete(sessions).where(
                        sessions.c.token_hash == self.session_digest(token, mobile=mobile)
                    )
                )
