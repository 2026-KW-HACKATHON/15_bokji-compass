"""Initialize/rotate MySQL privacy storage or import an existing local SQLite account DB."""

import argparse
import base64
import json
import os
import secrets
from pathlib import Path

from dotenv import dotenv_values, set_key
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT, load_settings
from app.core.database import create_database_engine
from app.modules.auth.migration import import_sqlite_accounts, migrate_private_data
from app.modules.auth.privacy import PrivacyCipher, PrivacyError
from app.modules.auth.schema import initialize_auth_schema
from app.modules.finance.schema import initialize_finance_schema


def generate_local_keys():
    path = Path(os.environ.get("APP_CONFIG_FILE", BACKEND_ROOT / ".env"))
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    if not path.is_file():
        raise PrivacyError("Create your server .env before generating privacy keys")
    current = dotenv_values(path)
    if current.get("AUTH_LOOKUP_KEY") or current.get("AUTH_ENCRYPTION_KEYS") not in (
        None,
        "",
        "{}",
    ):
        raise PrivacyError("Existing privacy keys were preserved; configure rotation explicitly")
    key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
    lookup = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
    set_key(path, "AUTH_ENCRYPTION_KEYS", json.dumps({"primary": key}))
    set_key(path, "AUTH_ENCRYPTION_KEY_ID", "primary")
    set_key(path, "AUTH_LOOKUP_KEY", lookup)
    print("Privacy keys saved to the server .env. Key values were not printed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "keys"], nargs="?", default="init")
    parser.add_argument("--import-sqlite", type=Path)
    args = parser.parse_args()
    engine = source = None
    try:
        if args.action == "keys":
            if args.import_sqlite:
                parser.error("--import-sqlite is only valid with init")
            generate_local_keys()
            return
        settings = load_settings()
        if not settings.db_enabled:
            raise PrivacyError("Set DB_ENABLED=true to initialize MySQL member storage")
        cipher = PrivacyCipher(settings)
        # Preflight the source before modifying MySQL schema.
        if args.import_sqlite:
            path = args.import_sqlite.resolve()
            if not path.is_file():
                raise PrivacyError("SQLite source does not exist")
            source = create_engine("sqlite:///" + path.as_posix())
        engine = create_database_engine(settings)
        initialize_auth_schema(engine)
        initialize_finance_schema(engine)
        changed = migrate_private_data(engine, cipher)
        imported = 0
        if source is not None:
            imported = import_sqlite_accounts(source, engine, cipher)
            # After a successful destination commit, encrypt the preserved local source too.
            initialize_auth_schema(source)
            migrate_private_data(source, cipher)
            with source.connect() as connection:
                connection.exec_driver_sql("PRAGMA secure_delete=ON")
                connection.exec_driver_sql("VACUUM")
        print(f"MySQL member storage ready: {changed} converted/rotated, {imported} imported.")
    except (PrivacyError, SQLAlchemyError, ValueError, OSError) as exc:
        # Never print SQL parameters, raw provider/private data or secrets.
        message = str(exc) if isinstance(exc, PrivacyError) else type(exc).__name__
        raise SystemExit("Member storage setup failed: " + message) from None
    finally:
        if source is not None:
            source.dispose()
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
