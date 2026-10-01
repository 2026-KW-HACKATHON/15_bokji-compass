"""Cross-platform command-line entry point for raw policy parsing."""

import argparse
import json

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT, load_settings
from app.core.database import create_database_engine
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
    args = parser.parse_args()
    try:
        if args.resume:
            if args.storage != "mysql" or args.prepare_only:
                raise ValueError("Resume requires MySQL without prepare-only")
            settings = load_settings()
            if not settings.db_enabled:
                raise ValueError("DB_ENABLED=true required")
            engine = create_database_engine(settings)
            try:
                manifest = resume_run(args.resume, settings, PolicyRepository(engine))
                output = None
            finally:
                engine.dispose()
        # Relative paths always resolve against backend, even from another cwd.
        else:
            paths = [BACKEND_ROOT / value for value in args.input]
            output, manifest = parse_raw_files(
                paths, prepare_only=args.prepare_only, storage=args.storage)
    except (ValueError, OSError, RuntimeError, SQLAlchemyError) as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Check input, DB_ENABLED and MySQL schema. "
                                     "Run python -m app.modules.storage init first."}))
        return 1
    print(json.dumps({"status": manifest["status"], "records": len(manifest["records"]),
                      "storage": args.storage, "run_id": manifest.get("run_id"),
                      "output": str(output) if output else None}, ensure_ascii=True))
    return int(manifest["status"] == "failed")


if __name__ == "__main__":
    raise SystemExit(main())
