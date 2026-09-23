"""Additive auth schema initialization and legacy account upgrades."""

from sqlalchemy import inspect
from sqlalchemy.exc import DBAPIError

from app.modules.auth.models import metadata


def initialize_auth_schema(engine):
    metadata.create_all(engine)
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("auth_accounts")}
        if "name" not in columns:
            try:
                connection.exec_driver_sql("ALTER TABLE auth_accounts ADD COLUMN name VARCHAR(50)")
            except DBAPIError:
                # Another worker may have completed the same additive migration.
                columns = {
                    column["name"] for column in inspect(connection).get_columns("auth_accounts")
                }
                if "name" not in columns:
                    raise
