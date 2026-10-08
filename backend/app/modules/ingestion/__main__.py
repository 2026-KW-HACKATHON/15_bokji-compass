"""Explicit server operations. A plain tick never connects or collects."""

import argparse
import json
import time
from uuid import uuid4

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import load_settings
from app.core.database import create_database_engine
from app.modules.ingestion.profiles import PROFILES, apply_profile
from app.modules.ingestion.public import run_tick
from app.modules.ingestion.repository import IngestionRepository
from app.modules.pipeline.public import processing_signature
from app.modules.storage.public import PolicyRepository


def main(argv=None):
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)
    tick = commands.add_parser("tick")
    tick.add_argument("--live", action="store_true", help="Allow real HTTP and Codex calls")
    tick.add_argument("--profile", choices=tuple(PROFILES),
                      help="Apply initial bulk or continuous collection budgets")
    for name in ("page-size", "max-pages", "max-jobs", "max-seconds", "max-http-calls",
                 "max-model-calls", "max-tokens"):
        tick.add_argument("--" + name, type=int)
    commands.add_parser("status")
    doctor = commands.add_parser("doctor")
    doctor.add_argument("--check-db", action="store_true")
    for name in ("candidates", "changes"):
        commands.add_parser(name).add_argument("--limit", type=int, default=20)
    queue = commands.add_parser("queue-candidate")
    queue.add_argument("candidate_id")
    retry = commands.add_parser("retry-job")
    retry.add_argument("job_id")
    retry.add_argument("--restart-failed-models", action="store_true",
                      help="Clear failed model attempts; keep valid stages")
    seed = commands.add_parser("seed-existing")
    seed.add_argument("--limit", type=int, default=100)
    seed.add_argument("--all", action="store_true",
                      help="Repeat small commits until all are indexed")
    seed.add_argument("--adopt-legacy-results", action="store_true",
                      help="Reuse validated legacy drafts without a processing signature")
    args = cli.parse_args(argv)
    engine = None
    try:
        settings = load_settings()
        if args.command == "tick":
            if args.profile:
                settings = apply_profile(settings, args.profile)
            changes = {f"ingestion_{name}": getattr(args, name) for name in (
                "page_size", "max_pages", "max_jobs", "max_seconds", "max_http_calls",
                "max_model_calls", "max_tokens") if getattr(args, name) is not None}
            settings = type(settings).model_validate({**settings.model_dump(), **changes})
            if not args.live:
                print(json.dumps({"status": "disabled", "reason": "explicit_live_flag_required",
                    "db_configured": settings.db_enabled,
                    "page_size": settings.ingestion_page_size,
                    "max_jobs": settings.ingestion_max_jobs}, ensure_ascii=False))
                return 0
            if not settings.ingestion_enabled:
                print(json.dumps({"status": "disabled", "reason": "collection_disabled"}))
                return 0
        if args.command == "doctor" and not args.check_db:
            print(json.dumps({"status": "configuration_only", "db_enabled": settings.db_enabled,
                "gov24_key_configured": bool(settings.data_go_kr_api_key.get_secret_value()),
                "bokjiro_key_configured": bool(settings.bokjiro_api_key.get_secret_value()),
                "discovery_enabled": settings.ingestion_discovery_enabled,
                "server_verified": False}, ensure_ascii=False))
            return 0
        if hasattr(args, "limit") and not 1 <= args.limit <= 100:
            raise ValueError("Limit must be between 1 and 100")
        if not settings.db_enabled:
            raise ValueError("MySQL must be configured")
        engine = create_database_engine(settings)
        store = IngestionRepository(engine)
        store.check_schema()
        if args.command == "tick":
            result = run_tick(settings, store, PolicyRepository(
                engine, auto_publish=settings.policy_auto_publish))
        elif args.command == "doctor":
            PolicyRepository(engine)
            result = {"status": "database_ready", "external_sources_verified": False,
                      "codex_login_verified": False}
        elif args.command == "status":
            result = store.status()
        elif args.command == "candidates":
            result = {"items": store.list_candidates(args.limit)}
        elif args.command == "changes":
            result = {"items": store.changes(args.limit)}
        elif args.command == "queue-candidate":
            result = {"job_id": store.queue_candidate(args.candidate_id, time.time())}
        elif args.command == "retry-job":
            store.retry_job(args.job_id, time.time(),
                            restart_failed_models=args.restart_failed_models)
            result = {"status": "queued", "restart_failed_models": args.restart_failed_models}
        else:
            signature = processing_signature(settings)
            token = str(uuid4())
            if not store.acquire_worker(token, time.time(), settings.ingestion_max_seconds + 60):
                result = {"status": "busy", "reason": "another_worker"}
            else:
                try:
                    if args.all:
                        result = store.seed_all_existing(PolicyRepository(engine), signature,
                            limit=args.limit, adopt_legacy=args.adopt_legacy_results,
                            worker_token=token)
                    else:
                        result = store.seed_existing(PolicyRepository(engine), signature,
                            time.time(), limit=args.limit, adopt_legacy=args.adopt_legacy_results,
                            worker_token=token)
                finally:
                    store.release_worker(token)
        print(json.dumps(result, ensure_ascii=False))
        return int(result.get("status") == "failed" or bool(result.get("errors")))
    except (ValueError, OSError, RuntimeError, SQLAlchemyError) as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
            "message": "Check server settings, explicit storage init and collection status; "
                       "no database fallback was used."}))
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
