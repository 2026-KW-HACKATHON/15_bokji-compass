"""Unit tests must never accidentally spend tokens through the policy pipeline."""

import pytest

from app.modules.assistant import public as assistant
from app.modules.llm.public import CodexRunError
from app.modules.pipeline import public as pipeline


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
def test_privacy_keys(monkeypatch):
    import base64
    import json

    # Synthetic test-only keys; production has no implicit key or plaintext fallback.
    monkeypatch.setenv(
        "AUTH_ENCRYPTION_KEYS",
        json.dumps(
            {
                "primary": base64.urlsafe_b64encode(b"e" * 32).decode(),
            }
        ),
    )
    monkeypatch.setenv("AUTH_ENCRYPTION_KEY_ID", "primary")
    monkeypatch.setenv("AUTH_LOOKUP_KEY", base64.urlsafe_b64encode(b"l" * 32).decode())
