"""Account-scoped monitoring facts, application progress and durable inbox alerts."""

import hashlib
import json
from collections import Counter
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
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
    inspect,
    select,
    update,
)
from sqlalchemy.exc import SQLAlchemyError

from app.modules.auth.account_write import account_write_transaction, require_active_account
from app.modules.auth.models import accounts
from app.modules.monitoring.feedback import REASONS, personalize, topic_tokens
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


def _feedback(history):
    by_policy = {}
    for row in history:
        item = json.loads(row["candidate_json"]).get("recommendation_feedback")
        if item and item.get("reason") in REASONS:
            previous = by_policy.get(item["policy_id"])
            if previous is None or item["updated_at"] > previous["updated_at"]:
                by_policy[item["policy_id"]] = item
    return sorted(by_policy.values(), key=lambda item: item["updated_at"], reverse=True)


def load_recommendation_feedback(engine, account_id):
    """Read existing preference storage; a fresh installation with no monitoring table has none."""
    with engine.connect() as connection:
        require_active_account(connection, account_id)
        if not inspect(connection).has_table(candidates.name):
            return []
        history = connection.execute(select(candidates.c.candidate_json).where(
            candidates.c.account_id == account_id)).mappings()
        return _feedback(history)


def invalidate_member_candidates(connection, account_id, member):
    """Account facts and saved recommendations change under the same account lock."""
    if not inspect(connection).has_table(profiles.name):
        return
    row = connection.execute(select(profiles).where(
        profiles.c.account_id == account_id
    ).with_for_update()).mappings().first()
    if row is None:
        return
    from app.modules.monitoring.public import derive_needs

    profile = MonitoringProfile.model_validate_json(row["profile_json"])
    now = _now()
    connection.execute(update(profiles).where(profiles.c.account_id == account_id).values(
        version=str(uuid4()), updated_at=now, last_checked_at=None,
        needs_json=_json(derive_needs(dict(member), profile)),
    ))
    # Keep application progress, document checks and recommendation feedback as history.
    connection.execute(update(candidates).where(
        candidates.c.account_id == account_id
    ).values(active=False))
    connection.execute(update(alerts).where(
        alerts.c.account_id == account_id, alerts.c.read_at.is_(None)
    ).values(read_at=now))


def _retire_snapshot_candidates(items, blocked):
    retired = []
    for item in items:
        if item["policy_id"] not in blocked:
            retired.append(item)
        elif (item.get("application_state", item.get("state", "watching")) != "watching"
              or item.get("recommendation_feedback")):
            retired.append({**item, "active": False})
    return retired


def filter_snapshot_gender(result, member, repository, *, store=None):
    """Recheck saved personal recommendations against the current public source in one query."""
    from app.contracts.conditions import CanonicalPolicy
    from app.modules.matching import public as matching
    from app.modules.monitoring.public import _logic_state, monitoring_facts
    from app.modules.storage.catalog import published_catalog

    policy_ids = {item["policy_id"] for item in result["candidates"]}
    policy_ids.update(item["policy_id"] for item in result["alerts"])
    if not policy_ids or result["profile"] is None:
        return result
    unread_by_policy = None
    if store is not None:
        with store.engine.connect() as connection:
            member = dict(require_active_account(connection, member["id"]))
            unread = connection.scalars(select(alerts.c.alert_json).where(
                alerts.c.account_id == member["id"], alerts.c.read_at.is_(None)))
            unread_by_policy = Counter(json.loads(item)["policy_id"] for item in unread)
            policy_ids.update(unread_by_policy)
    facts = monitoring_facts(member, MonitoringProfile.model_validate(result["profile"]))
    if facts.gender is None:
        return result
    try:
        if repository is None:
            raise ValueError("Current public sources are unavailable")
        latest = published_catalog(repository)
        documents = repository.tables["condition_documents"]
        query = select(latest, documents.c.canonical_json, documents.c.matching_enabled,
                       documents.c.review_status).join(
            documents, documents.c.revision_id == latest.c.revision_id
        ).where(latest.c.policy_key.in_(policy_ids))
        with repository.engine.connect() as connection:
            records = {row["policy_key"]: row for row in connection.execute(query).mappings()}
        blocked = policy_ids - records.keys()
        for policy_id, record in records.items():
            comparison = matching.compare_policy(record, facts)
            canonical = CanonicalPolicy.model_validate(record["canonical_json"])
            # Only a decisive gender restriction retires a saved recommendation here.
            # An unrelated age/region mismatch or a viable alternative branch stays
            # with the normal scanner; priority and household gender never become gates.
            gender_comparison = {**comparison, "checks": [
                {**check, "state": check["state"] if check["field_key"] == "gender" else "unknown"}
                for check in comparison["checks"]
            ]}
            if _logic_state(canonical, gender_comparison) is False:
                blocked.add(policy_id)
    except (SQLAlchemyError, ValidationError, ValueError, KeyError, TypeError):
        # Keep history and preferences, but do not repeat an unchecked recommendation.
        return {**result,
                "candidates": _retire_snapshot_candidates(result["candidates"], policy_ids),
                "alerts": [], "unread_count": 0, "scan_status": "unavailable",
                "scan_message": "지원 공고를 확인하지 못했어요. 다시 확인해 주세요."}
    if not blocked:
        return result
    hidden_unread = sum(not item["read"] for item in result["alerts"]
                        if item["policy_id"] in blocked)
    if unread_by_policy is not None:
        # The inbox preview is capped at 100 rows; count hidden unread alerts beyond it too.
        hidden_unread = sum(unread_by_policy[policy_id] for policy_id in blocked)
    return {**result,
            "candidates": _retire_snapshot_candidates(result["candidates"], blocked),
            "alerts": [item for item in result["alerts"] if item["policy_id"] not in blocked],
            "unread_count": max(0, result["unread_count"] - hidden_unread)}


def _preparation_requirements(candidate):
    """Only source-listed documents for an identified revision can have saved checks."""
    policy = candidate.get("policy", {})
    revision = policy.get("revisionId")
    guide = policy.get("applicationGuide") or {}
    documents = guide.get("documents")
    if (not isinstance(revision, str) or not revision
            or guide.get("documentsStatus") != "listed"
            or not isinstance(documents, list) or not documents):
        return None
    requirements = []
    for document in documents:
        if (not isinstance(document, dict) or not isinstance(document.get("id"), str)
                or not document["id"] or not isinstance(document.get("label"), str)
                or not document["label"].strip()):
            return None
        requirements.append((document["id"], document["label"]))
    if len({item[0] for item in requirements}) != len(requirements):
        return None
    # The same document set may be ordered differently across source presentations.
    return revision, _key(sorted(requirements)), [item[0] for item in requirements]


def _matching_preparation(candidate):
    requirements = _preparation_requirements(candidate)
    preparation = candidate.get("application_preparation")
    if (requirements is None or not isinstance(preparation, dict)
            or preparation.get("revision_id") != requirements[0]
            or preparation.get("documents_signature") != requirements[1]
            or not isinstance(preparation.get("prepared_document_ids"), list)):
        return None
    prepared = preparation["prepared_document_ids"]
    return {**preparation, "prepared_document_ids": [
        document_id for document_id in requirements[2] if document_id in prepared]}


def _preparation_view(candidate):
    preparation = _matching_preparation(candidate)
    if preparation is None:
        return None
    return {"revision_id": preparation["revision_id"],
            "prepared_document_ids": preparation["prepared_document_ids"]}


def _shared_preparation(history, candidate):
    requirements = _preparation_requirements(candidate)
    if requirements is None:
        return None
    choices = []
    for row in history:
        data = json.loads(row["candidate_json"])
        other = _preparation_requirements(data)
        if other is None or other[:2] != requirements[:2]:
            continue
        preparation = _matching_preparation(data)
        if preparation is not None:
            choices.append(preparation)
    if not choices:
        return None
    selected = max(choices, key=lambda item: item.get("updated_at", ""))
    return {**selected, "prepared_document_ids": [
        document_id for document_id in requirements[2]
        if document_id in selected["prepared_document_ids"]]}


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
        found = list(connection.execute(select(candidates).where(
            candidates.c.account_id == account_id,
        ).order_by(candidates.c.first_found_at, candidates.c.candidate_key)).mappings())
        feedback = _feedback(found)
        by_policy = {item["policy_id"]: item for item in feedback}
        candidate_list = []
        for candidate in found:
            data = json.loads(candidate["candidate_json"])
            # Preserve submitted applications even when a policy leaves the current catalog.
            # Excluded candidates remain available for undo after account/source changes.
            if (not candidate["active"] and candidate["application_state"] == "watching"
                    and data["policy_id"] not in by_policy):
                continue
            candidate_list.append({**data,
                                   "recommendation_feedback": by_policy.get(data["policy_id"]),
                                   "application_preparation": _preparation_view(data),
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
                "candidates": personalize(candidate_list, feedback) + [
                    item for item in candidate_list if item["recommendation_feedback"]],
                "recommendation_feedback": feedback,
                "alerts": alert_list, "unread_count": unread_count}

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

    def set_candidate_feedback(self, account_id, policy_id, need_id, reason):
        if reason is not None and reason not in REASONS:
            raise HTTPException(422, "추천에서 제외할 이유를 선택해 주세요.")
        with account_write_transaction(self.engine) as connection:
            require_active_account(connection, account_id)
            row = self._profile_row(connection, account_id)
            history = list(connection.execute(select(candidates).where(
                candidates.c.account_id == account_id)).mappings())
            exact = next((item for item in history
                          if item["candidate_key"] == _key(need_id, policy_id)), None)
            if row is None or exact is None:
                raise HTTPException(404, "추천받은 공고를 찾을 수 없어요.")
            data = json.loads(exact["candidate_json"])
            policy = data["policy"]
            preference = ({"policy_id": policy_id, "need_id": need_id, "reason": reason,
                           "title": policy["title"], "category": policy.get("category", ""),
                           "tokens": topic_tokens(policy), "updated_at": _now()}
                          if reason is not None else None)
            for item in history:
                candidate = json.loads(item["candidate_json"])
                if candidate["policy_id"] != policy_id:
                    continue
                candidate["recommendation_feedback"] = preference
                connection.execute(update(candidates).where(
                    candidates.c.account_id == account_id,
                    candidates.c.candidate_key == item["candidate_key"],
                ).values(candidate_json=_json(candidate)))
            if reason is not None:
                for alert in connection.execute(select(alerts).where(
                        alerts.c.account_id == account_id, alerts.c.read_at.is_(None))).mappings():
                    if json.loads(alert["alert_json"])["policy_id"] == policy_id:
                        connection.execute(update(alerts).where(
                            alerts.c.account_id == account_id,
                            alerts.c.alert_key == alert["alert_key"],
                        ).values(read_at=_now()))
            self._touch(connection, account_id)
            return self._snapshot(connection, account_id)

    def set_candidate_preparation(self, account_id, policy_id, need_id, revision_id,
                                  document_id, prepared):
        """A saved check records document preparation, never application or eligibility."""
        if type(prepared) is not bool:
            raise HTTPException(422, "서류 준비 여부를 확인해 주세요.")
        with account_write_transaction(self.engine) as connection:
            require_active_account(connection, account_id)
            profile = self._profile_row(connection, account_id)
            history = list(connection.execute(select(candidates).where(
                candidates.c.account_id == account_id)).mappings())
            exact = next((item for item in history
                          if item["candidate_key"] == _key(need_id, policy_id)), None)
            if profile is None or exact is None:
                raise HTTPException(404, "추천받은 공고를 찾을 수 없어요.")
            excluded = {item["policy_id"] for item in _feedback(history)}
            if not exact["active"] or policy_id in excluded:
                raise HTTPException(409, "현재 추천 중인 공고에서 서류를 준비해 주세요.")
            data = json.loads(exact["candidate_json"])
            requirements = _preparation_requirements(data)
            if (requirements is None or requirements[0] != revision_id
                    or document_id not in requirements[2]):
                raise HTTPException(409, "서류 안내가 변경됐어요. 공고를 다시 확인해 주세요.")
            related = [item for item in history
                       if json.loads(item["candidate_json"])["policy_id"] == policy_id]
            previous = _shared_preparation(related, data)
            prepared_ids = set(previous["prepared_document_ids"] if previous else [])
            if prepared:
                prepared_ids.add(document_id)
            else:
                prepared_ids.discard(document_id)
            preparation = {"revision_id": revision_id, "documents_signature": requirements[1],
                           "prepared_document_ids": [item for item in requirements[2]
                                                     if item in prepared_ids],
                           "updated_at": _now()}
            for item in related:
                candidate = json.loads(item["candidate_json"])
                other = _preparation_requirements(candidate)
                if other is None or other[:2] != requirements[:2]:
                    continue
                candidate["application_preparation"] = preparation
                connection.execute(update(candidates).where(
                    candidates.c.account_id == account_id,
                    candidates.c.candidate_key == item["candidate_key"],
                ).values(candidate_json=_json(candidate)))
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
        found = list(found)
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
            feedback = {item["policy_id"]: item for item in _feedback(existing.values())}
            # A changed source invalidates checks even in hidden histories. A profile edit
            # alone does not: candidates absent from this scan retain their original data.
            source_requirements = {}
            for candidate in found:
                requirement = _preparation_requirements(candidate)
                source_requirements.setdefault(candidate["policy_id"], set()).add(
                    requirement[:2] if requirement is not None else None)
            for item in existing.values():
                candidate = json.loads(item["candidate_json"])
                if candidate["policy_id"] not in source_requirements:
                    continue
                requirement = _preparation_requirements(candidate)
                identity = requirement[:2] if requirement is not None else None
                if identity not in source_requirements[candidate["policy_id"]]:
                    candidate["application_preparation"] = None
                    item = {**item, "candidate_json": _json(candidate)}
                    existing[item["candidate_key"]] = item
                    connection.execute(update(candidates).where(
                        candidates.c.account_id == account_id,
                        candidates.c.candidate_key == item["candidate_key"],
                    ).values(candidate_json=item["candidate_json"]))
            policy_history = {}
            for item in existing.values():
                policy_id = json.loads(item["candidate_json"])["policy_id"]
                policy_history.setdefault(policy_id, []).append(item)
            connection.execute(update(candidates).where(
                candidates.c.account_id == account_id
            ).values(active=False))
            seen = set()
            for candidate in found:
                candidate = {**candidate,
                             "recommendation_feedback": feedback.get(candidate["policy_id"]),
                             "application_preparation": _shared_preparation(
                                 policy_history.get(candidate["policy_id"], []), candidate)}
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
                if (changed and candidate["policy_id"] not in feedback
                        and application_state not in {"dismissed", "completed"}):
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
