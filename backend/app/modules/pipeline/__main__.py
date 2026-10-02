"""Cross-platform command-line entry point for raw policy parsing."""

import argparse
import json
import time

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT, load_settings
from app.core.database import create_database_engine
from app.modules.pipeline.budget import WorkBudget
from app.modules.pipeline.public import parse_raw_files, resume_run
from app.modules.storage.public import PolicyRepository


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--input", nargs="+", help="JSON/XML file paths")
    inputs.add_argument("--resume", help="Resume pending/failed items in a stored MySQL run")
    parser.add_argument("--prepare-only", action="store_true", help="No LLM/network call")
    parser.add_argument("--storage", choices=("mysql", "json"), default="mysql",
                        help="MySQL is authoritative; json is an explicit offline export")
    parser.add_argument("--max-items", type=int, help="Bound MySQL pending items per invocation")
    parser.add_argument("--max-seconds", type=int, help="Overall model work deadline, at least 10")
    parser.add_argument("--max-model-calls", type=int, default=4,
                        help="Model attempts, including overview and fallback, per bounded run")
    parser.add_argument("--max-tokens", type=int, default=100000,
                        help="Reported token budget; stops subsequent calls (not a hard cap)")
    args = parser.parse_args()
    if args.max_items is not None and not 1 <= args.max_items <= 10000:
        parser.error("--max-items must be between 1 and 10000")
    if args.max_seconds is not None and args.max_seconds < 10:
        parser.error("--max-seconds must be at least 10")
    if args.max_model_calls < 0 or args.max_tokens < 0:
        parser.error("Model budgets must be nonnegative")
    if args.max_seconds is None and (args.max_model_calls != 4 or args.max_tokens != 100000):
        parser.error("--max-model-calls and --max-tokens require --max-seconds")
    budget = (WorkBudget(time.monotonic() + args.max_seconds,
                         max_model_calls=args.max_model_calls, max_tokens=args.max_tokens)
              if args.max_seconds is not None else None)
    try:
        if args.resume:
            if args.storage != "mysql" or args.prepare_only:
                raise ValueError("Resume requires MySQL without prepare-only")
            settings = load_settings()
            if not settings.db_enabled:
                raise ValueError("DB_ENABLED=true required")
            engine = create_database_engine(settings)
            try:
                manifest = resume_run(args.resume, settings, PolicyRepository(
                    engine, auto_publish=settings.policy_auto_publish),
                                      max_items=args.max_items, budget=budget)
                output = None
            finally:
                engine.dispose()
        # Relative paths always resolve against backend, even from another cwd.
        else:
            paths = [BACKEND_ROOT / value for value in args.input]
            output, manifest = parse_raw_files(
                paths, prepare_only=args.prepare_only, storage=args.storage,
                max_items=args.max_items, budget=budget)
    except (ValueError, OSError, RuntimeError, SQLAlchemyError) as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Check input, DB_ENABLED and MySQL schema. "
                                     "Run python -m app.modules.storage init first."}))
        return 1
    print(json.dumps({"status": manifest["status"], "records": len(manifest["records"]),
                      "storage": args.storage, "run_id": manifest.get("run_id"),
                      "budget_exhausted": manifest.get("budget_exhausted"),
                      "output": str(output) if output else None}, ensure_ascii=True))
    return int(manifest["status"] == "failed")


if __name__ == "__main__":
    raise SystemExit(main())
