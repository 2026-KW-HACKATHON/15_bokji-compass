"""Restore older encrypted data and import accounts without overwriting live records."""

import hmac
import json

from sqlalchemy import MetaData, Table, delete, insert, inspect, select, update

from app.modules.admin.access import admin_grants
from app.modules.auth.models import (
    LEGACY_PROFILE_FIELDS,
    accounts,
    auth_consents,
    kakao_flows,
    kakao_identities,
    privacy_state,
    sessions,
)
from app.modules.auth.privacy import LegacyCipher, PrivacyError
from app.modules.finance.storage import financial_profiles


def ensure_plaintext_storage(engine):
    """Do not silently treat unmigrated encrypted accounts as new members."""
    with engine.connect() as connection:
        for column in (accounts.c.profile_ciphertext, kakao_flows.c.nickname_ciphertext):
            if connection.execute(
                select(column).where(column.is_not(None), column != "").limit(1)
            ).first():
                raise PrivacyError("Run python -m app.modules.auth init with the original keys")
        if (
            inspect(connection).has_table(financial_profiles.name)
            and connection.execute(
                select(financial_profiles.c.account_id)
                .where(financial_profiles.c.profile_json.like("enc:%"))
                .limit(1)
            ).first()
        ):
            raise PrivacyError("Run python -m app.modules.auth init with the original keys")


def restore_plaintext_data(engine, settings):
    """One-time decryption; missing/wrong keys roll back the entire conversion."""
    count = 0
    cipher = None

    def legacy_cipher():
        nonlocal cipher
        if cipher is None:
            cipher = LegacyCipher(settings)
        return cipher

    with engine.begin() as connection:
        for row in connection.execute(select(accounts)).mappings().all():
            if not row["profile_ciphertext"]:
                continue
            value = legacy_cipher()
            private = value.decrypt_json(row["profile_ciphertext"], "account:" + row["id"])
            if not all(key in private for key in LEGACY_PROFILE_FIELDS):
                raise PrivacyError("Incomplete encrypted profile")
            if not hmac.compare_digest(
                row["username_lookup"] or "", value.lookup(private["username"])
            ):
                raise PrivacyError("Original lookup key is required")
            values = {key: private[key] for key in LEGACY_PROFILE_FIELDS}
            values.update(username_lookup=None, profile_ciphertext=None)
            connection.execute(update(accounts).where(accounts.c.id == row["id"]).values(**values))
            count += 1
        for row in connection.execute(select(kakao_flows)).mappings().all():
            if not row["nickname_ciphertext"]:
                continue
            nickname = legacy_cipher().decrypt(
                row["nickname_ciphertext"], "kakao-flow:" + row["token_hash"]
            )
            connection.execute(
                update(kakao_flows)
                .where(kakao_flows.c.token_hash == row["token_hash"])
                .values(nickname=nickname, nickname_ciphertext=None)
            )
        if inspect(connection).has_table(financial_profiles.name):
            for row in connection.execute(select(financial_profiles)).mappings().all():
                value = row["profile_json"]
                if not value.startswith("enc:"):
                    continue
                plain = legacy_cipher().decrypt(value, "finance:" + row["account_id"])
                if not isinstance(json.loads(plain), dict):
                    raise PrivacyError("Invalid legacy financial profile")
                connection.execute(
                    update(financial_profiles)
                    .where(financial_profiles.c.account_id == row["account_id"])
                    .values(profile_json=plain)
                )
        connection.execute(delete(privacy_state))
    return count


def import_sqlite_accounts(source, target, settings=None):
    """Copy accounts and their data without overwriting live records or inferring consent."""
    count = 0
    source_account_ids = set()
    imported_account_ids = set()
    cipher = None
    ensure_plaintext_storage(target)

    def legacy_cipher():
        nonlocal cipher
        if cipher is None:
            if settings is None:
                raise PrivacyError("Original keys are required for an encrypted source")
            cipher = LegacyCipher(settings)
        return cipher

    with source.connect() as old, target.begin() as new:
        source_tables = set(inspect(old).get_table_names())
        if accounts.name not in source_tables:
            raise PrivacyError("No source auth accounts table")
        legacy_accounts = Table(accounts.name, MetaData(), autoload_with=old)
        for row in old.execute(select(legacy_accounts)).mappings().all():
            source_account_ids.add(row["id"])
            values = dict(row)
            if values.get("profile_ciphertext"):
                value = legacy_cipher()
                private = value.decrypt_json(values["profile_ciphertext"], "account:" + row["id"])
                if not all(key in private for key in LEGACY_PROFILE_FIELDS) or (
                    not hmac.compare_digest(
                        values.get("username_lookup") or "", value.lookup(private["username"])
                    )
                ):
                    raise PrivacyError("Original lookup key is required")
                values.update(private)
            values = {key: value for key, value in values.items() if key in accounts.c}
            values.update(username_lookup=None, profile_ciphertext=None)
            existing = (
                new.execute(select(accounts).where(accounts.c.id == row["id"])).mappings().first()
            )
            if existing:
                if existing["username"] != values["username"]:
                    raise PrivacyError("Source account conflicts with target")
                if existing["password_hash"] != values["password_hash"]:
                    raise PrivacyError("Source credentials conflict with target")
                continue
            new.execute(insert(accounts).values(**values))
            imported_account_ids.add(row["id"])
            count += 1
        for table, primary in (
            (admin_grants, "account_id"),
            (kakao_identities, "subject"),
            (sessions, "token_hash"),
            (financial_profiles, "account_id"),
            (auth_consents, "account_id"),
        ):
            if table.name not in source_tables:
                continue
            legacy = Table(table.name, MetaData(), autoload_with=old)
            for row in old.execute(select(legacy)).mappings().all():
                values = dict(row)
                if values["account_id"] not in source_account_ids:
                    raise PrivacyError("Source ownership references an absent account")
                if table is admin_grants:
                    values.setdefault("role", "qr_admin")
                    if values["role"] not in {"superadmin", "qr_admin"}:
                        raise PrivacyError("Invalid source administrator role")
                    if not new.execute(
                        select(accounts.c.id).where(accounts.c.id == values["account_id"])
                    ).first():
                        raise PrivacyError("Source administrator account is missing")
                existing = (
                    new.execute(select(table).where(table.c[primary] == values[primary]))
                    .mappings()
                    .first()
                )
                if existing:
                    if existing["account_id"] != values["account_id"]:
                        raise PrivacyError("Source ownership conflicts with target")
                    if table is admin_grants and existing["role"] != values["role"]:
                        raise PrivacyError("Source administrator role conflicts with target")
                    continue
                # Re-importing an old backup must not undo logout, permission revocation,
                # provider unlinking or deletion of saved financial information.
                if values["account_id"] not in imported_account_ids:
                    continue
                if table is financial_profiles:
                    context = "finance:" + values["account_id"]
                    value = values["profile_json"]
                    if value.startswith("enc:"):
                        value = legacy_cipher().decrypt(value, context)
                    if not isinstance(json.loads(value), dict):
                        raise PrivacyError("Invalid source financial profile")
                    values["profile_json"] = value
                new.execute(insert(table).values(**values))
    return count
