"""Initialize member storage and restore older encrypted data without losing accounts."""

import argparse
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import load_settings
from app.modules.auth.database import create_member_engine
from app.modules.auth.migration import import_sqlite_accounts, restore_plaintext_data
from app.modules.auth.privacy import PrivacyError
from app.modules.auth.schema import initialize_auth_schema
from app.modules.finance.schema import initialize_finance_schema


def member_engine(settings):
    return create_member_engine(settings)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init"], nargs="?", default="init")
    parser.add_argument("--import-sqlite", type=Path)
    args = parser.parse_args()
    engine = source = None
    try:
        settings = load_settings()
        if args.import_sqlite:
            path = args.import_sqlite.resolve()
            if not path.is_file():
                raise PrivacyError("SQLite source does not exist")
            source = create_engine("sqlite:///" + path.as_posix())
        engine = member_engine(settings)
        if source is not None and source.url.database == engine.url.database:
            raise PrivacyError("Import source and destination must be different databases")
        initialize_auth_schema(engine)
        initialize_finance_schema(engine)
        changed = restore_plaintext_data(engine, settings)
        imported = import_sqlite_accounts(source, engine, settings) if source is not None else 0
        print(f"Member storage ready: {changed} restored, {imported} imported.")
    except (PrivacyError, SQLAlchemyError, ValueError, OSError) as exc:
        message = str(exc) if isinstance(exc, PrivacyError) else type(exc).__name__
        raise SystemExit("Member storage setup failed: " + message) from None
    finally:
        if source is not None:
            source.dispose()
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
