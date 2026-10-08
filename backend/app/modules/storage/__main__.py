"""Explicit schema initialization, draft import and DB inspection (no LLM calls)."""

import argparse
import json

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT, load_settings
from app.core.database import create_database_engine
from app.modules.storage.public import (
    PolicyRepository,
    auto_publish_pending,
    ensure_focus_data,
    focus_coverage,
    initialize_policy_schema,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init")
    commands.add_parser("auto-publish")
    focus = commands.add_parser("ensure-focus-data")
    focus.add_argument("--check", action="store_true", help="Read-only public coverage check")
    importer = commands.add_parser("import-drafts")
    importer.add_argument("paths", nargs="+", help="Explicit draft.json paths relative to backend")
    listing = commands.add_parser("list")
    listing.add_argument("--include-drafts", action="store_true")
    listing.add_argument("--limit", type=int, default=20)
    listing.add_argument("--offset", type=int, default=0)
    listing.add_argument("--policy-key")
    get = commands.add_parser("get")
    get.add_argument("revision_id")
    get.add_argument("--include-drafts", action="store_true")
    args = parser.parse_args()
    engine = None
    try:
        settings = load_settings()
        if not settings.db_enabled:
            raise ValueError("DB_ENABLED=true is required")
        engine = create_database_engine(settings)
        if args.command == "init":
            result = initialize_policy_schema(engine)
            result["focusData"] = ensure_focus_data(PolicyRepository(engine, auto_publish=True))
        else:
            repository = PolicyRepository(engine, auto_publish=(
                True if args.command == "ensure-focus-data" else settings.policy_auto_publish))
            if args.command == "auto-publish":
                result = auto_publish_pending(repository)
            elif args.command == "ensure-focus-data":
                result = focus_coverage(repository) if args.check else ensure_focus_data(repository)
            elif args.command == "import-drafts":
                result = []
                for path in args.paths:
                    payload = json.loads((BACKEND_ROOT / path).read_text(encoding="utf-8-sig"))
                    result.append(repository.import_draft(payload))
            elif args.command == "list":
                result = repository.list_revisions(published_only=not args.include_drafts,
                    limit=args.limit, offset=args.offset, policy_key=args.policy_key)
            else:
                result = repository.get_revision(args.revision_id,
                                                  published_only=not args.include_drafts)
                if result is None:
                    print(json.dumps({"status": "not_found"}))
                    return 1
        print(json.dumps(result, ensure_ascii=True, default=str))
        if args.command == "ensure-focus-data":
            coverage = result if args.check else result["coverage"]
            return 0 if coverage["ready"] else 1
        if args.command == "init" and not result["focusData"]["coverage"]["ready"]:
            return 1
        return 0
    except (ValueError, KeyError, OSError, RuntimeError, SQLAlchemyError) as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Check MySQL, schema initialization and input contracts. "
                                     "Existing records were preserved."}))
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
