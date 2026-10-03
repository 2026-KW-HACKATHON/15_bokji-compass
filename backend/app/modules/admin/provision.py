"""Trusted provisioning; public callers must enforce the creator's role first."""

import re
import secrets
import time

from sqlalchemy import insert, select

from app.modules.admin.access import admin_grants
from app.modules.auth.migration import ensure_plaintext_storage
from app.modules.auth.models import accounts
from app.modules.auth.service import password_hash


def create_operator(engine, username: str, password: str, *, role="qr_admin"):
    if role not in {"superadmin", "qr_admin"}:
        raise ValueError("허용되지 않은 관리자 등급입니다.")
    if not re.fullmatch(r"[a-z0-9_]{4,20}", username):
        raise ValueError("아이디 형식을 확인해 주세요.")
    if (
        not 12 <= len(password) <= 128
        or not re.search(r"[a-zA-Z]", password)
        or not re.search(r"[0-9]", password)
    ):
        raise ValueError("비밀번호는 영문과 숫자를 포함해 12~128자로 입력해 주세요.")
    account_id = secrets.token_urlsafe(24)
    ensure_plaintext_storage(engine)
    with engine.begin() as connection:
        if connection.execute(select(accounts.c.id).where(accounts.c.username == username)).first():
            raise ValueError(
                "이미 존재하는 아이디입니다. 기존 계정의 권한이나 비밀번호는 변경하지 않았습니다."
            )
        connection.execute(
            insert(accounts).values(
                **dict(
                    id=account_id,
                    username=username,
                    name="전시 관리자",
                    password_hash=password_hash(password),
                    phone=None,
                    age=0,
                    gender="undisclosed",
                    region="미설정",
                    created_at=int(time.time()),
                )
            )
        )
        connection.execute(
            insert(admin_grants).values(
                account_id=account_id, created_at=int(time.time()), role=role
            )
        )
    return account_id
