"""Explicit, resumable conversion of legacy private data and SQLite imports."""

import hmac
import json

from sqlalchemy import MetaData, Table, insert, inspect, select, update

from app.modules.admin.access import admin_grants
from app.modules.auth.models import accounts, kakao_flows, kakao_identities, privacy_state, sessions
from app.modules.auth.privacy import PrivacyError, encrypted_account
from app.modules.finance.storage import financial_profiles


def verify_lookup_key(connection, cipher):
    fingerprint = connection.execute(
        select(privacy_state.c.lookup_fingerprint).where(privacy_state.c.id == 1)
    ).scalar_one_or_none()
    if fingerprint is None or not hmac.compare_digest(fingerprint, cipher.lookup_fingerprint()):
        raise PrivacyError("Privacy migration or original lookup key is required")


def migrate_private_data(engine, cipher):
    """Encrypt legacy rows and rotate ciphertext; a data failure rolls back all DML."""
    count = 0
    with engine.begin() as connection:
        fingerprint = connection.execute(
            select(privacy_state.c.lookup_fingerprint).where(privacy_state.c.id == 1)
        ).scalar_one_or_none()
        if fingerprint is None:
            connection.execute(
                insert(privacy_state).values(id=1, lookup_fingerprint=cipher.lookup_fingerprint())
            )
        else:
            verify_lookup_key(connection, cipher)
        for row in connection.execute(select(accounts)).mappings().all():
            values = dict(row)
            if row["profile_ciphertext"]:
                private = cipher.decrypt_json(row["profile_ciphertext"], "account:" + row["id"])
                if not hmac.compare_digest(
                    row["username_lookup"] or "", cipher.lookup(private["username"])
                ):
                    raise PrivacyError("Original lookup key is required")
                if row["profile_ciphertext"].startswith(cipher.active_prefix):
                    continue
                values["profile_ciphertext"] = cipher.encrypt_json(private, "account:" + row["id"])
            else:
                values = encrypted_account(cipher, values)
            connection.execute(update(accounts).where(accounts.c.id == row["id"]).values(**values))
            count += 1
        for row in connection.execute(select(kakao_flows)).mappings().all():
            context = "kakao-flow:" + row["token_hash"]
            if row["nickname_ciphertext"]:
                nickname = cipher.decrypt(row["nickname_ciphertext"], context)
                if row["nickname_ciphertext"].startswith(cipher.active_prefix):
                    continue
            else:
                nickname = row["nickname"] or ""
            connection.execute(
                update(kakao_flows)
                .where(kakao_flows.c.token_hash == row["token_hash"])
                .values(nickname=None, nickname_ciphertext=cipher.encrypt(nickname, context))
            )
        if inspect(connection).has_table(financial_profiles.name):
            for row in connection.execute(select(financial_profiles)).mappings().all():
                context = "finance:" + row["account_id"]
                value = row["profile_json"]
                if value.startswith("enc:"):
                    plain = cipher.decrypt(value, context)
                    if value.startswith(cipher.active_prefix):
                        continue
                else:
                    # Validate JSON before changing a legacy record; do not drop unknown fields.
                    plain = value
                    if not isinstance(json.loads(plain), dict):
                        raise PrivacyError("Invalid legacy financial profile")
                connection.execute(
                    update(financial_profiles)
                    .where(financial_profiles.c.account_id == row["account_id"])
                    .values(profile_json=cipher.encrypt(plain, context))
                )
    return count


def import_sqlite_accounts(source, target, cipher):
    """Copy accounts, roles, provider links, sessions and finance without overwriting targets."""
    count = 0
    source_account_ids = set()
    imported_account_ids = set()
    with source.connect() as old, target.begin() as new:
        verify_lookup_key(new, cipher)
        source_tables = set(inspect(old).get_table_names())
        if accounts.name not in source_tables:
            raise PrivacyError("No source auth accounts table")
        legacy_accounts = Table(accounts.name, MetaData(), autoload_with=old)
        for row in old.execute(select(legacy_accounts)).mappings().all():
            source_account_ids.add(row["id"])
            values = dict(row)
            if values.get("profile_ciphertext"):
                private = cipher.decrypt_json(values["profile_ciphertext"], "account:" + row["id"])
                values.update(private)
            values = encrypted_account(
                cipher, {key: value for key, value in values.items() if key in accounts.c}
            )
            existing = (
                new.execute(select(accounts).where(accounts.c.id == row["id"])).mappings().first()
            )
            if existing:
                if existing["username_lookup"] != values["username_lookup"]:
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
                        value = cipher.decrypt(value, context)
                    values["profile_json"] = cipher.encrypt(value, context)
                new.execute(insert(table).values(**values))
    return count
