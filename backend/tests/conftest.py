"""Unit tests must never accidentally spend tokens through the policy pipeline."""

import pytest

from app.modules.assistant import public as assistant
from app.modules.auth import mail
from app.modules.llm.public import CodexRunError
from app.modules.pipeline import public as pipeline
from tests.email_helpers import mailbox


@pytest.fixture(autouse=True)
def offline_signup_email(monkeypatch):
    mailbox.clear()
    monkeypatch.setattr(
        mail, "send_verification_code", lambda settings, email, code: mailbox.update({email: code})
    )


@pytest.fixture(autouse=True)
def offline_pipeline_models(monkeypatch):
    def unavailable(*args, **kwargs):
        raise CodexRunError("offline_test: provide an explicit model stub")

    # Tests can override these with their own deterministic responses. LLM transport
    # tests call llm.public directly and replace the subprocess transport themselves.
    monkeypatch.setattr(pipeline, "extract_policy", unavailable)
    monkeypatch.setattr(pipeline, "extract_policy_overview", unavailable)
    monkeypatch.setattr(assistant, "answer_policy_question", unavailable)


@pytest.fixture(autouse=True)
def no_member_encryption_keys(monkeypatch):
    # Normal logins must work without any member encryption/HMAC secrets.
    for key in ("AUTH_ENCRYPTION_KEYS", "AUTH_ENCRYPTION_KEY_ID", "AUTH_LOOKUP_KEY"):
        monkeypatch.delenv(key, raising=False)
