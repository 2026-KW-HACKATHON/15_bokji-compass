"""Bundle isolation, cost accounting and resumability using synthetic model output."""

import time

import pytest

from app.core.config import Settings
from app.modules.llm import public as llm
from app.modules.pipeline import batching
from app.modules.pipeline.budget import BudgetExhausted, WorkBudget
from tests.test_raw_parsing import extraction, overview, source


def records(count=4):
    return [source().model_copy(update={"policy_key": f"gov24:batch-{index}",
        "fields": {"eligibility": source().fields["eligibility"] + ", 별도 기관의 심사 필요"}})
        for index in range(count)]


def response(record):
    return {"policy_key": record.policy_key,
            "overview": overview().model_dump(exclude={"title", "source_url"}),
            "extraction": extraction().model_dump(exclude={"policy_key"})}


def budget(calls=10):
    return WorkBudget(time.monotonic() + 300, max_model_calls=calls)


def test_four_policies_share_one_call_and_usage_is_counted_once(tmp_path, monkeypatch):
    calls = []
    def model(requests, settings, output, model):
        calls.append(requests)
        return [response(s) for s, *_ in requests], {"usage": [{"input_tokens": 300,
                                                                "output_tokens": 200}]}
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    work = budget()
    saved = []
    result = dict(batching.parse_policy_batch(records(), Settings(_env_file=None), tmp_path,
        budget=work, save_checkpoint=lambda key, value: saved.append((key, value))))
    assert len(result) == 4 and len(calls) == 1
    assert work.model_calls == 1 and work.tokens == 500
    assert all(v["status"] == "needs_review" for v in result.values())
    assert all(v["analysis"]["policy_key"] == key for key, v in result.items())
    assert len([v for _, v in saved if v["status"] == "needs_review"]) == 4


def test_bad_quote_retries_only_that_policy_and_keeps_valid_overview(tmp_path, monkeypatch):
    calls = []
    def model(requests, settings, output, model):
        calls.append((requests, model, settings.codex_reasoning_effort))
        rows = [response(s) for s, *_ in requests]
        if len(calls) == 1:
            rows[1]["extraction"]["conditions"][0]["evidence_quote"] = "fabricated"
        return rows, {"usage": [{"total_tokens": 100}]}
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    settings = Settings(_env_file=None, codex_reasoning_effort="low")
    work = budget()
    result = dict(batching.parse_policy_batch(records(), settings, tmp_path, budget=work))
    assert len(calls) == 2 and work.tokens == 200
    assert len(calls[1][0]) == 1 and calls[1][0][0][0].policy_key == "gov24:batch-1"
    assert calls[1][0][0][1] is False  # Successful overview is not generated again.
    assert calls[1][1:] == (settings.codex_fallback_model, "medium")
    assert all(v["status"] == "needs_review" for v in result.values())


def test_budget_deferral_preserves_neighbors_and_resumes_only_failed_item(tmp_path, monkeypatch):
    calls, saved = [], {}
    def model(requests, settings, output, model):
        calls.append([s.policy_key for s, *_ in requests])
        rows = [response(s) for s, *_ in requests]
        if len(calls) == 1:
            rows[0]["extraction"]["conditions"][0]["evidence_quote"] = "fabricated"
        return rows, {"usage": [{"total_tokens": 80}]}
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    settings = Settings(_env_file=None)
    completed = []
    with pytest.raises(BudgetExhausted):
        for key, value in batching.parse_policy_batch(records(), settings, tmp_path / "first",
            budget=budget(1), save_checkpoint=lambda key, value: saved.update({key: value})):
            completed.append(key)
    assert len(completed) == 3 and saved["gov24:batch-0"]["overview_status"] == "validated"
    result = dict(batching.parse_policy_batch(records(), settings, tmp_path / "resume",
                                             budget=budget(), checkpoints=saved))
    assert len(result) == 4 and calls[1] == ["gov24:batch-0"]
    assert all(v["status"] == "needs_review" for v in result.values())


def test_timeout_has_no_fallback_or_repeated_paid_retry(tmp_path, monkeypatch):
    calls = []
    def model(*args):
        calls.append(1)
        raise llm.CodexRunError("codex_timeout")
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    settings = Settings(_env_file=None)
    failed = dict(batching.parse_policy_batch(records(), settings, tmp_path / "first",
                                              budget=budget()))
    assert len(calls) == 1 and all(v["status"] == "failed" for v in failed.values())
    dict(batching.parse_policy_batch(records(), settings, tmp_path / "retry", budget=budget(),
                                   checkpoints=failed))
    assert len(calls) == 1


def test_batch_schema_omits_deterministic_output_and_preserves_source(tmp_path, monkeypatch):
    captured = {}
    def transport(*args, **kwargs):
        captured.update(kwargs)
        return {"results": []}, {}
    monkeypatch.setattr(llm, "_extract_structured", transport)
    record = records(1)[0]
    llm.extract_policy_batch([(record, True, True)], Settings(_env_file=None), tmp_path, "model")
    assert captured["payload"][0]["source"]["fields"] == record.fields
    assert "source_hash" not in captured["payload"][0]["source"]
    schema = captured["output_schema"]
    assert "title" not in schema["$defs"]["PolicyOverview"]["properties"]
    assert "policy_key" not in schema["$defs"]["PolicyExtraction"]["properties"]
    assert captured["raw_response"] is True


def test_completed_checkpoints_need_no_model_allowance(tmp_path, monkeypatch):
    monkeypatch.setattr(batching, "extract_policy_batch", lambda requests, *_:
        ([response(s) for s, *_ in requests], {}))
    settings = Settings(_env_file=None)
    checkpoints = dict(batching.parse_policy_batch(records(), settings, tmp_path / "first",
                                                   budget=budget()))
    recovered = dict(batching.parse_policy_batch(records(), settings, tmp_path / "resume",
                                                budget=budget(0), checkpoints=checkpoints))
    assert recovered == checkpoints


def test_duplicate_identity_cannot_replace_a_neighbor_result(tmp_path, monkeypatch):
    calls = []
    def model(requests, *_):
        calls.append([s.policy_key for s, *_ in requests])
        rows = [response(s) for s, *_ in requests]
        if len(calls) == 1:
            rows.append(response(requests[0][0]))
        return rows, {}
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    result = dict(batching.parse_policy_batch(records(2), Settings(_env_file=None), tmp_path,
                                               budget=budget()))
    assert calls == [["gov24:batch-0", "gov24:batch-1"], ["gov24:batch-0"]]
    assert all(v["status"] == "needs_review" for v in result.values())


def test_code_complete_policy_requests_overview_only(tmp_path, monkeypatch):
    record = source().model_copy(update={"fields": {"eligibility": "신청자 만 19세 이상"}})
    requests_seen = []
    def model(requests, *_):
        requests_seen.extend(requests)
        row = response(record)
        row["extraction"] = None
        return [row], {}
    monkeypatch.setattr(batching, "extract_policy_batch", model)
    result = dict(batching.parse_policy_batch([record], Settings(_env_file=None), tmp_path,
                                              budget=budget()))
    assert requests_seen[0][1:] == (True, False)
    assert result[record.policy_key]["method"] == "code_rules"


def test_usage_reports_cache_and_reasoning_without_counting_twice():
    work = budget()
    work.record({"usage": [{"input_tokens": 100, "cached_input_tokens": 80,
                             "output_tokens": 30, "reasoning_tokens": 10}]})
    assert work.tokens == 130 and work.input_tokens == 100 and work.cached_input_tokens == 80
    assert work.output_tokens == 30 and work.reasoning_tokens == 10
    work.record({"usage": [{"total_tokens": 200, "input_tokens": 150, "output_tokens": 50,
        "input_tokens_details": {"cached_tokens": 120},
        "output_tokens_details": {"reasoning_tokens": 20}}]})
    assert work.tokens == 330 and work.cached_input_tokens == 200 and work.reasoning_tokens == 30
