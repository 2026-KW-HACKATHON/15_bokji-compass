"""Durable translation cache. Schema creation belongs to explicit storage initialization."""

import hashlib
import json
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    insert,
    select,
    update,
)
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.contracts.translation import PolicyTranslation

metadata = MetaData()
table = Table(
    "policy_translations", metadata,
    Column("cache_key", String(64), primary_key=True),
    Column("policy_id", String(255), nullable=False),
    Column("revision_id", String(36), nullable=False),
    Column("source_hash", String(64), nullable=False),
    Column("language", String(2), nullable=False),
    Column("prompt_version", String(80), nullable=False),
    Column("translation_json", JSON, nullable=False),
    Column("created_at", DateTime, nullable=False),
)
usage = Table(
    "policy_translation_usage", metadata,
    Column("day", String(10), primary_key=True),
    Column("calls", Integer, nullable=False),
)


class TranslationCache:
    def __init__(self, engine):
        self.engine = engine

    @staticmethod
    def key(policy_id, revision_id, source_hash, language, prompt_version):
        identity = json.dumps(
            [policy_id, revision_id, source_hash, language, prompt_version],
            ensure_ascii=False, separators=(",", ":"),
        )
        return hashlib.sha256(identity.encode("utf-8")).hexdigest()

    def get(self, key):
        with self.engine.connect() as connection:
            value = connection.scalar(
                select(table.c.translation_json).where(table.c.cache_key == key)
            )
        return None if value is None else PolicyTranslation.model_validate(value)

    def put(self, key, policy_id, revision_id, source_hash, language, prompt_version, value):
        row = {
            "cache_key": key, "policy_id": policy_id, "revision_id": revision_id,
            "source_hash": source_hash, "language": language, "prompt_version": prompt_version,
            "translation_json": value.model_dump(), "created_at": datetime.now(UTC).replace(
                tzinfo=None),
        }
        dialect = self.engine.dialect.name
        if dialect == "mysql":
            statement = mysql_insert(table).values(**row)
            statement = statement.on_duplicate_key_update(cache_key=statement.inserted.cache_key)
        elif dialect == "sqlite":
            statement = sqlite_insert(table).values(**row).on_conflict_do_nothing(
                index_elements=[table.c.cache_key])
        else:
            statement = insert(table).values(**row)
        with self.engine.begin() as connection:
            connection.execute(statement)

    def reserve_call(self, day: str, maximum: int) -> bool:
        """Reserve before inference and keep failed calls charged across workers and restarts."""
        if self.engine.dialect.name == "mysql":
            statement = mysql_insert(usage).values(day=day, calls=0)
            statement = statement.on_duplicate_key_update(day=statement.inserted.day)
        elif self.engine.dialect.name == "sqlite":
            statement = sqlite_insert(usage).values(day=day, calls=0).on_conflict_do_nothing(
                index_elements=[usage.c.day])
        else:
            raise ValueError("Translation budget requires MySQL or SQLite")
        with self.engine.begin() as connection:
            connection.execute(statement)
            result = connection.execute(update(usage).where(
                usage.c.day == day, usage.c.calls < maximum
            ).values(calls=usage.c.calls + 1))
            return result.rowcount == 1
