"""Explicit AI-only queue drain. No public API calls or application spending caps."""

import time
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
from uuid import uuid4

from sqlalchemy.exc import SQLAlchemyError

from app.contracts.parsing import SourcePolicy
from app.modules.ingestion.repository import LeaseLost
from app.modules.llm.public import CodexRunError, batch_input_chars
from app.modules.pipeline.batching import parse_policy_batch, requests_for
from app.modules.pipeline.budget import BudgetExhausted, WorkBudget
from app.modules.pipeline.public import processing_signature


def analysis_settings(settings, mode="standard"):
    if mode not in {"standard", "bulk"}:
        raise ValueError("Unknown analysis mode")
    overrides = {
        "ingestion_ai_batch_size": max(4, settings.ingestion_ai_batch_size),
        "ingestion_discovery_enabled": False,
    }
    if mode == "bulk":
        overrides.update(ingestion_ai_batch_size=16, ingestion_ai_batch_input_chars=100000,
                         parsing_max_input_chars=max(100000, settings.parsing_max_input_chars),
                         codex_timeout_seconds=max(900, settings.codex_timeout_seconds))
    return type(settings).model_validate({**settings.model_dump(), **overrides})


class AnalysisBudget(WorkBudget):
    def __init__(self, settings, store, token, stop, notify):
        self.settings, self.store, self.token = settings, store, token
        self.stop, self.notify = stop, notify
        self.lease_seconds = settings.codex_timeout_seconds + 120
        super().__init__(time.monotonic() + self.lease_seconds)

    def check(self):
        if self.stop.is_set() or self.store.get_state(
                "analysis_stop:" + self.token).get("requested"):
            raise BudgetExhausted("cancelled")
        self.store.renew_worker(self.token, time.time(), self.lease_seconds, renew_jobs=True)
        self.deadline = time.monotonic() + self.lease_seconds

    def before_model(self, settings):
        self.check()
        self.store.reserve_call("model", time.time(), None)
        self.model_calls += 1
        self.notify()
        return settings

    def record(self, metadata):
        super().record(metadata)
        self.notify()


def run_analysis(settings, store, policies, *, stop=None, progress=None, run_id=None,
                 batch_parser=None, mode="standard"):
    """Drain parse jobs, persist each result, and pause on CLI/auth/connection failures."""
    settings = analysis_settings(settings, mode)
    stop = stop if stop is not None else Event()
    parser = batch_parser or parse_policy_batch
    run_id = run_id or str(uuid4())
    store.check_schema()
    lease_seconds = settings.codex_timeout_seconds + 120
    if not store.acquire_worker(run_id, time.time(), lease_seconds):
        return {"status": "busy", "reason": "another_worker"}
    started = time.time()
    signature = processing_signature(settings)
    report = {"status": "running", "phase": "analyze", "unlimited": True,
              "http_calls": 0, "jobs_completed": 0, "failed_jobs": 0,
              "jobs_remaining": store.pending_count(("parse",)), "errors": [],
              "batch_calls": 0, "model": settings.codex_model, "analysis_mode": mode,
              "batch_size": settings.ingestion_ai_batch_size,
              "batch_input_chars": settings.ingestion_ai_batch_input_chars}

    def notify():
        report.update(model_calls=budget.model_calls, tokens=budget.tokens,
            batch_calls=budget.model_calls,
            input_tokens=budget.input_tokens, cached_input_tokens=budget.cached_input_tokens,
            output_tokens=budget.output_tokens, reasoning_tokens=budget.reasoning_tokens,
            jobs_remaining=store.pending_count(("parse",)),
            elapsed_seconds=round(time.time() - started, 3))
        store.set_state("analysis_run", {"id": run_id, "action": "analyze-all",
            "analysis_mode": mode,
            "status": "running" if report["status"] == "running" else "finished",
            "started_at": started, "finished_at": None if report["status"] == "running"
            else time.time(), "result": dict(report)}, worker_token=run_id)
        if progress:
            progress(dict(report))

    budget = AnalysisBudget(settings, store, run_id, stop, notify)
    jobs, finished = [], set()
    try:
        notify()
        while True:
            budget.check()
            jobs, sources, checkpoints, finished = [], [], {}, set()
            while len(jobs) < settings.ingestion_ai_batch_size:
                budget.check()
                job = store.claim(run_id, time.time(), lease_seconds, kinds=("parse",),
                                  max_attempts=settings.ingestion_max_attempts)
                if job is None:
                    break
                if job["payload"]["signature"] != signature:
                    store.requeue_version(job, signature, time.time())
                    continue
                source = SourcePolicy.model_validate(job["payload"]["source"])
                proposed = {**checkpoints, source.policy_key: job["checkpoint"]}
                size = batch_input_chars(requests_for(sources + [source], proposed))
                limit = min(settings.parsing_max_input_chars,
                    settings.ingestion_ai_batch_input_chars if jobs else 100000)
                if source.policy_key in checkpoints or size > limit:
                    if not jobs:
                        store.defer(job, time.time(), 86400, "input_too_long", max_attempts=1)
                        report["errors"].append({"job_id": job["job_id"], "code": "input_too_long"})
                        report["failed_jobs"] += 1
                        continue
                    store.defer(job, time.time(), 0, "batch_input_limit", exhausted=True)
                    break
                jobs.append(job)
                sources.append(source)
                checkpoints = proposed
            if not jobs:
                if not store.pending_count(("parse",)):
                    report.update(status="completed", phase="complete")
                    break
                due = store.next_pending_at(("parse",))
                report["waiting_until"] = due
                notify()
                stop.wait(min(1, max(0.1, (due or time.time()) - time.time())))
                continue
            report.pop("waiting_until", None)
            by_key = {job["policy_key"]: job for job in jobs}
            single = len(jobs) == 1
            call_settings = settings.model_copy(update={"ingestion_ai_batch_input_chars":
                min(settings.parsing_max_input_chars, 100000)}) if single else settings
            with TemporaryDirectory(prefix="bokji-analysis-") as work:
                for key, draft in parser(sources, call_settings, Path(work), budget=budget,
                        checkpoints=checkpoints, stop_on_transport_error=True,
                        save_checkpoint=lambda key, value: store.checkpoint(
                            by_key[key], value, time.time())):
                    job = by_key[key]
                    if draft["status"] != "needs_review":
                        store.defer(job, time.time(), 86400, "extraction_failed", max_attempts=1)
                        report["errors"].append({"job_id": job["job_id"],
                                                 "code": "extraction_failed"})
                        report["failed_jobs"] += 1
                    else:
                        ingestion_id = job["run_id"]
                        if not ingestion_id:
                            ingestion_id = policies.start_run([
                                SourcePolicy.model_validate(job["payload"]["source"])],
                                {"origin": "ai_only", "signature": signature})
                            store.checkpoint(job, draft, time.time(), run_id=ingestion_id)
                        result = policies.save_result(ingestion_id, draft)
                        policies.finish_run(ingestion_id)
                        store.complete(job, time.time(), revision_id=result["revision_id"])
                        report["jobs_completed"] += 1
                    finished.add(key)
                    notify()
    except BudgetExhausted:
        for job in jobs:
            if job["policy_key"] not in finished:
                store.defer(job, time.time(), 0, "cancelled", exhausted=True)
        report.update(status="cancelled", reason="cancelled")
    except (CodexRunError, OSError):
        for job in jobs:
            if job["policy_key"] not in finished:
                store.defer(job, time.time(), 0, "codex_unavailable", exhausted=True)
        report.update(status="paused", reason="codex_unavailable")
    except (SQLAlchemyError, LeaseLost):
        report.update(status="failed", reason="database_or_lease_unavailable")
        raise
    except (ValueError, RuntimeError):
        for job in jobs:
            if job["policy_key"] not in finished:
                store.defer(job, time.time(), 60, "analysis_failed", exhausted=True)
        report.update(status="paused", reason="analysis_failed")
    finally:
        try:
            notify()
            store.finish_worker(run_id, report, time.time())
        except (SQLAlchemyError, LeaseLost):
            if report["status"] != "failed":
                raise
        finally:
            store.release_worker(run_id)
    return report
