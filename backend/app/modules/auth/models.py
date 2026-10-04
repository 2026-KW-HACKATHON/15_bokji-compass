"""Separate auth tables; never modify the existing draft users/profile tables."""

from sqlalchemy import Column, Index, Integer, MetaData, String, Table, Text

metadata = MetaData()
PROFILE_FIELDS = ("username", "name", "age", "gender", "region", "phone")
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
    Column("phone", String(16), nullable=True, unique=True),
    Column("created_at", Integer, nullable=False),
    # Retained for one-time restoration of older encrypted databases.
    Column("username_lookup", String(64), nullable=True),
    Column("profile_ciphertext", Text, nullable=True),
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

# Provider identities are separate; never merge by nickname, email or phone.
kakao_identities = Table(
    "auth_kakao_identities",
    metadata,
    Column("subject", String(64), primary_key=True),
    Column("account_id", String(64), nullable=False, unique=True),
)
kakao_flows = Table(
    "auth_kakao_flows",
    metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("binding_hash", String(64), nullable=False),
    Column("expires_at", Integer, nullable=False),
    Column("subject", String(64), nullable=True),
    Column("nickname", String(50), nullable=True),
    Column("nickname_ciphertext", Text, nullable=True),
)

privacy_state = Table(
    "auth_privacy_state",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("lookup_fingerprint", String(64), nullable=False),
)

username_lookup_index = Index(
    "uq_auth_accounts_username_lookup", accounts.c.username_lookup, unique=True
)
