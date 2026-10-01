"""Local DB-backed Q&A preview. This command calls the configured LLM."""

import argparse
import json

from sqlalchemy.exc import SQLAlchemyError

from app.contracts.assistance import GuidanceProfile
from app.core.config import load_settings
from app.core.database import create_database_engine
from app.modules.assistant.public import answer_question
from app.modules.storage.public import PolicyRepository


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("revision_id")
    parser.add_argument("question")
    parser.add_argument("--region")
    parser.add_argument("--age-band")
    parser.add_argument("--include-drafts", action="store_true", help="Local review preview only")
    args = parser.parse_args()
    engine = None
    try:
        settings = load_settings()
        if not settings.db_enabled:
            raise ValueError("DB_ENABLED=true required")
        engine = create_database_engine(settings)
        result = answer_question(PolicyRepository(engine), args.revision_id, args.question,
            GuidanceProfile(region=args.region, age_band=args.age_band), settings,
            include_drafts=args.include_drafts)
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except (ValueError, OSError, RuntimeError, SQLAlchemyError) as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Check DB revision, publication status and LLM connection."}))
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
