"""Separate auth tables; never modify the existing draft users/profile tables."""

from sqlalchemy import Column, Integer, MetaData, String, Table

metadata = MetaData()
accounts = Table(
    "auth_accounts",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("username", String(32), nullable=False, unique=True),
    # Legacy accounts have no name; new signups require one at the API boundary.
    Column("name", String(50), nullable=True),
    Column("password_hash", String(256), nullable=False),
    Column("age", Integer, nullable=False),
    Column("gender", String(16), nullable=False),
    Column("region", String(32), nullable=False),
    Column("phone", String(16), nullable=False, unique=True),
    Column("created_at", Integer, nullable=False),
)
challenges = Table(
    "auth_phone_challenges",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("phone", String(16), nullable=False, index=True),
    Column("code_hash", String(64), nullable=False),
    Column("expires_at", Integer, nullable=False),
    Column("attempts", Integer, nullable=False, default=0),
    Column("verified", Integer, nullable=False, default=0),
    Column("consumed", Integer, nullable=False, default=0),
    Column("proof_hash", String(64), nullable=True),
)
sessions = Table(
    "auth_sessions",
    metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("account_id", String(64), nullable=False, index=True),
    Column("expires_at", Integer, nullable=False, index=True),
)
limits = Table(
    "auth_rate_limits",
    metadata,
    Column("key", String(64), primary_key=True),
    Column("hits", Integer, nullable=False),
    Column("expires_at", Integer, nullable=False, index=True),
)
