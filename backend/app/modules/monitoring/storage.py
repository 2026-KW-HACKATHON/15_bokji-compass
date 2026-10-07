"""Account-scoped monitoring facts, application progress and durable inbox alerts."""

import hashlib
import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Index,
    MetaData,
    String,
    Table,
    Text,
    delete,
    func,
    insert,
    select,
    update,
)

from app.modules.auth.account_write import account_write_transaction, require_active_account
from app.modules.auth.models import accounts
from app.modules.monitoring.models import MonitoringProfile

metadata = MetaData()
profiles = Table(
    "account_monitoring_profiles",
    metadata,
    Column("account_id", String(64), ForeignKey(accounts.c.id, ondelete="CASCADE"),
           primary_key=True),
    Column("profile_json", Text, nullable=False),
    Column("enabled", Boolean, nullable=False, default=False),
    Column("version", String(36), nullable=False),
    Column("updated_at", String(40), nullable=False),
    Column("last_checked_at", String(40)),
    Column("needs_json", Text, nullable=False),
)
candidates = Table(
    "account_monitoring_candidates",
    metadata,
    Column("account_id", String(64), ForeignKey(accounts.c.id, ondelete="CASCADE"),
           primary_key=True),
    Column("candidate_key", String(64), primary_key=True),
    Column("candidate_json", Text, nullable=False),
    Column("fingerprint", String(64), nullable=False),
    Column("application_state", String(16), nullable=False),
    Column("active", Boolean, nullable=False),
    Column("first_found_at", String(40), nullable=False),
    Column("updated_at", String(40), nullable=False),
)
alerts = Table(
    "account_monitoring_alerts",
    metadata,
    Column("account_id", String(64), ForeignKey(accounts.c.id, ondelete="CASCADE"),
           primary_key=True),
    Column("alert_key", String(64), primary_key=True),
    Column("alert_json", Text, nullable=False),
    Column("created_at", String(40), nullable=False),
    Column("read_at", String(40)),
)
Index("ix_monitoring_profiles_enabled", profiles.c.enabled, profiles.c.account_id)
Index("ix_monitoring_alerts_created", alerts.c.account_id, alerts.c.created_at)
MONITORING_TABLES = (profiles, candidates, alerts)
APPLICATION_STATES = frozenset({"watching", "preparing", "applied", "dismissed", "completed"})
STATE_PRIORITY = {"watching": 0, "preparing": 1, "applied": 2, "dismissed": 3, "completed": 4}


def _json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def _key(*parts):
    return hashlib.sha256(_json(parts).encode()).hexdigest()


def _now():
    return datetime.now(UTC).isoformat()


def _policy_state(history):
    # Older rows may conflict across topics. A newer scan of a "watching" row must not
    # erase actual progress. Explicit resets now update every row for the policy together.
    progressed = [item for item in history if item["application_state"] != "watching"]
    chosen = max(progressed or history, key=lambda item: (
        item["updated_at"], STATE_PRIORITY[item["application_state"]], item["candidate_key"]
    ))
    return chosen["application_state"]


class MonitoringStore:
    def __init__(self, engine):
        self.engine = engine

    @staticmethod
    def _profile_row(connection, account_id):
        return connection.execute(select(profiles).where(
            profiles.c.account_id == account_id
        ).with_for_update()).mappings().first()

    @staticmethod
    def _touch(connection, account_id, **fields):
        connection.execute(update(profiles).where(profiles.c.account_id == account_id).values(
            version=str(uuid4()), updated_at=_now(), **fields
        ))

    def _snapshot(self, connection, account_id):
        row = connection.execute(select(profiles).where(
            profiles.c.account_id == account_id
        )).mappings().first()
        if row is None:
            return {"profile": None, "enabled": False, "version": None, "updated_at": None,
                    "last_checked_at": None, "needs": [], "candidates": [], "alerts": [],
                    "unread_count": 0}
        found = connection.execute(select(candidates).where(
            candidates.c.account_id == account_id,
        ).order_by(candidates.c.first_found_at, candidates.c.candidate_key)).mappings()
        candidate_list = []
        for candidate in found:
            # Preserve submitted applications even when a policy leaves the current catalog.
            if not candidate["active"] and candidate["application_state"] == "watching":
                continue
            candidate_list.append({**json.loads(candidate["candidate_json"]),
                                   "application_state": candidate["application_state"],
                                   "state": candidate["application_state"],
                                   "active": bool(candidate["active"]),
                                   "first_found_at": candidate["first_found_at"],
                                   "updated_at": candidate["updated_at"]})
        inbox = connection.execute(select(alerts).where(alerts.c.account_id == account_id)
                                   .order_by(alerts.c.created_at.desc(), alerts.c.alert_key)
                                   .limit(100)).mappings()
        alert_list = [{**json.loads(alert["alert_json"]), "id": alert["alert_key"],
                       "created_at": alert["created_at"], "read_at": alert["read_at"],
                       "read": alert["read_at"] is not None} for alert in inbox]
        unread_count = connection.scalar(select(func.count()).select_from(alerts).where(
            alerts.c.account_id == account_id, alerts.c.read_at.is_(None)
        ))
        return {"profile": MonitoringProfile.model_validate_json(row["profile_json"])
                .model_dump(mode="json"), "enabled": bool(row["enabled"]),
                "version": row["version"], "updated_at": row["updated_at"],
                "last_checked_at": row["last_checked_at"], "needs": json.loads(row["needs_json"]),
                "candidates": candidate_list, "alerts": alert_list, "unread_count": unread_count}

    def read(self, account_id):
        with self.engine.connect() as connection:
            require_active_account(connection, account_id)
            return self._snapshot(connection, account_id)

    def save(self, account_id, profile, *, enabled=False):
        profile = MonitoringProfile.model_validate(profile)
        with account_write_transaction(self.engine) as connection:
            member = require_active_account(connection, account_id)
            prior = self._profile_row(connection, account_id)
            self._write_profile(connection, account_id, member, profile, prior, enabled=enabled)
            return self._snapshot(connection, account_id)

    def merge_confirmed_profile(self, account_id, changes):
        """Save only confirmed fields, preserving other facts and monitoring consent."""
        updates = MonitoringProfile.model_validate(changes).model_dump(exclude_unset=True)
        with account_write_transaction(self.engine) as connection:
            member = require_active_account(connection, account_id)
            prior = self._profile_row(connection, account_id)
            previous = (MonitoringProfile.model_validate_json(prior["profile_json"])
                        if prior is not None else MonitoringProfile())
            profile = MonitoringProfile.model_validate({**previous.model_dump(), **updates})
            self._write_profile(connection, account_id, member, profile, prior,
                                enabled=bool(prior["enabled"]) if prior is not None else False)
            return self._snapshot(connection, account_id)

    @staticmethod
    def _write_profile(connection, account_id, member, profile, prior, *, enabled):
        from app.modules.monitoring.public import derive_needs

        needs = derive_needs(dict(member), profile)
        values = {"profile_json": profile.model_dump_json(), "enabled": bool(enabled),
                  "version": str(uuid4()), "updated_at": _now(), "needs_json": _json(needs)}
        if prior is None:
            connection.execute(insert(profiles).values(account_id=account_id, **values))
        else:
            changed = prior["profile_json"] != values["profile_json"]
            if changed:
                values["last_checked_at"] = None
            connection.execute(update(profiles).where(
                profiles.c.account_id == account_id
            ).values(**values))
            if changed:
                connection.execute(update(candidates).where(
                    candidates.c.account_id == account_id
                ).values(active=False))

    def set_enabled(self, account_id, enabled):
        with account_write_transaction(self.engine) as connection:
            require_active_account(connection, account_id)
            if self._profile_row(connection, account_id) is None:
                raise HTTPException(409, "지속 안내에 사용할 상황 정보를 먼저 저장해 주세요.")
            self._touch(connection, account_id, enabled=bool(enabled))
            return self._snapshot(connection, account_id)

    def delete(self, account_id):
        with account_write_transaction(self.engine) as connection:
            require_active_account(connection, account_id)
            for table in (alerts, candidates, profiles):
                connection.execute(delete(table).where(table.c.account_id == account_id))

    def set_candidate_state(self, account_id, policy_id, need_id, state):
        if state not in APPLICATION_STATES:
            raise HTTPException(422, "지원 진행 상태를 확인해 주세요.")
        with account_write_transaction(self.engine) as connection:
            require_active_account(connection, account_id)
            row = self._profile_row(connection, account_id)
            exact = connection.execute(select(candidates.c.candidate_key).where(
                candidates.c.account_id == account_id,
                candidates.c.candidate_key == _key(need_id, policy_id),
            )).first()
            if row is None or exact is None:
                raise HTTPException(404, "추적 중인 지원을 찾을 수 없어요.")
            related = [item["candidate_key"] for item in connection.execute(
                select(candidates).where(candidates.c.account_id == account_id)
            ).mappings() if json.loads(item["candidate_json"])["policy_id"] == policy_id]
            # The exploration topic is an identity for recommendations; application progress
            # belongs to the policy and must also reach currently inactive topic histories.
            connection.execute(update(candidates).where(
                candidates.c.account_id == account_id,
                candidates.c.candidate_key.in_(related),
            ).values(application_state=state, updated_at=_now()))
            self._touch(connection, account_id)
            return self._snapshot(connection, account_id)

    def mark_read(self, account_id, ids):
        with account_write_transaction(self.engine) as connection:
            require_active_account(connection, account_id)
            if ids:
                connection.execute(update(alerts).where(
                    alerts.c.account_id == account_id, alerts.c.alert_key.in_(ids),
                    alerts.c.read_at.is_(None),
                ).values(read_at=_now()))
            return self._snapshot(connection, account_id)

    def record_scan(self, account_id, needs, found, *, expected_updated_at=None,
                    expected_version=None, expected_member=None):
        """Commit only a still-consented version; stale scans never recreate profile rows."""
        if expected_version is None and expected_updated_at is None:
            raise ValueError("A scan requires the version it evaluated")
        with account_write_transaction(self.engine) as connection:
            member = require_active_account(connection, account_id)
            row = self._profile_row(connection, account_id)
            stale = row is None or not row["enabled"]
            if expected_member is not None:
                stale |= expected_member.get("id") != account_id
                stale |= any(member[field] != expected_member.get(field)
                             for field in ("age", "gender", "region"))
            if row is not None:
                stale |= (expected_version is not None and row["version"] != expected_version)
                stale |= (expected_updated_at is not None
                          and row["updated_at"] != expected_updated_at)
            if stale:
                return self._snapshot(connection, account_id)
            now = _now()
            existing = {item["candidate_key"]: item for item in connection.execute(
                select(candidates).where(candidates.c.account_id == account_id)
            ).mappings()}
            policy_history = {}
            for item in existing.values():
                policy_id = json.loads(item["candidate_json"])["policy_id"]
                policy_history.setdefault(policy_id, []).append(item)
            policy_states = {policy_id: _policy_state(history)
                             for policy_id, history in policy_history.items()}
            connection.execute(update(candidates).where(
                candidates.c.account_id == account_id
            ).values(active=False))
            seen = set()
            for candidate in found:
                key = _key(candidate["need_id"], candidate["policy_id"])
                if key in seen:
                    continue
                seen.add(key)
                previous = existing.get(key)
                application_state = policy_states.get(candidate["policy_id"], "watching")
                values = {"candidate_json": _json(candidate),
                          "fingerprint": candidate["fingerprint"], "active": True,
                          "updated_at": now, "application_state": application_state}
                if previous is None:
                    connection.execute(insert(candidates).values(
                        account_id=account_id, candidate_key=key, first_found_at=now, **values
                    ))
                else:
                    connection.execute(update(candidates).where(
                        candidates.c.account_id == account_id, candidates.c.candidate_key == key
                    ).values(**values))
                changed = previous is None or previous["fingerprint"] != candidate["fingerprint"]
                if changed and application_state not in {"dismissed", "completed"}:
                    self._record_alert(connection, account_id, candidate, now,
                                       "new_candidate" if previous is None else "candidate_changed")
            self._touch(connection, account_id, needs_json=_json(needs), last_checked_at=now)
            return self._snapshot(connection, account_id)

    @staticmethod
    def _record_alert(connection, account_id, candidate, now, kind):
        key = _key(candidate["need_id"], candidate["policy_id"], candidate["fingerprint"])
        if connection.execute(select(alerts.c.alert_key).where(
            alerts.c.account_id == account_id, alerts.c.alert_key == key
        )).first():
            return
        policy = candidate["policy"]
        message = ("내 상황과 관련된 지원 후보를 찾았어요. 조건을 확인해 주세요."
                   if kind == "new_candidate" else "추적 중인 지원의 안내가 변경됐어요.")
        alert = {"need_id": candidate["need_id"], "policy_id": candidate["policy_id"],
                 "kind": kind, "title": policy.get("title", "맞춤 지원 안내"),
                 "message": message, "body": message, "reason": candidate["reason"],
                 "fingerprint": candidate["fingerprint"]}
        connection.execute(insert(alerts).values(account_id=account_id, alert_key=key,
                                                alert_json=_json(alert), created_at=now))

    def enabled_accounts(self, *, batch_size=100):
        """Keyset pages cover every enabled account without a fixed total-account cap."""
        if not 1 <= batch_size <= 1000:
            raise ValueError("batch_size must be between 1 and 1000")
        cursor = ""
        while True:
            with self.engine.connect() as connection:
                page = list(connection.scalars(select(profiles.c.account_id).join(
                    accounts, profiles.c.account_id == accounts.c.id
                ).where(profiles.c.enabled.is_(True), profiles.c.account_id > cursor)
                    .order_by(profiles.c.account_id).limit(batch_size)))
            if not page:
                return
            yield from page
            cursor = page[-1]
