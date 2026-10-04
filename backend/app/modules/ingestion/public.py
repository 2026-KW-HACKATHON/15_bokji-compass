"""One bounded server tick. Neither importing nor launching FastAPI calls this module."""

import ctypes
import hashlib
import shutil
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from sqlalchemy import insert, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.contracts.parsing import SourcePolicy
from app.core.config import BACKEND_ROOT
from app.modules.collectors.bokjiro_services import fetch_bokjiro_detail_page, fetch_bokjiro_page
from app.modules.collectors.data_go_kr import CollectionAPIError, CollectionError
from app.modules.collectors.gov24_services import fetch_gov24_page
from app.modules.discovery.public import discover
from app.modules.ingestion import models as m
from app.modules.ingestion.repository import LeaseLost, PageSizeMismatch
from app.modules.ingestion.web import fetch_notice
from app.modules.normalization.raw import normalize_record
from app.modules.pipeline.budget import BudgetExhausted, WorkBudget
from app.modules.pipeline.public import parse_policy, processing_signature
from app.modules.storage.application_dates import application_period


class CallBudgetExhausted(BudgetExhausted):
    pass


class HttpBudget:
    def __init__(self, settings, store, deadline):
        self.settings, self.store, self.deadline = settings, store, deadline
        self.calls = 0
        self.last_request = 0.0

    def before(self, provider):
        delay = max(0, self.last_request + self.settings.ingestion_http_interval_seconds -
                    time.monotonic())
        if time.monotonic() + delay >= self.deadline:
            raise CallBudgetExhausted("deadline")
        if self.calls >= self.settings.ingestion_max_http_calls:
            raise CallBudgetExhausted("http_calls")
        blocked = self.store.get_state(f"blocked:{provider}")
        if blocked.get("until", 0) > time.time():
            raise CallBudgetExhausted(f"provider_blocked_{provider}")
        limit = getattr(self.settings, f"ingestion_daily_{provider}_calls")
        if not self.store.reserve_call(provider, time.time(), limit):
            raise CallBudgetExhausted(f"daily_calls_{provider}")
        if delay:
            time.sleep(delay)
        self.calls += 1
        self.last_request = time.monotonic()
        return {"timeout": min(15, self.deadline - time.monotonic()),
                "deadline": self.deadline,
                "max_response_bytes": self.settings.ingestion_max_response_bytes}


class ServerModelBudget(WorkBudget):
    def __init__(self, settings, store, deadline):
        super().__init__(deadline, settings.ingestion_max_model_calls,
                         settings.ingestion_max_tokens)
        self.settings, self.store = settings, store

    def before_model(self, settings):
        value = super().before_model(settings)
        if not self.store.reserve_call("model", time.time(),
                                       self.settings.ingestion_daily_model_calls):
            self.model_calls -= 1
            raise BudgetExhausted("daily_model_calls")
        return value


def available_memory_mb():
    if sys.platform != "win32":
        return None
    class MemoryStatus(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong) for name in (
                "total_physical", "available_physical", "total_page", "available_page",
                "total_virtual", "available_virtual", "available_extended")]
    status = MemoryStatus()
    status.length = ctypes.sizeof(status)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None
    return status.available_physical // (1024 * 1024)


def save_raw(raw: bytes, source_id: str, root: Path):
    """Content-addressed atomic writes; provider IDs never become filesystem paths."""
    identity = hashlib.sha256(raw).hexdigest()
    directory = root / source_id
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{identity}.bin"
    if not target.exists():
        temporary = directory / f"{identity}-{uuid4().hex}.tmp"
        temporary.write_bytes(raw)
        temporary.replace(target)
    return str(target.relative_to(BACKEND_ROOT)) if target.is_relative_to(BACKEND_ROOT) else None


def _failure_delay(error, attempts):
    if isinstance(error, CollectionError):
        if not error.retryable:
            return 86400
        return min(86400, max(error.retry_after_seconds or 0, 30 * 2 ** min(attempts, 10)))
    return min(3600, 30 * 2 ** min(attempts, 10))


def _block_provider(store, provider, error):
    permanent_api_failure = isinstance(error, CollectionAPIError) and (
        not error.retryable or error.code in {"bokjiro_api_10", "bokjiro_api_22"})
    if provider in {"gov24", "bokjiro"} and isinstance(error, CollectionError) and (
            error.status_code in {401, 403} or permanent_api_failure):
        # Fail closed on unknown account allowance; no polling loop against a rejected key.
        store.set_state(f"blocked:{provider}", {"until": time.time() + 86400,
                                               "reason": error.code})


def _conditions(store, c, row, now):
    external_id = row.get("서비스ID")
    if not isinstance(external_id, str) or not external_id.strip():
        raise ValueError("Conditions require service ID")
    key = "gov24:" + external_id.strip()
    old = c.execute(select(m.records).where(m.records.c.policy_key == key)).mappings().first()
    if old is None:
        c.execute(insert(m.records).values(policy_key=key, provider="gov24",
            external_id=external_id.strip(), conditions_json=row, last_seen_at=now,
            next_check_at=0))
    else:
        c.execute(update(m.records).where(m.records.c.policy_key == key).values(
            conditions_json=row, last_seen_at=now))
    # JA code semantics remain unknown; these rows are evidence for review, not eligibility rules.


def run_tick(settings, store, policy_repository, *, adapters=None, parser=None,
             discovery_fn=None, notice_fetcher=None, raw_root=None):
    """Require an explicit caller; all dependencies can be replaced in offline tests."""
    if not settings.ingestion_enabled:
        return {"status": "disabled", "reason": "collection_disabled"}
    store.check_schema()
    signature = processing_signature(settings)
    started = time.monotonic()
    token = str(uuid4())
    seconds = settings.ingestion_max_seconds
    if not store.acquire_worker(token, time.time(), seconds + 60):
        return {"status": "busy", "reason": "another_worker"}
    report = {"status": "completed", "pages": 0, "jobs_completed": 0,
              "new": 0, "changed": 0, "unchanged": 0, "errors": []}
    budget = ServerModelBudget(settings, store, started + seconds)
    http = HttpBudget(settings, store, budget.deadline)
    adapters = adapters or {"gov24": fetch_gov24_page, "bokjiro": fetch_bokjiro_page,
                           "bokjiro_detail": fetch_bokjiro_detail_page}
    parser = parser or parse_policy
    discovery_fn, notice_fetcher = discovery_fn or discover, notice_fetcher or fetch_notice
    raw_root = raw_root or BACKEND_ROOT / "data/collection/raw"
    handled = 0

    def count(result):
        for name in ("new", "changed", "unchanged"):
            report[name] += int(result[name])

    def process_jobs():
        nonlocal handled
        while handled < settings.ingestion_max_jobs:
            budget.check()
            job = store.claim(token, time.time(), max(1, budget.deadline - time.monotonic() + 30),
                              max_attempts=settings.ingestion_max_attempts)
            if job is None:
                return
            handled += 1
            try:
                if job["kind"] == "detail":
                    options = http.before("bokjiro")
                    detail_page = adapters["bokjiro_detail"](job["payload"]["external_id"],
                        api_key=settings.bokjiro_api_key.get_secret_value(), **options)
                    row = detail_page.rows[0]
                    if row.get("servId") != job["payload"]["external_id"]:
                        raise ValueError("Detail identity mismatch")
                    source = normalize_record(row)
                    raw_path = save_raw(detail_page.raw, "bokjiro-detail", raw_root)
                    count(store.complete_observation(job, source, row, signature, time.time(),
                        settings.ingestion_recheck_seconds, raw_path=raw_path))
                elif job["kind"] == "notice":
                    row, raw = notice_fetcher(job["payload"]["url"],
                                             settings.ingestion_discovery_domains, http)
                    row["document_id"] = job["policy_key"].split(":", 1)[1]
                    period = application_period({"text": row["text"]})
                    if period:
                        row["application_period"] = period
                    proposed = job["payload"]["candidate"]["organization"]
                    row["organization"] = proposed if proposed in row["text"] else ""
                    source = normalize_record(row)
                    source.fields["attachment_status"] = row["attachment_status"]
                    source.fields["attachment_urls"] = row["attachments"]
                    raw_path = save_raw(raw, "notice", raw_root)
                    count(store.complete_observation(job, source, row, signature, time.time(),
                        settings.ingestion_recheck_seconds, raw_path=raw_path))
                elif job["kind"] == "parse":
                    source = SourcePolicy.model_validate(job["payload"]["source"])
                    if job["payload"]["signature"] != signature:
                        # Preserve the old queue; explicit reprocessing can enqueue a new version.
                        store.defer(job, time.time(), 86400, "processing_version_changed",
                                    max_attempts=1)
                        continue
                    def checkpoint(value):
                        store.checkpoint(job, value, time.time())
                    draft = job["checkpoint"]
                    if not draft or draft.get("status") != "needs_review":
                        with TemporaryDirectory(prefix="bokji-collection-") as work:
                            draft = parser(source, settings, Path(work), budget=budget,
                                checkpoint=draft, save_checkpoint=checkpoint)
                        checkpoint(draft)
                    if draft["status"] != "needs_review":
                        raise RuntimeError("extraction_failed")
                    run_id = job["run_id"]
                    if not run_id:
                        run_id = policy_repository.start_run([source], {
                            "origin": "server_collection", "signature": signature})
                        store.checkpoint(job, draft, time.time(), run_id=run_id)
                    result = policy_repository.save_result(run_id, draft)
                    policy_repository.finish_run(run_id)
                    store.complete(job, time.time(), revision_id=result["revision_id"])
                else:
                    raise ValueError("Unknown collection job")
                report["jobs_completed"] += 1
            except BudgetExhausted as error:
                store.defer(job, time.time(), 600, str(error), exhausted=True)
                if str(error).startswith(("daily_calls_", "provider_blocked_")):
                    report["errors"].append({"job_id": job["job_id"], "code": str(error)})
                    continue
                report["status"] = "budget_reached"
                report["reason"] = str(error)
                return
            except LeaseLost:
                raise
            except (ValueError, OSError, RuntimeError) as error:
                provider = job["payload"].get("provider", "notice" if job["kind"] == "notice"
                                              else "model")
                _block_provider(store, provider, error)
                code = error.code if isinstance(
                    error, (CollectionError, PageSizeMismatch)) else type(error).__name__
                store.defer(job, time.time(), _failure_delay(error, job["attempts"]), code,
                            max_attempts=settings.ingestion_max_attempts)
                report["errors"].append({"job_id": job["job_id"], "code": code})

    try:
        memory = available_memory_mb()
        if memory is not None and memory < settings.ingestion_min_available_memory_mb:
            report.update(status="paused", reason="low_available_memory")
            return report
        existing_parent = raw_root
        while not existing_parent.exists():
            existing_parent = existing_parent.parent
        if shutil.disk_usage(existing_parent).free // (1024 * 1024) < (
                settings.ingestion_min_free_disk_mb):
            report.update(status="paused", reason="low_free_disk")
            return report
        room = max(0, settings.ingestion_queue_limit - store.pending_count())
        store.schedule_notice_rechecks(time.time(), settings.ingestion_recheck_seconds,
                                      min(room, settings.ingestion_max_jobs))
        process_jobs()
        scans = []
        if settings.data_go_kr_api_key.get_secret_value():
            scans.extend(("gov24", endpoint) for endpoint in (
                "serviceDetail", "serviceList", "supportConditions"))
        if settings.bokjiro_api_key.get_secret_value():
            scans.append(("bokjiro", "list"))
        # Rotate partitions so small page budgets do not starve one supplier/endpoint.
        offset = store.get_state("scan_turn").get("offset", 0)
        if scans:
            offset %= len(scans)
            scans = scans[offset:] + scans[:offset]
            store.set_state("scan_turn", {"offset": offset + 1})
        for provider, endpoint in scans:
            if report["status"] == "budget_reached":
                break
            if report["pages"] >= settings.ingestion_max_pages or (
                    store.pending_count() + settings.ingestion_page_size >
                    settings.ingestion_queue_limit):
                break
            budget.check()
            scan_key = f"scan:{provider}:{endpoint}"
            cursor = store.prepare_scan(scan_key, settings.ingestion_page_size,
                                        time.time(), worker_token=token)
            if cursor.get("next_due_at", 0) > time.time():
                continue
            try:
                options = http.before(provider)
                kwargs = {"page": cursor.get("page", 1), "per_page": settings.ingestion_page_size,
                          "api_key": getattr(settings, "data_go_kr_api_key" if provider == "gov24"
                                             else "bokjiro_api_key").get_secret_value(), **options}
                if provider == "gov24":
                    kwargs["endpoint"] = endpoint
                page = adapters[provider](**kwargs)
                raw_path = save_raw(page.raw, f"{provider}-{endpoint}", raw_root)
                def handle(c, rows, provider=provider, endpoint=endpoint, raw_path=raw_path):
                    outcomes = []
                    for row in rows:
                        if endpoint == "serviceDetail":
                            source = normalize_record(row)
                            outcomes.append(store.observe_source(
                                source, row, signature, time.time(),
                                settings.ingestion_recheck_seconds, raw_path=raw_path,
                                connection=c))
                        elif endpoint == "supportConditions":
                            _conditions(store, c, row, time.time())
                        else:
                            store.observe_listing(c, provider, row, time.time(),
                                                  settings.ingestion_recheck_seconds)
                    return outcomes
                outcomes = store.save_page(scan_key, page, time.time(),
                    settings.ingestion_scan_interval_seconds, handle, worker_token=token)
                for outcome in outcomes:
                    count(outcome)
                report["pages"] += 1
            except BudgetExhausted as error:
                if str(error).startswith(("daily_calls_", "provider_blocked_")):
                    report["errors"].append({"source": scan_key, "code": str(error)})
                    continue
                report.update(status="budget_reached", reason=str(error))
            except (ValueError, OSError, RuntimeError) as error:
                if isinstance(error, LeaseLost):
                    raise
                _block_provider(store, provider, error)
                code = error.code if isinstance(
                    error, (CollectionError, PageSizeMismatch)) else type(error).__name__
                store.set_state(scan_key, {**cursor, "next_due_at": time.time() +
                    _failure_delay(error, cursor.get("failures", 0)),
                    "failures": cursor.get("failures", 0) + 1, "error_code": code})
                report["errors"].append({"source": scan_key, "code": code})
        if report["status"] != "budget_reached":
            process_jobs()
        due = store.get_state("discovery")
        if settings.ingestion_discovery_enabled and report["status"] != "budget_reached" and (
                store.pending_count() < settings.ingestion_queue_limit) and (
                due.get("next_due_at", 0) <= time.time()):
            try:
                limited = budget.before_model(settings)
                values, meta = discovery_fn(limited, domains=settings.ingestion_discovery_domains,
                    query=settings.ingestion_discovery_query,
                    timeout=min(300, limited.codex_timeout_seconds),
                    max_candidates=10)
                budget.record(meta)
                store.save_candidates(values, time.time())
                store.set_state("discovery", {"next_due_at": time.time() + 86400,
                    "last_success_at": time.time(), "candidate_count": len(values)})
                report["discovery_candidates"] = len(values)
            except BudgetExhausted as error:
                report.update(status="budget_reached", reason=str(error))
            except (ValueError, OSError, RuntimeError):
                store.set_state("discovery", {"next_due_at": time.time() + 3600,
                                              "error_code": "discovery_failed"})
                report["errors"].append({"source": "discovery", "code": "discovery_failed"})
    except BudgetExhausted as error:
        report.update(status="budget_reached", reason=str(error))
    except (SQLAlchemyError, LeaseLost):
        report.update(status="failed", reason="database_or_lease_unavailable")
        raise
    finally:
        report.update(http_calls=http.calls, model_calls=budget.model_calls, tokens=budget.tokens,
                      elapsed_seconds=round(time.monotonic() - started, 3))
        try:
            store.finish_worker(token, report, time.time())
        finally:
            store.release_worker(token)
    return report
