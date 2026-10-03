"""Account-scoped raw financial facts; calculations are never persisted."""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import (
    Column,
    ForeignKey,
    MetaData,
    String,
    Table,
    Text,
    delete,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from app.contracts.finance import FinancialProfile
from app.modules.auth.models import accounts
from app.modules.auth.privacy import PrivacyCipher

metadata = MetaData()
financial_profiles = Table(
    "account_financial_profiles",
    metadata,
    Column(
        "account_id",
        String(64),
        ForeignKey(accounts.c.id, ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("profile_json", Text, nullable=False),
    Column("updated_at", String(40), nullable=False),
)


@dataclass(frozen=True)
class StoredFinancialProfile:
    profile: FinancialProfile
    updated_at: str


class FinancialProfileStore:
    def __init__(self, engine, cipher: PrivacyCipher):
        self.engine = engine
        self.cipher = cipher

    def read(self, account_id: str) -> StoredFinancialProfile | None:
        with self.engine.connect() as connection:
            row = (
                connection.execute(
                    select(financial_profiles).where(financial_profiles.c.account_id == account_id)
                )
                .mappings()
                .first()
            )
        if row is None:
            return None
        return StoredFinancialProfile(
            FinancialProfile.model_validate_json(
                self.cipher.decrypt(row["profile_json"], "finance:" + account_id)
            ),
            row["updated_at"],
        )

    def save(self, account_id: str, profile: FinancialProfile) -> StoredFinancialProfile:
        updated_at = datetime.now(UTC).isoformat()
        values = {
            "profile_json": self.cipher.encrypt(profile.model_dump_json(), "finance:" + account_id),
            "updated_at": updated_at,
        }
        statement = (
            update(financial_profiles)
            .where(financial_profiles.c.account_id == account_id)
            .values(**values)
        )
        try:
            with self.engine.begin() as connection:
                if not connection.execute(statement).rowcount:
                    connection.execute(
                        insert(financial_profiles).values(account_id=account_id, **values)
                    )
        except IntegrityError:
            # Two first saves can race on the primary key. Retry only the scoped update.
            with self.engine.begin() as connection:
                if connection.execute(statement).rowcount != 1:
                    raise
        return StoredFinancialProfile(profile, updated_at)

    def delete(self, account_id: str) -> None:
        with self.engine.begin() as connection:
            connection.execute(
                delete(financial_profiles).where(financial_profiles.c.account_id == account_id)
            )
