"""Explicit operator command to analyze the stored queue without app spending caps."""

import argparse
import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import load_settings  # noqa: E402
from app.core.database import create_database_engine  # noqa: E402
from app.modules.ingestion.analysis import run_analysis  # noqa: E402
from app.modules.ingestion.repository import IngestionRepository  # noqa: E402
from app.modules.server_admin.operations import safe_result  # noqa: E402
from app.modules.storage.public import PolicyRepository  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", type=UUID)
    parser.add_argument("--mode", choices=["standard", "bulk"], default="standard")
    arguments = parser.parse_args()
    settings = load_settings()
    if not settings.db_enabled:
        parser.error("MySQL must be enabled")
    engine = create_database_engine(settings)
    try:
        result = run_analysis(settings, IngestionRepository(engine),
            PolicyRepository(engine, auto_publish=settings.policy_auto_publish),
            run_id=str(arguments.run_id) if arguments.run_id else None, mode=arguments.mode)
        print(json.dumps(safe_result(result), ensure_ascii=False))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
