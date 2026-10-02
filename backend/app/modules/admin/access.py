"""Roles are bound to immutable account IDs, never a requested username/header."""

from sqlalchemy import Column, Integer, String, Table, select
from sqlalchemy.exc import SQLAlchemyError

from app.modules.auth.models import metadata

admin_grants = Table(
    "auth_admin_grants",
    metadata,
    Column("account_id", String(64), primary_key=True),
    Column("created_at", Integer, nullable=False),
    Column("role", String(20), nullable=False, server_default="qr_admin"),
)


def admin_role(engine, account_id: str):
    try:
        with engine.connect() as connection:
            role = connection.execute(
                select(admin_grants.c.role).where(admin_grants.c.account_id == account_id)
            ).scalar_one_or_none()
            return role if role in {"superadmin", "qr_admin"} else None
    except SQLAlchemyError:
        # An uninitialized role table must never grant privileges or break ordinary login.
        return None


def is_admin(engine, account_id: str) -> bool:
    return admin_role(engine, account_id) is not None


def with_capabilities(service, user: dict) -> dict:
    role = admin_role(service.engine, user["id"])
    return {**user, "is_admin": role is not None, "admin_role": role}
