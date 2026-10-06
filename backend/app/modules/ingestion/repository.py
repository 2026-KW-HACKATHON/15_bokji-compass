"""Durable collection jobs, cursors and quotas. No network or model calls here."""

import hashlib
import time
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import func, insert, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.contracts.parsing import SourcePolicy
from app.modules.ingestion import models as m
from app.modules.ingestion.identity import (
    canonical_url,
    changed_fields,
    content_hash,
    digest,
    listing_hash,
    matching_title,
)


class LeaseLost(RuntimeError):
    pass


class PageSizeMismatch(ValueError):
    code = "page_size_mismatch"


class IngestionRepository:
    def __init__(self, engine, *, allow_sqlite_for_tests=False):
        if engine.dialect.name != "mysql" and not (
            allow_sqlite_for_tests and engine.dialect.name == "sqlite"
        ):
            raise ValueError("Server collection requires MySQL")
        self.engine = engine

    def check_schema(self):
        with self.engine.connect() as c:
            for table in m.metadata.tables.values():
                c.execute(select(table).limit(0))

    def _state_row(self, c, key):
        query = select(m.state).where(m.state.c.state_key == key).with_for_update()
        row = c.execute(query).mappings().first()
        if row is None:
            try:
                with c.begin_nested():
                    c.execute(insert(m.state).values(state_key=key, payload={}, lease_until=0))
            except IntegrityError:
                pass
            row = c.execute(query).mappings().one()
        return row

    def get_state(self, key):
        with self.engine.connect() as c:
            return c.scalar(select(m.state.c.payload).where(m.state.c.state_key == key)) or {}

    def set_state(self, key, payload):
        with self.engine.begin() as c:
            self._set_state(c, key, payload)

    def _set_state(self, c, key, payload):
        self._state_row(c, key)
        c.execute(update(m.state).where(m.state.c.state_key == key).values(payload=payload))

    def acquire_worker(self, token, now, seconds):
        with self.engine.begin() as c:
            row = self._state_row(c, "worker")
            if row["lease_token"] and row["lease_until"] > now:
                return False
            c.execute(update(m.state).where(m.state.c.state_key == "worker").values(
                lease_token=token, lease_until=now + seconds))
            return True

    def assert_worker(self, c, token, now):
        row = self._state_row(c, "worker")
        if row["lease_token"] != token or row["lease_until"] <= now:
            raise LeaseLost("Worker lease expired")

    def renew_worker(self, token, now, seconds):
        with self.engine.begin() as c:
            self.assert_worker(c, token, now)
            c.execute(update(m.state).where(m.state.c.state_key == "worker").values(
                lease_until=now + seconds))

    def seed_all_existing(self, policies, signature, *, limit=100, worker_token,
                          progress=None, adopt_legacy=False):
        """Commit small batches, renew ownership, and resume until the cursor is exhausted."""
        total = {"indexed": 0, "reused": 0, "scanned": 0, "batches": 0, "complete": False}
        while not total["complete"]:
            self.renew_worker(worker_token, time.time(), 660)
            result = self.seed_existing(policies, signature, time.time(), limit=limit,
                worker_token=worker_token, adopt_legacy=adopt_legacy)
            for name in ("indexed", "reused", "scanned"):
                total[name] += result[name]
            total["batches"] += 1
            total["complete"] = result["complete"]
            if not total["complete"] and not result["scanned"]:
                raise RuntimeError("Existing index made no progress")
            if progress:
                progress(dict(total))
        return total

    def release_worker(self, token):
        with self.engine.begin() as c:
            c.execute(update(m.state).where(m.state.c.state_key == "worker",
                m.state.c.lease_token == token).values(lease_token=None, lease_until=0))

    def reserve_call(self, provider, now, limit, *, timezone="Asia/Seoul"):
        day = datetime.fromtimestamp(now, ZoneInfo(timezone)).date().isoformat()
        with self.engine.begin() as c:
            query = select(m.usage).where(m.usage.c.provider == provider,
                                         m.usage.c.day == day).with_for_update()
            row = c.execute(query).mappings().first()
            if row is None:
                try:
                    with c.begin_nested():
                        c.execute(insert(m.usage).values(provider=provider, day=day, calls=0))
                except IntegrityError:
                    pass
                row = c.execute(query).mappings().one()
            if row["calls"] >= limit:
                return False
            c.execute(update(m.usage).where(m.usage.c.provider == provider,
                m.usage.c.day == day).values(calls=m.usage.c.calls + 1))
            return True

    def pending_count(self, kinds=None):
        with self.engine.connect() as c:
            query = select(func.count()).select_from(m.jobs).where(
                m.jobs.c.status.in_(("pending", "running")))
            if kinds:
                query = query.where(m.jobs.c.kind.in_(kinds))
            return c.scalar(query)

    def requeue_version(self, job, signature, now):
        """A configuration upgrade gets a fresh work identity without losing the original source."""
        source = SourcePolicy.model_validate(job["payload"]["source"])
        with self.engine.begin() as c:
            self._owned(c, job, now)
            self._enqueue(c, "parse", source.policy_key, {**job["payload"], "signature": signature},
                [content_hash(source), signature], now, priority=job["priority"])
            c.execute(update(m.jobs).where(m.jobs.c.job_id == job["job_id"]).values(
                status="done", lease_token=None, lease_until=0,
                error_code="processing_version_changed", updated_at=now))

    def _enqueue(self, c, kind, key, payload, identity, now, *, priority=20):
        work_key = digest([kind, key, identity])
        row = c.execute(select(m.jobs).where(m.jobs.c.work_key == work_key)).mappings().first()
        if row:
            return dict(row), False
        values = dict(job_id=str(uuid4()), work_key=work_key, kind=kind, policy_key=key,
                      payload=payload, status="pending", priority=priority, attempts=0,
                      next_attempt_at=now, lease_until=0, created_at=now, updated_at=now)
        try:
            with c.begin_nested():
                c.execute(insert(m.jobs).values(**values))
        except IntegrityError:
            return dict(c.execute(select(m.jobs).where(
                m.jobs.c.work_key == work_key).with_for_update()).mappings().one()), False
        return values, True

    def observe_listing(self, c, provider, row, now, recheck_seconds):
        external_id = row.get("servId") if provider == "bokjiro" else row.get("서비스ID")
        if not isinstance(external_id, str) or not external_id.strip():
            raise ValueError("Provider record requires a string service ID")
        external_id = external_id.strip()
        key = f"{provider}:{external_id}"
        if len(key) > 255:
            raise ValueError("Source identity too long")
        old = c.execute(select(m.records).where(
            m.records.c.policy_key == key).with_for_update()).mappings().first()
        new_hash = listing_hash(row)
        if old is None:
            c.execute(insert(m.records).values(policy_key=key, provider=provider,
                external_id=external_id, listing_json=row, listing_hash=new_hash,
                last_seen_at=now, next_check_at=0))
        else:
            c.execute(update(m.records).where(m.records.c.policy_key == key).values(
                listing_json=row, listing_hash=new_hash, last_seen_at=now))
        if provider == "bokjiro" and (old is None or old["source_json"] is None
                or old["listing_hash"] != new_hash or old["next_check_at"] <= now):
            identity = [new_hash, int(now // recheck_seconds)]
            _, queued = self._enqueue(c, "detail", key, {"provider": provider,
                "external_id": external_id}, identity, now,
                priority=10 if old and old["listing_hash"] != new_hash else 20)
            return int(queued)
        return 0

    def observe_source(self, source, raw, signature, now, recheck_seconds, *, raw_path=None,
                       connection=None):
        if connection is None:
            with self.engine.begin() as c:
                return self.observe_source(source, raw, signature, now, recheck_seconds,
                                           raw_path=raw_path, connection=c)
        c = connection
        key = source.policy_key
        provider, external_id = key.split(":", 1)
        old = c.execute(select(m.records).where(
            m.records.c.policy_key == key).with_for_update()).mappings().first()
        chash = content_hash(source)
        changed = old is not None and old["content_hash"] is not None and (
            old["content_hash"] != chash)
        if old and old["content_hash"] == chash:
            # Keep the exact durable input including the original source_hash for reuse.
            stored = old["source_json"]
            snapshot_id = old["snapshot_id"]
        else:
            stored = source.model_dump()
            snapshot_id = str(uuid4())
            c.execute(insert(m.snapshots).values(snapshot_id=snapshot_id, policy_key=key,
                content_hash=chash, raw_hash=digest(raw), source_json=stored, raw_json=raw,
                raw_path=raw_path, previous_snapshot_id=old["snapshot_id"] if old else None,
                changed_fields=changed_fields(old["source_json"] if old else None, stored),
                observed_at=now))
        url_hash = None
        if source.source_url:
            try:
                url_hash = digest(canonical_url(source.source_url))
            except ValueError:
                pass
        values = dict(snapshot_id=snapshot_id, content_hash=chash, source_json=stored,
                      url_hash=url_hash,
                      last_seen_at=now, last_checked_at=now, next_check_at=now + recheck_seconds)
        if changed:
            values["revision_id"] = None
        if old is None:
            c.execute(insert(m.records).values(policy_key=key, provider=provider,
                external_id=external_id, **values))
        else:
            c.execute(update(m.records).where(m.records.c.policy_key == key).values(**values))
        job, queued = self._enqueue(c, "parse", key,
            {"source": stored, "signature": signature, "snapshot_id": snapshot_id},
            [chash, signature], now, priority=5 if changed else 20)
        if job.get("revision_id"):
            c.execute(update(m.records).where(m.records.c.policy_key == key).values(
                revision_id=job["revision_id"]))
        return {"new": old is None or old["content_hash"] is None,
                "changed": changed, "unchanged": bool(old and old["content_hash"] == chash),
                "queued": queued, "snapshot_id": snapshot_id}

    def prepare_scan(self, scan_key, per_page, now, *, worker_token):
        """Reset an unfinished scan when its page size changes, before fetching anything."""
        if isinstance(per_page, bool) or not isinstance(per_page, int) or not 1 <= per_page <= 100:
            raise ValueError("Collection page size must be between 1 and 100")
        with self.engine.begin() as c:
            self.assert_worker(c, worker_token, now)
            before = self._state_row(c, scan_key)["payload"]
            prepared = {**before, "per_page": per_page}
            if before.get("page", 1) > 1 and before.get("per_page") != per_page:
                prepared.update(page=1, page_hash=None, next_due_at=0, scan_complete=False)
            self._set_state(c, scan_key, prepared)
            return prepared

    def save_page(self, scan_key, page, now, interval, handle_rows, *, worker_token):
        """Records/jobs and the next page commit together; row failure leaves cursor untouched."""
        with self.engine.begin() as c:
            self.assert_worker(c, worker_token, now)
            before = self._state_row(c, scan_key)["payload"]
            expected = before.get("page", 1)
            if expected != page.page:
                raise LeaseLost("Scan cursor changed")
            if before.get("per_page", page.per_page) != page.per_page:
                raise PageSizeMismatch("Provider page size differs from the prepared scan")
            page_hash = digest(page.rows)
            if page.page > 1 and page.rows and page_hash == before.get("page_hash"):
                raise ValueError("Provider repeated the same page")
            result = handle_rows(c, page.rows)
            complete = not page.rows or (page.total_count is not None and
                page.page * page.per_page >= page.total_count) or (
                page.total_count is None and len(page.rows) < page.per_page)
            self._set_state(c, scan_key, {"page": 1 if complete else page.page + 1,
                "per_page": page.per_page,
                "generation": before.get("generation", 0) + int(complete),
                "next_due_at": now + interval if complete else now,
                "last_success_at": now, "page_hash": None if complete else page_hash,
                "total_count": page.total_count, "scan_complete": complete})
            return result

    def claim(self, token, now, lease_seconds, *, kinds=None, max_attempts=3):
        with self.engine.begin() as c:
            self.assert_worker(c, token, now)
            c.execute(update(m.jobs).where(m.jobs.c.status == "running",
                m.jobs.c.lease_until <= now).values(status="pending", lease_token=None,
                                                  error_code="worker_interrupted"))
            c.execute(update(m.jobs).where(m.jobs.c.status == "pending",
                m.jobs.c.attempts >= max_attempts).values(status="dead"))
            query = select(m.jobs).where(m.jobs.c.status == "pending",
                m.jobs.c.next_attempt_at <= now, m.jobs.c.attempts < max_attempts)
            if kinds:
                query = query.where(m.jobs.c.kind.in_(kinds))
            row = c.execute(query.order_by(m.jobs.c.priority, m.jobs.c.created_at,
                m.jobs.c.job_id).limit(1).with_for_update(skip_locked=True)).mappings().first()
            if row is None:
                return None
            c.execute(update(m.jobs).where(m.jobs.c.job_id == row["job_id"]).values(
                status="running", attempts=row["attempts"] + 1,
                lease_token=token, lease_until=now + lease_seconds, updated_at=now))
            return {**row, "lease_token": token, "attempts": row["attempts"] + 1}

    def _owned(self, c, job, now):
        self.assert_worker(c, job["lease_token"], now)
        query = select(m.jobs).where(m.jobs.c.job_id == job["job_id"]).with_for_update()
        row = c.execute(query).mappings().one()
        if row["status"] != "running" or row["lease_token"] != job["lease_token"] or (
                row["lease_until"] <= now):
            raise LeaseLost("Job lease expired")
        return row

    def checkpoint(self, job, value, now, *, run_id=None):
        with self.engine.begin() as c:
            self._owned(c, job, now)
            values = {"checkpoint": value, "updated_at": now}
            if run_id is not None:
                values["run_id"] = run_id
            c.execute(update(m.jobs).where(m.jobs.c.job_id == job["job_id"]).values(**values))

    def complete(self, job, now, *, revision_id=None):
        with self.engine.begin() as c:
            self._owned(c, job, now)
            c.execute(update(m.jobs).where(m.jobs.c.job_id == job["job_id"]).values(
                status="done", revision_id=revision_id, lease_token=None,
                lease_until=0, error_code=None, updated_at=now))
            if revision_id and job["kind"] == "parse":
                # An old job may finish after a newer observation; preserve current identity.
                c.execute(update(m.records).where(m.records.c.policy_key == job["policy_key"],
                    m.records.c.content_hash == content_hash(SourcePolicy.model_validate(
                        job["payload"]["source"]))).values(revision_id=revision_id))

    def complete_observation(self, job, source, raw, signature, now, recheck_seconds,
                             *, raw_path=None):
        with self.engine.begin() as c:
            self._owned(c, job, now)
            result = self.observe_source(source, raw, signature, now, recheck_seconds,
                                         raw_path=raw_path, connection=c)
            c.execute(update(m.jobs).where(m.jobs.c.job_id == job["job_id"]).values(
                status="done", lease_token=None, lease_until=0, error_code=None, updated_at=now))
            return result

    def finish_worker(self, token, report, now):
        with self.engine.begin() as c:
            self.assert_worker(c, token, now)
            self._set_state(c, "last_tick", report)
            c.execute(update(m.state).where(m.state.c.state_key == "worker",
                m.state.c.lease_token == token).values(lease_token=None, lease_until=0))

    def defer(self, job, now, delay, error_code, *, exhausted=False, max_attempts=3):
        with self.engine.begin() as c:
            self._owned(c, job, now)
            dead = not exhausted and job["attempts"] >= max_attempts
            c.execute(update(m.jobs).where(m.jobs.c.job_id == job["job_id"]).values(
                status="dead" if dead else "pending", next_attempt_at=now + delay,
                attempts=max(0, job["attempts"] - int(exhausted)), lease_token=None,
                lease_until=0, error_code=error_code, updated_at=now))

    def save_candidates(self, values, now):
        with self.engine.begin() as c:
            # A bounded shortlist; no inference of API absence from search absence.
            existing = c.execute(select(m.records.c.policy_key, m.records.c.source_json).where(
                m.records.c.source_json.is_not(None)).limit(1000)).mappings().all()
            for value in values:
                url = canonical_url(value["url"])
                cid = digest(url)
                matches = [r["policy_key"] for r in existing if
                    matching_title(r["source_json"]["title"]) == matching_title(value["title"])]
                old = c.execute(select(m.candidates).where(
                    m.candidates.c.candidate_id == cid).with_for_update()).mappings().first()
                if old:
                    c.execute(update(m.candidates).where(m.candidates.c.candidate_id == cid).values(
                        last_seen_at=now, candidate_json={**value, "url": url},
                        possible_matches=matches))
                else:
                    c.execute(insert(m.candidates).values(candidate_id=cid, url=url,
                        candidate_json={**value, "url": url}, status="needs_review",
                        possible_matches=matches, first_seen_at=now, last_seen_at=now))

    def list_candidates(self, limit=20):
        with self.engine.connect() as c:
            return [dict(r) for r in c.execute(select(m.candidates).order_by(
                m.candidates.c.last_seen_at.desc()).limit(limit)).mappings()]

    def changes(self, limit=20):
        with self.engine.connect() as c:
            return [dict(r) for r in c.execute(select(m.snapshots.c.snapshot_id,
                m.snapshots.c.policy_key, m.snapshots.c.previous_snapshot_id,
                m.snapshots.c.changed_fields, m.snapshots.c.observed_at).where(
                m.snapshots.c.previous_snapshot_id.is_not(None)).order_by(
                m.snapshots.c.observed_at.desc()).limit(limit)).mappings()]

    def schedule_notice_rechecks(self, now, interval, limit):
        with self.engine.begin() as c:
            due = c.execute(select(m.records).where(m.records.c.provider == "notice",
                m.records.c.source_json.is_not(None), m.records.c.next_check_at <= now).order_by(
                m.records.c.next_check_at, m.records.c.policy_key).limit(limit)).mappings().all()
            for row in due:
                source = row["source_json"]
                if not source.get("source_url"):
                    continue
                self._enqueue(c, "notice", row["policy_key"], {"url": source["source_url"],
                    "candidate": {"organization": source["organization"]}},
                    [source["source_url"], int(now // interval)], now)

    def retry_job(self, job_id, now, *, restart_failed_models=False):
        with self.engine.begin() as c:
            row = c.execute(select(m.jobs).where(
                m.jobs.c.job_id == job_id).with_for_update()).mappings().one()
            if row["status"] == "running" or row["status"] == "done":
                raise ValueError("Only pending or dead jobs can be retried")
            values = dict(status="pending", attempts=0, next_attempt_at=now, error_code=None)
            if restart_failed_models:
                if row["kind"] != "parse":
                    raise ValueError("Failed model restart requires a parsing job")
                checkpoint = row["checkpoint"]
                if checkpoint is not None:
                    if not isinstance(checkpoint, dict):
                        raise ValueError("Invalid parsing checkpoint")
                    if checkpoint.get("status") == "needs_review":
                        raise ValueError("A completed validated draft cannot restart models")
                    checkpoint = dict(checkpoint)
                    for key in ("attempts", "overview_attempts"):
                        history = checkpoint.get(key, [])
                        if not isinstance(history, list) or any(
                                not isinstance(attempt, dict) for attempt in history):
                            raise ValueError("Invalid model attempt history")
                        if key in checkpoint:
                            checkpoint[key] = [attempt for attempt in history if attempt.get(
                                "status") not in {"validation_failed", "failed", "error"}]
                    values["checkpoint"] = checkpoint
            c.execute(update(m.jobs).where(m.jobs.c.job_id == job_id).values(
                **values))

    def seed_existing(self, policy_repository, signature, now, *, limit=100,
                      adopt_legacy=False, worker_token=None):
        """Bounded, explicit indexing of existing immutable drafts, without any model call."""
        from app.modules.storage.repository import validate_draft
        docs = policy_repository.tables["condition_documents"]
        details = policy_repository.tables["policy_revision_details"]
        cursor = self.get_state("existing_index").get("cursor", "")
        ranked = select(docs.c.policy_key, docs.c.revision_id, details.c.draft_json,
            details.c.processing_json, func.row_number().over(partition_by=docs.c.policy_key,
                order_by=(docs.c.created_at.desc(), docs.c.revision_id.desc())).label("position")
            ).join(details, details.c.revision_id == docs.c.revision_id).subquery()
        query = select(ranked).where(ranked.c.position == 1,
            ranked.c.policy_key > cursor).order_by(ranked.c.policy_key).limit(limit)
        with policy_repository.engine.connect() as c:
            rows = c.execute(query).mappings().all()
        imported = reused = 0
        with self.engine.begin() as c:
            if worker_token is not None:
                self.assert_worker(c, worker_token, time.time())
            for row in rows:
                draft = validate_draft(row["draft_json"])
                source = SourcePolicy.model_validate(draft["source"])
                existing = c.execute(select(m.records).where(
                    m.records.c.policy_key == source.policy_key)).mappings().first()
                # Random UUID iteration must not replace an already observed current record.
                if existing is not None:
                    continue
                self.observe_source(source, {"indexed_source": source.model_dump()},
                    signature, now, 86400, connection=c)
                imported += 1
                processing = row["processing_json"]
                recorded = processing.get("processing_signature", processing.get("signature"))
                if recorded == signature or (adopt_legacy and recorded is None):
                    work_key = digest([
                        "parse", source.policy_key, [content_hash(source), signature]])
                    c.execute(update(m.jobs).where(m.jobs.c.work_key == work_key).values(
                        status="done", revision_id=row["revision_id"], checkpoint=draft))
                    c.execute(update(m.records).where(m.records.c.policy_key == source.policy_key
                        ).values(revision_id=row["revision_id"]))
                    reused += 1
            self._set_state(c, "existing_index", {"cursor": rows[-1]["policy_key"] if rows else
                cursor, "complete": len(rows) < limit, "last_success_at": now})
        return {"indexed": imported, "reused": reused, "scanned": len(rows),
                "complete": len(rows) < limit, "legacy_adoption": adopt_legacy}

    def queue_candidate(self, candidate_id, now):
        with self.engine.begin() as c:
            row = c.execute(select(m.candidates).where(
                m.candidates.c.candidate_id == candidate_id).with_for_update()).mappings().one()
            previous = c.execute(select(m.records.c.policy_key).where(
                m.records.c.provider == "notice", m.records.c.url_hash == digest(row["url"])
                ).order_by(m.records.c.last_seen_at.desc()).limit(1)).scalar_one_or_none()
            key = previous or "notice:" + hashlib.sha256(
                row["url"].encode()).hexdigest()[:16]
            job, _ = self._enqueue(c, "notice", key,
                {"url": row["url"], "candidate": row["candidate_json"]}, candidate_id, now)
            c.execute(update(m.candidates).where(
                m.candidates.c.candidate_id == candidate_id).values(status="queued"))
            return job["job_id"]

    def status(self, limit=20):
        with self.engine.connect() as c:
            counts = dict(c.execute(select(m.jobs.c.status, func.count()).group_by(
                m.jobs.c.status)).all())
            failures = [dict(r) for r in c.execute(select(m.jobs.c.job_id, m.jobs.c.kind,
                m.jobs.c.policy_key, m.jobs.c.status, m.jobs.c.error_code,
                m.jobs.c.attempts, m.jobs.c.next_attempt_at).where(
                or_(m.jobs.c.error_code.is_not(None), m.jobs.c.status == "dead")).order_by(
                m.jobs.c.updated_at.desc()).limit(limit)).mappings()]
            cursors = {r["state_key"]: r["payload"] for r in c.execute(select(m.state)).mappings()}
            quota = [dict(r) for r in c.execute(select(m.usage).order_by(
                m.usage.c.day.desc()).limit(30)).mappings()]
            return {"jobs": counts, "state": cursors, "usage": quota, "failures": failures}
