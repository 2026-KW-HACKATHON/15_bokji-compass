"""Explicit MySQL initialization: python -m app.modules.finance."""

from app.core.config import load_settings
from app.core.database import create_database_engine
from app.modules.auth.migration import migrate_private_data
from app.modules.auth.privacy import PrivacyCipher
from app.modules.auth.schema import initialize_auth_schema
from app.modules.finance.schema import initialize_finance_schema


def main():
    settings = load_settings()
    if not settings.db_enabled:
        raise SystemExit("Set DB_ENABLED=true to initialize account financial profiles.")
    cipher = PrivacyCipher(settings)
    engine = create_database_engine(settings)
    try:
        initialize_auth_schema(engine)
        initialize_finance_schema(engine)
        migrate_private_data(engine, cipher)
        print("Account financial profile table initialized. Existing data was preserved.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
