"""Additive auth schema initialization and legacy account upgrades."""

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import String, inspect
from sqlalchemy.exc import DBAPIError

from app.modules.auth.models import metadata, username_lookup_index


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

        phone = next(
            c for c in inspect(connection).get_columns("auth_accounts") if c["name"] == "phone"
        )
        if not phone["nullable"]:
            # SQLite rebuilds this table; MySQL uses ALTER. IDs and rows are preserved.
            operations = Operations(MigrationContext.configure(connection))
            with operations.batch_alter_table("auth_accounts") as batch:
                batch.alter_column("phone", existing_type=String(16), nullable=True)

    with engine.begin() as connection:
        for table, additions in {
            "auth_accounts": {
                "username_lookup": "VARCHAR(64)",
                "profile_ciphertext": "TEXT",
            },
            "auth_kakao_flows": {"nickname_ciphertext": "TEXT"},
        }.items():
            columns = {c["name"] for c in inspect(connection).get_columns(table)}
            for name, sql_type in additions.items():
                if name not in columns:
                    connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}")
        username_lookup_index.create(connection, checkfirst=True)

        if connection.dialect.name == "mysql":
            subject = next(
                c
                for c in inspect(connection).get_columns("auth_kakao_flows")
                if c["name"] == "subject"
            )
            if subject["type"].length < 64:
                connection.exec_driver_sql(
                    "ALTER TABLE auth_kakao_flows MODIFY COLUMN subject VARCHAR(64) NULL"
                )
