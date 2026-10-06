"""Bounded model work and stage recovery using synthetic responses only."""

from copy import deepcopy
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from app.contracts.parsing import PolicyOverview
from app.core.config import Settings
from app.modules.llm import public as llm
from app.modules.llm.public import CodexOutputError, CodexRunError
from app.modules.normalization.raw import normalize_record
from app.modules.pipeline import budget as budgets
from app.modules.pipeline import public as pipeline
from app.modules.pipeline.budget import BudgetExhausted, WorkBudget


def source():
    return normalize_record({"서비스ID": "budget-test", "서비스명": "합성 공고",
                             "지원대상": "공식 기관의 별도 심사로 결정"})


def overview():
    absent = {"status": "not_stated", "text": None, "evidence": [],
              "unresolved_reason": None}
    return PolicyOverview.model_validate({
        "title": source().title, "source_url": None, "category": None,
        "category_reason": "지원 분야 정보 없음",
        "category_evidence": [{"source_field": "title", "quote": source().title}],
        "region_conditions": absent, "gender_conditions": absent, "age_conditions": absent,
        "other_conditions": [], "benefits": absent, "unresolved": ["지원 분야 정보 없음"],
        "application_period": {"status": "not_stated", "text": None, "evidence": [],
                               "unresolved_reason": None},
        "application_method": {"status": "not_stated", "text": None, "evidence": [],
                               "unresolved_reason": None},
        "application_url": {"status": "not_stated", "text": None, "evidence": [],
                            "unresolved_reason": None},
        "contact": {"status": "not_stated", "text": None, "evidence": [],
                    "unresolved_reason": None},
        "published_date": {"status": "not_stated", "text": None, "evidence": [],
                           "unresolved_reason": None},
        "modified_date": {"status": "not_stated", "text": None, "evidence": [],
                          "unresolved_reason": None},
        "policy_requirements": [{"condition_type": "other", "information_state": "unknown",
                                  "evidence_text": "공식 기관의 별도 심사로 결정"}],
    })


@pytest.fixture
def models(monkeypatch):
    summary = Mock(return_value=(overview(), {"usage": [{"input_tokens": 20,
                                                        "output_tokens": 10}]}))
    condition = Mock(side_effect=lambda record, *args: (
        pipeline._missing_conditions(record), {"usage": [{"total_tokens": 40}]}))
    monkeypatch.setattr(pipeline, "extract_policy_overview", summary)
    monkeypatch.setattr(pipeline, "extract_policy", condition)
    return summary, condition


def budget(monkeypatch, *, seconds=300, calls=4, tokens=100000):
    monkeypatch.setattr(budgets.time, "monotonic", lambda: 100.0)
    return WorkBudget(100.0 + seconds, max_model_calls=calls, max_tokens=tokens)


def test_deadline_reserves_attempt_and_reduces_timeout(monkeypatch):
    work = budget(monkeypatch, seconds=25)
    original = Settings(_env_file=None, codex_timeout_seconds=300)
    assert work.before_model(original).codex_timeout_seconds == 25
    assert original.codex_timeout_seconds == 300 and work.model_calls == 1
    monkeypatch.setattr(budgets.time, "monotonic", lambda: 116.0)
    with pytest.raises(BudgetExhausted, match="deadline"):
        work.before_model(original)
    assert work.model_calls == 1


def test_usage_excludes_cached_input_and_stops_next_call(monkeypatch):
    work = budget(monkeypatch, tokens=30)
    work.record({"usage": [{"input_tokens": 20, "cached_input_tokens": 10,
                            "output_tokens": 10}]})
    assert work.tokens == 30
    with pytest.raises(BudgetExhausted, match="tokens"):
        work.before_model(Settings(_env_file=None))


def test_overview_checkpoint_survives_budget_and_resumes_without_repeat(
        tmp_path, monkeypatch, models):
    saved = []
    settings = Settings(_env_file=None)
    first = budget(monkeypatch, calls=1)
    with pytest.raises(BudgetExhausted, match="model_calls"):
        pipeline.parse_policy(source(), settings, tmp_path / "first", budget=first,
                              save_checkpoint=saved.append)
    assert len(saved) == 1 and saved[0]["status"] == "pending"
    assert saved[0]["overview_status"] == "validated" and first.tokens == 30
    assert models[0].call_count == 1 and models[1].call_count == 0
    second = budget(monkeypatch, calls=1)
    result = pipeline.parse_policy(source(), settings, tmp_path / "second", budget=second,
                                   checkpoint=saved[0], save_checkpoint=saved.append)
    assert models[0].call_count == 1 and models[1].call_count == 1
    assert second.model_calls == 1 and second.tokens == 40
    assert result["status"] == "needs_review" and saved[-1] == result
    assert result["review_status"] == "draft" and result["matching_enabled"] is False
    # Fully validated stages can complete a retry even with no model allowance.
    assert pipeline.parse_policy(source(), settings, tmp_path / "third",
        budget=budget(monkeypatch, calls=0, tokens=0), checkpoint=result) == result
    assert models[0].call_count == 1 and models[1].call_count == 1


def test_successful_stage_persistence_error_stops_new_model_calls(tmp_path, models):
    save = Mock(side_effect=ValueError("checkpoint write failed"))
    with pytest.raises(ValueError, match="checkpoint write failed"):
        pipeline.parse_policy(source(), Settings(_env_file=None), tmp_path, save_checkpoint=save)
    assert models[0].call_count == 1 and models[1].call_count == 0


def test_invalid_or_changed_checkpoint_never_bypasses_validation(tmp_path, models):
    saved = []
    settings = Settings(_env_file=None)
    pipeline.parse_policy(source(), settings, tmp_path / "first", save_checkpoint=saved.append)
    corrupt = deepcopy(saved[0])
    corrupt["overview"]["category_evidence"][0]["quote"] = "조작된 인용"
    with pytest.raises(ValueError, match="evidence"):
        pipeline.parse_policy(source(), settings, tmp_path / "bad", checkpoint=corrupt)
    changed = deepcopy(saved[0])
    changed["processing_signature"]["model"] = "different-model"
    pipeline.parse_policy(source(), settings, tmp_path / "fresh", checkpoint=changed)
    assert models[0].call_count == 2
    changed["source"]["title"] = "다른 공고"
    with pytest.raises(ValueError, match="source mismatch"):
        pipeline.parse_policy(source(), settings, tmp_path / "wrong", checkpoint=changed)


def test_validation_fallback_counts_calls_and_usage(tmp_path, monkeypatch, models):
    work = budget(monkeypatch, calls=2)
    # Overview consumed one call; a malformed condition consumed the second.
    models[1].side_effect = CodexOutputError({"usage": [{"total_tokens": 50}]})
    saved = []
    with pytest.raises(BudgetExhausted, match="model_calls"):
        pipeline.parse_policy(source(), Settings(_env_file=None), tmp_path,
                              budget=work, save_checkpoint=saved.append)
    assert work.model_calls == 2 and work.tokens == 80
    assert models[1].call_count == 1 and saved[-1]["status"] == "pending"


def test_validation_failure_diagnostic_omits_rejected_input():
    error = ValidationError.from_exception_data("PolicyOverview", [{
        "type": "string_type", "loc": ("title",), "input": "private rejected value",
    }])

    summary = pipeline._safe_validation_summary(error)

    assert "title" in summary
    assert "valid string" in summary
    assert "private rejected value" not in summary


def test_budget_limited_cli_timeout_is_failed_after_an_actual_attempt(
        tmp_path, monkeypatch, models):
    models[0].side_effect = CodexRunError("codex_timeout")
    work = budget(monkeypatch, seconds=20)
    result = pipeline.parse_policy(source(), Settings(_env_file=None), tmp_path, budget=work)
    assert result["status"] == "failed" and work.model_calls == 1
    assert result["overview_attempts"][0]["error"] == "codex_timeout"
    assert models[0].call_args.args[1].codex_timeout_seconds == 20
    assert models[1].call_count == 0


def test_signature_ignores_timeout_but_tracks_model_and_prompts(monkeypatch):
    settings = Settings(_env_file=None)
    original = pipeline.processing_signature(settings)
    assert pipeline.processing_signature(settings.model_copy(update={
        "codex_timeout_seconds": 20, "codex_executable": "another-path"})) == original
    assert pipeline.processing_signature(settings.model_copy(update={
        "codex_model": "other-model"}))["hash"] != original["hash"]
    monkeypatch.setattr(pipeline, "PROMPT", pipeline.PROMPT + " changed")
    assert pipeline.processing_signature(settings)["hash"] != original["hash"]


def test_bounded_resume_keeps_budget_deferral_pending(tmp_path, monkeypatch, models):
    record = source()
    repository = Mock()
    repository.run_processing.return_value = {}
    repository.pending_items.return_value = [{"source_json": record.model_dump(),
                                              "result_json": None}]
    repository.finish_run.return_value = {"status": "running", "records": []}
    manifest = pipeline.resume_run("run", Settings(_env_file=None), repository,
                                   max_items=1, budget=budget(monkeypatch, calls=1))
    repository.pending_items.assert_called_once_with("run", limit=1)
    assert repository.save_result.call_args.args[1]["status"] == "pending"
    repository.mark_failed.assert_not_called()
    assert manifest["budget_exhausted"] == "model_calls"


def test_malformed_cli_response_preserves_usage_for_budget(tmp_path, monkeypatch):
    executable = tmp_path / "codex.exe"
    executable.touch()
    executable.chmod(0o700)

    class MalformedProcess:
        returncode = 0

        def __init__(self, args, **kwargs):
            output = args[args.index("-o") + 1]
            with open(output, "w", encoding="utf-8") as stream:
                stream.write("{}")
            kwargs["stdout"].write(
                b'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":5}}\n')

        def communicate(self, *args, **kwargs):
            pass

    monkeypatch.setattr(llm.subprocess, "Popen", MalformedProcess)
    with pytest.raises(CodexOutputError) as error:
        llm.extract_policy(source(), Settings(_env_file=None,
            codex_executable=str(executable)), tmp_path / "attempt", "test-model")
    work = budget(monkeypatch)
    work.record(error.value.metadata)
    assert work.tokens == 15


def test_condition_quality_failure_resumes_at_fallback_with_one_call_per_tick(
        tmp_path, monkeypatch, models):
    saved = []
    settings = Settings(_env_file=None)
    pipeline.parse_policy(source(), settings, tmp_path / "initial", save_checkpoint=saved.append)
    summary_checkpoint = saved[0]
    models[1].reset_mock()
    models[1].side_effect = [CodexOutputError({"usage": [{"total_tokens": 15}]}),
                            (pipeline._missing_conditions(source()), {})]
    saved.clear()
    with pytest.raises(BudgetExhausted, match="model_calls"):
        pipeline.parse_policy(source(), settings, tmp_path / "primary",
            budget=budget(monkeypatch, calls=1), checkpoint=summary_checkpoint,
            save_checkpoint=saved.append)
    assert saved[-1]["attempts"][0]["status"] == "validation_failed"
    result = pipeline.parse_policy(source(), settings, tmp_path / "fallback",
        budget=budget(monkeypatch, calls=1), checkpoint=saved[-1], save_checkpoint=saved.append)
    assert [call.args[-1] for call in models[1].call_args_list] == [
        settings.codex_model, settings.codex_fallback_model]
    assert result["status"] == "needs_review"


def test_overview_quality_failure_resumes_at_fallback(tmp_path, monkeypatch, models):
    settings = Settings(_env_file=None)
    models[0].side_effect = [(overview().model_copy(update={"title": "틀린 제목"}), {}),
                             (overview(), {})]
    saved = []
    with pytest.raises(BudgetExhausted, match="model_calls"):
        pipeline.parse_policy(source(), settings, tmp_path / "primary",
            budget=budget(monkeypatch, calls=1), save_checkpoint=saved.append)
    assert saved[-1]["overview_attempts"][0]["status"] == "validation_failed"
    result = pipeline.parse_policy(source(), settings, tmp_path / "fallback",
        budget=budget(monkeypatch, calls=2), checkpoint=saved[-1], save_checkpoint=saved.append)
    assert [call.args[-1] for call in models[0].call_args_list] == [
        settings.codex_model, settings.codex_fallback_model]
    assert result["status"] == "needs_review"


def test_all_overview_quality_failures_end_failed_without_refunding_budget_forever(
        tmp_path, monkeypatch, models):
    settings = Settings(_env_file=None)
    models[0].return_value = (overview().model_copy(update={"title": "틀린 제목"}), {})
    saved = []
    with pytest.raises(BudgetExhausted):
        pipeline.parse_policy(source(), settings, tmp_path / "primary",
            budget=budget(monkeypatch, calls=1), save_checkpoint=saved.append)
    result = pipeline.parse_policy(source(), settings, tmp_path / "fallback",
        budget=budget(monkeypatch, calls=1), checkpoint=saved[-1], save_checkpoint=saved.append)
    assert result["status"] == "failed" and result["analysis"] is None
    assert len(result["overview_attempts"]) == 2
    again = pipeline.parse_policy(source(), settings, tmp_path / "complete",
        budget=budget(monkeypatch, calls=0), checkpoint=result)
    assert again["status"] == "failed" and models[0].call_count == 2
    assert models[1].call_count == 0


def test_overview_transport_failure_is_retryable_and_does_not_skip_primary(
        tmp_path, monkeypatch, models):
    settings = Settings(_env_file=None)
    models[0].side_effect = [CodexRunError("codex_failed"), (overview(), {})]
    first = pipeline.parse_policy(source(), settings, tmp_path / "first",
                                  budget=budget(monkeypatch, calls=2))
    assert first["status"] == "failed" and models[1].call_count == 0
    second = pipeline.parse_policy(source(), settings, tmp_path / "second",
        budget=budget(monkeypatch, calls=2), checkpoint=first)
    assert second["status"] == "needs_review"
    assert [call.args[-1] for call in models[0].call_args_list] == [
        settings.codex_model, settings.codex_model]
