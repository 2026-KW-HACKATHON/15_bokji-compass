"""Explicit attachment discovery and download for currently published notices."""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy import select

from app.core.config import load_settings
from app.core.database import create_database_engine
from app.modules.attachments.public import sync_notice_attachments
from app.modules.storage.catalog import published_catalog
from app.modules.storage.public import PolicyRepository


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy-key")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    settings = load_settings()
    if not settings.db_enabled:
        raise ValueError("DB_ENABLED=true is required")
    engine = create_database_engine(settings)
    try:
        catalog = published_catalog(PolicyRepository(engine))
        query = select(catalog.c.policy_key, catalog.c.source_json)
        if args.policy_key:
            query = query.where(catalog.c.policy_key == args.policy_key)
        with engine.connect() as connection:
            sources = [dict(row) for row in connection.execute(query).mappings()
                       if row["source_json"].get("organization") == "광운대학교"]
        total = {"notices": len(sources), "completed": 0, "files": 0, "stored": 0,
                 "failures": []}
        with ThreadPoolExecutor(max_workers=3) as pool:
            tasks = {pool.submit(sync_notice_attachments, row["source_json"],
                                 download=not args.metadata_only, refresh=args.refresh):
                     row["policy_key"] for row in sources}
            for future in as_completed(tasks):
                key = tasks[future]
                try:
                    result = future.result()
                    total["files"] += result["files"]
                    total["stored"] += result["stored"]
                    if result["errors"]:
                        total["failures"].append({"policy": key, "errors": result["errors"]})
                except (OSError, ValueError, RuntimeError) as error:
                    total["failures"].append({"policy": key, "error": type(error).__name__})
                total["completed"] += 1
                if total["completed"] % 10 == 0:
                    print(json.dumps({key: total[key] for key in
                        ("completed", "notices", "files", "stored")}), flush=True)
        print(json.dumps(total, ensure_ascii=True), flush=True)
        return 0 if total["notices"] and not total["failures"] else 1
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
