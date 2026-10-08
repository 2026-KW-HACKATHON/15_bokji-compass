"""Initialize or continuously evaluate consented welfare monitoring profiles."""

import argparse
import time

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import load_settings
from app.core.database import create_database_engine
from app.modules.auth.__main__ import member_engine
from app.modules.auth.service import AuthService
from app.modules.monitoring.schema import initialize_monitoring_schema
from app.modules.monitoring.storage import MonitoringStore
from app.modules.monitoring.worker import run_once
from app.modules.storage.public import PolicyRepository


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--init", action="store_true", help="Create monitoring tables only")
    actions.add_argument("--once", action="store_true", help="Evaluate all enabled accounts once")
    actions.add_argument("--watch", action="store_true", help="Evaluate repeatedly until stopped")
    parser.add_argument("--interval", type=int, default=300, help="Watch interval seconds (>=30)")
    parser.add_argument("--batch-size", type=int, default=100, help="Account page size (1..1000)")
    args = parser.parse_args(argv)
    if args.interval < 30 or not 1 <= args.batch_size <= 1000:
        parser.error("interval must be >=30 and batch-size must be between 1 and 1000")
    settings = load_settings()
    if not args.init and not settings.db_enabled:
        raise SystemExit("Monitoring requires DB_ENABLED=true and the published MySQL catalog.")
    if not settings.auth_enabled and not args.init:
        raise SystemExit("Monitoring requires AUTH_ENABLED=true.")
    engine = member_engine(settings)
    policy_engine = None
    try:
        if args.init:
            initialize_monitoring_schema(engine)
            print("Monitoring profile, application and inbox tables initialized.")
            return
        policy_engine = create_database_engine(settings)
        repository = PolicyRepository(policy_engine, auto_publish=settings.policy_auto_publish)
        store = MonitoringStore(engine)
        service = AuthService(engine, settings)
        while True:
            try:
                result = run_once(repository, store, service, batch_size=args.batch_size)
                print(
                    "Monitoring evaluation: "
                    + ", ".join(f"{key}={value}" for key, value in result.items()),
                    flush=True,
                )
            except SQLAlchemyError as exc:
                print("Monitoring database unavailable: " + type(exc).__name__, flush=True)
                if not args.watch:
                    raise SystemExit(1) from None
            if not args.watch:
                if result["failed"]:
                    raise SystemExit(1)
                return
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Monitoring worker stopped.")
    except SQLAlchemyError as exc:
        raise SystemExit("Monitoring storage setup failed: " + type(exc).__name__) from None
    finally:
        engine.dispose()
        if policy_engine is not None:
            policy_engine.dispose()


if __name__ == "__main__":
    main()
