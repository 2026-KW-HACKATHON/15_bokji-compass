"""Unit tests must never accidentally spend tokens through the policy pipeline."""

import pytest

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
