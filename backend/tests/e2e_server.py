"""Explicit Playwright-only API with a captured mailbox. Never a deployment entrypoint."""

from fastapi import HTTPException

from app.core.config import load_settings
from app.main import create_app
from app.modules.auth import mail

settings = load_settings()
if settings.app_env != "test" or settings.db_enabled:
    raise RuntimeError(
        "The Playwright server requires APP_ENV=test and a disposable SQLite database"
    )

mailbox = {}


def capture_email(settings, email, code):
    mailbox[email] = code


mail.send_verification_code = capture_email
app = create_app(settings)


@app.get("/__test/email-code", include_in_schema=False)
def captured_code(email: str):
    if email not in mailbox:
        raise HTTPException(404)
    return {"code": mailbox[email]}
