"""Explicit, additive MySQL initialization: python -m app.modules.auth."""

from app.core.config import load_settings
from app.core.database import create_database_engine
from app.modules.auth.schema import initialize_auth_schema


def main():
    settings = load_settings()
    if not settings.db_enabled:
        raise SystemExit("Set DB_ENABLED=true to initialize MySQL auth tables.")
    engine = create_database_engine(settings)
    try:
        initialize_auth_schema(engine)
        print("Auth tables initialized. Existing policy/users tables were not modified.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
