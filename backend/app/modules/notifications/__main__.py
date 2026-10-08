"""Explicit additive migration: python -m app.modules.notifications."""

from app.core.config import load_settings
from app.modules.auth.database import create_member_engine
from app.modules.notifications.storage import initialize_notification_schema

if __name__ == "__main__":
    settings = load_settings()
    if not settings.db_enabled:
        raise SystemExit("Set DB_ENABLED=true to initialize MySQL notification tables.")
    engine = create_member_engine(settings)
    try:
        initialize_notification_schema(engine)
        print("Notification tables initialized.")
    finally:
        engine.dispose()
