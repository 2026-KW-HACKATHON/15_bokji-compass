"""Add only the financial profile table; never alter policy or draft user tables."""

from app.modules.finance.storage import metadata


def initialize_finance_schema(engine):
    metadata.create_all(engine)
