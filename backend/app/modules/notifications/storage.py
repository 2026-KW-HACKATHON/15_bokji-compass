"""Private settings, plus destinations bound to a live mobile login session."""

import hashlib
import time

from fastapi import HTTPException
from sqlalchemy import Column, Integer, MetaData, String, Table, Text, insert, select, update
from sqlalchemy.exc import IntegrityError

from app.modules.auth.account_write import account_write_transaction, require_active_account
from app.modules.auth.models import accounts, sessions
from app.modules.notifications.models import DeviceInput, Preferences

metadata = MetaData()
preferences = Table(
    "account_notification_preferences",
    metadata,
    Column("account_id", String(64), primary_key=True),
    Column("preferences_json", Text, nullable=False),
)
devices = Table(
    "mobile_push_devices",
    metadata,
    Column("token_hash", String(64), primary_key=True),
    Column("push_token", String(256), nullable=False),
    Column("account_id", String(64), nullable=False, index=True),
    Column("session_hash", String(64), nullable=False, index=True),
    Column("platform", String(10), nullable=False),
    Column("active", Integer, nullable=False),
)


def initialize_notification_schema(engine):
    metadata.create_all(engine, tables=[preferences, devices])


class NotificationStore:
    def __init__(self, engine):
        self.engine = engine

    def _upsert(self, table, key, value, fields, account_id, session_hash=None):
        statement = update(table).where(key == value).values(**fields)
        try:
            with account_write_transaction(self.engine) as connection:
                self._require_member(connection, account_id, session_hash)
                exists = connection.execute(select(key).where(key == value)).first()
                if exists:
                    connection.execute(statement)
                else:
                    connection.execute(insert(table).values({key.name: value, **fields}))
        except IntegrityError:
            with account_write_transaction(self.engine) as connection:
                self._require_member(connection, account_id, session_hash)
                if connection.execute(statement).rowcount != 1:
                    raise

    @staticmethod
    def _require_member(connection, account_id, session_hash):
        require_active_account(connection, account_id)
        if session_hash is not None:
            active_session = connection.execute(
                select(sessions.c.token_hash)
                .where(
                    sessions.c.account_id == account_id,
                    sessions.c.token_hash == session_hash,
                    sessions.c.expires_at > int(time.time()),
                )
                .with_for_update()
            ).first()
            if active_session is None:
                raise HTTPException(401, "로그인이 필요해요.")

    def read(self, account_id: str) -> Preferences:
        with self.engine.connect() as connection:
            value = connection.execute(
                select(preferences.c.preferences_json).where(preferences.c.account_id == account_id)
            ).scalar_one_or_none()
        return Preferences.model_validate_json(value) if value else Preferences()

    def save(self, account_id: str, value: Preferences) -> Preferences:
        self._upsert(
            preferences,
            preferences.c.account_id,
            account_id,
            {"preferences_json": value.model_dump_json()},
            account_id,
        )
        return value

    def register(self, account_id: str, session_hash: str, device: DeviceInput):
        token_hash = hashlib.sha256(device.push_token.encode()).hexdigest()
        self._upsert(
            devices,
            devices.c.token_hash,
            token_hash,
            {
                "push_token": device.push_token,
                "account_id": account_id,
                "session_hash": session_hash,
                "platform": device.platform,
                "active": 1,
            },
            account_id,
            session_hash,
        )

    def disable_session(self, account_id: str, session_hash: str):
        with self.engine.begin() as connection:
            connection.execute(
                update(devices)
                .where(devices.c.account_id == account_id, devices.c.session_hash == session_hash)
                .values(active=0)
            )

    def destinations(self, account_id: str) -> list[str]:
        with self.engine.connect() as connection:
            return list(
                connection.execute(
                    select(devices.c.push_token)
                    .join(sessions, devices.c.session_hash == sessions.c.token_hash)
                    .join(accounts, devices.c.account_id == accounts.c.id)
                    .where(
                        devices.c.account_id == account_id,
                        devices.c.active == 1,
                        sessions.c.account_id == account_id,
                        sessions.c.expires_at > int(time.time()),
                    )
                ).scalars()
            )
