from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from app.contracts.assistance import GuidanceProfile, PolicyAnswer
from app.core.config import Settings
from app.modules.assistant import public as assistant
from app.modules.normalization.raw import normalize_record


def record():
    source = normalize_record({"document_id": "test-guidance", "title": "테스트 공고",
                               "text": "신청자 만 19세 이상", "source_url": "https://example.org/1"})
    return {"source_json": source.model_dump(), "review_status": "draft"}


def test_assistant_reads_db_and_keeps_each_profiles_context_separate(monkeypatch):
    repository = Mock()
    repository.get_revision.return_value = record()
    received = []

    def answer(source, question, profile, settings, output):
        received.append(profile.model_dump())
        return PolicyAnswer(status="grounded", answer="원문에는 만 19세 이상이라고 나와요.",
                            citations=[{"source_field": "text", "quote": "만 19세 이상"}],
                            follow_up_questions=[]), {"model": "test-model"}

    monkeypatch.setattr(assistant, "answer_policy_question", answer)
    for region in ("서울", "경기"):
        result = assistant.answer_question(repository, "revision", "지원 대상은?",
            GuidanceProfile(region=region), Settings(_env_file=None), include_drafts=True)
        assert result["preview"] and not result["eligibility_decided"]
        assert result["source_url"] == "https://example.org/1"
    assert [r["region"] for r in received] == ["서울", "경기"]
    repository.get_revision.assert_called_with("revision", published_only=False)


def test_unpublished_default_and_bad_evidence_fail_before_serving_answer(monkeypatch):
    repository = Mock()
    repository.get_revision.return_value = None
    generator = Mock()
    monkeypatch.setattr(assistant, "answer_policy_question", generator)
    with pytest.raises(ValueError, match="unavailable"):
        assistant.answer_question(repository, "revision", "대상?", GuidanceProfile(),
                                   Settings(_env_file=None))
    repository.get_revision.assert_called_with("revision", published_only=True)
    generator.assert_not_called()
    repository.get_revision.return_value = record()
    generator.return_value = (PolicyAnswer(status="grounded", answer="잘못된 답변",
        citations=[{"source_field": "text", "quote": "없는 근거"}], follow_up_questions=[]),
        {"model": "test-model"})
    with pytest.raises(ValueError, match="absent"):
        assistant.answer_question(repository, "revision", "대상?", GuidanceProfile(),
                                   Settings(_env_file=None), include_drafts=True)


def test_guidance_rejects_extra_private_fields_and_grounded_answer_without_evidence():
    with pytest.raises(ValidationError):
        GuidanceProfile.model_validate({"region": "서울", "password": "private"})
    with pytest.raises(ValidationError):
        PolicyAnswer(status="grounded", answer="주장", citations=[], follow_up_questions=[])
