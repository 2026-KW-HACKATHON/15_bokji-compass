"""Audit published schedules or explicitly preview/apply repairs for selected policies."""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import BACKEND_ROOT, load_settings
from app.core.database import create_database_engine
from app.modules.schedules.public import audit_schedules, prepare_repair, save_repair
from app.modules.storage.public import PolicyRepository


def _write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def _output_path(value):
    return (BACKEND_ROOT / Path(value)).resolve()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    audit = commands.add_parser(
        "audit", help="Read published schedules without HTTP/model calls or DB changes",
    )
    audit.add_argument("--output", help="Optional JSON report path, relative to backend")
    repair = commands.add_parser(
        "repair", help="Preview selected repairs; only --apply writes new revisions",
    )
    repair.add_argument("--policy-key", nargs="+", action="append", required=True,
                        help="Explicit policy keys; at most 10, repeatable")
    repair.add_argument(
        "--output", required=True, help="Report/attempt directory, relative to backend",
    )
    repair.add_argument(
        "--search", action="store_true", help="Search the explicitly allowed official domains",
    )
    repair.add_argument(
        "--domain", action="append", default=[], help="Allowed official domain; repeatable",
    )
    repair.add_argument(
        "--url", action="append", default=[],
        help="Explicit reference URL; requires one selected policy",
    )
    repair.add_argument(
        "--apply", action="store_true", help="Commit only resolved, validated repairs",
    )
    args = parser.parse_args(argv)
    keys = []
    if args.command == "repair":
        keys = [key for group in args.policy_key for key in group]
        if not 1 <= len(keys) <= 10:
            parser.error("repair requires 1 to 10 explicitly selected policy keys")
        if len(set(keys)) != len(keys):
            parser.error("policy keys must be unique")
        if args.url and len(keys) != 1:
            parser.error("--url requires exactly one selected policy")
        if args.search and not args.domain:
            parser.error("--search requires at least one --domain")

    engine = None
    try:
        settings = load_settings()
        if not settings.db_enabled:
            raise ValueError("Database must be configured")
        engine = create_database_engine(settings)
        repository = PolicyRepository(engine, auto_publish=False)
        entries = audit_schedules(repository)
        if args.command == "audit":
            items = [{key: item[key] for key in ("policy_key", "title", "period", "schedule")}
                     for item in entries]
            report = {"status": "audited", "count": len(items), "items": items}
            if args.output:
                output = _output_path(args.output)
                _write_report(output, report)
                print(json.dumps(
                    {"status": "audited", "count": len(items), "output": str(output)},
                    ensure_ascii=False,
                ))
            else:
                print(json.dumps(report, ensure_ascii=False, default=str))
            return 0

        selected = {item["policy_key"]: item for item in entries if item["policy_key"] in keys}
        if any(key not in selected for key in keys):
            print(json.dumps({"status": "failed", "error_type": "PolicyNotFound",
                              "message": "Every selected policy must have a published record."}))
            return 1
        output_root = _output_path(args.output) / ("run-" + uuid4().hex)
        output_root.mkdir(parents=True, exist_ok=False)
        report = {"status": "running", "apply": args.apply,
                  "created_at": datetime.now(UTC).isoformat(), "items": []}
        report_path = output_root / "report.json"
        _write_report(report_path, report)
        resolved = failed = 0
        for index, key in enumerate(keys, start=1):
            entry = selected[key]
            item = {"policy_key": key, "title": entry["title"], "original_period": entry["period"],
                    "original_revision_id": entry["record"]["revision_id"]}
            try:
                prepared = prepare_repair(
                    entry["record"], settings, output_root / f"policy-{index:02d}",
                    domains=tuple(args.domain), urls=tuple(args.url), search=args.search,
                )
                item.update(prepared)
                if prepared.get("status") == "resolved" and prepared.get("draft") is not None:
                    if args.apply:
                        item["saved"] = save_repair(repository, entry["record"], prepared["draft"])
                    resolved += 1
            except Exception as error:
                failed += 1
                item.update({
                    "status": "failed", "error_type": type(error).__name__,
                    "message": ("Check the selected source, model configuration "
                                "and current published revision."),
                })
            report["items"].append(item)
            _write_report(report_path, report)
        status = ("applied" if args.apply else "preview") if resolved == len(keys) else (
            "partial" if resolved else "failed" if failed else "unresolved")
        report.update({"status": status, "selected": len(keys), "resolved": resolved,
                       "unresolved": len(keys) - resolved - failed, "failed": failed})
        _write_report(report_path, report)
        print(json.dumps(
            {"status": status, "apply": args.apply, "selected": len(keys),
             "resolved": resolved, "failed": failed, "output": str(report_path)},
            ensure_ascii=False,
        ))
        return int(resolved != len(keys))
    except Exception as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Check MySQL, published policy keys and report paths."}))
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
