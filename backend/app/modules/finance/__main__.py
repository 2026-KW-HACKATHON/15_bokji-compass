"""Initialize member and financial storage without encryption keys."""

from app.core.config import load_settings
from app.modules.auth.__main__ import member_engine
from app.modules.auth.migration import restore_plaintext_data
from app.modules.auth.schema import initialize_auth_schema
from app.modules.finance.schema import initialize_finance_schema


def main():
    settings = load_settings()
    engine = member_engine(settings)
    try:
        initialize_auth_schema(engine)
        initialize_finance_schema(engine)
        restore_plaintext_data(engine, settings)
        print("Account financial profile table initialized. Existing data was preserved.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
