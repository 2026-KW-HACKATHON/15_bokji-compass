"""Auth schema initialization and data-preserving account upgrades."""

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Integer, String, inspect
from sqlalchemy.exc import DBAPIError

from app.modules.admin.access import admin_grants  # noqa: F401 -- registers the additive role table
from app.modules.auth.models import metadata, username_lookup_index


def initialize_auth_schema(engine):
    metadata.create_all(engine)
    with engine.begin() as connection:
        role_columns = {
            column["name"] for column in inspect(connection).get_columns("auth_admin_grants")
        }
        if "role" not in role_columns:
            try:
                connection.exec_driver_sql(
                    "ALTER TABLE auth_admin_grants ADD COLUMN role "
                    "VARCHAR(20) NOT NULL DEFAULT 'qr_admin'"
                )
            except DBAPIError:
                if "role" not in {
                    column["name"]
                    for column in inspect(connection).get_columns("auth_admin_grants")
                }:
                    raise
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

        account_columns = {c["name"]: c for c in inspect(connection).get_columns("auth_accounts")}
        optional_columns = {"phone": String(16), "age": Integer(), "region": String(32)}
        required_columns = {
            name: sql_type
            for name, sql_type in optional_columns.items()
            if not account_columns[name]["nullable"]
        }
        if required_columns:
            # SQLite rebuilds this table; MySQL uses ALTER. IDs and rows are preserved.
            operations = Operations(MigrationContext.configure(connection))
            with operations.batch_alter_table("auth_accounts") as batch:
                for name, sql_type in required_columns.items():
                    batch.alter_column(name, existing_type=sql_type, nullable=True)

    with engine.begin() as connection:
        for table, additions in {
            "auth_accounts": {
                "username_lookup": "VARCHAR(64)",
                "profile_ciphertext": "TEXT",
                "email": "VARCHAR(254)",
                "email_verified_at": "INTEGER",
                "postal_code": "VARCHAR(5)",
                "address": "VARCHAR(200)",
                "address_detail": "VARCHAR(200)",
            },
            "auth_kakao_flows": {"nickname_ciphertext": "TEXT"},
            "auth_consents": {"ai_notice_version": "VARCHAR(64)"},
        }.items():
            columns = {c["name"] for c in inspect(connection).get_columns(table)}
            for name, sql_type in additions.items():
                if name not in columns:
                    try:
                        connection.exec_driver_sql(
                            f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"
                        )
                    except DBAPIError:
                        if name not in {c["name"] for c in inspect(connection).get_columns(table)}:
                            raise
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
