"""Serialize account writes with withdrawal and refuse writes for deleted members."""

from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy import select

from app.modules.auth.models import accounts


@contextmanager
def account_write_transaction(engine):
    with engine.begin() as connection:
        if connection.dialect.name == "sqlite":
            # SQLite has no SELECT FOR UPDATE; take its writer lock before reading.
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        yield connection


def require_active_account(connection, account_id):
    account = (
        connection.execute(select(accounts).where(accounts.c.id == account_id).with_for_update())
        .mappings()
        .first()
    )
    if account is None:
        raise HTTPException(401, "로그인이 필요해요.")
    return account
