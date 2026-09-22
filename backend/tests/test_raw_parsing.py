import json
import subprocess
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from app.contracts.parsing import ConditionValue, PolicyExtraction
from app.core import config
from app.core.config import Settings
from app.modules.collectors.bokjiro_services import _parse_detail_response
from app.modules.llm import public as llm
from app.modules.normalization.raw import load_raw_policies, normalize_record
from app.modules.pipeline import public as pipeline
from app.modules.validation.public import validate_extraction


def source():
    return normalize_record({"서비스ID": "test-1", "서비스명": "가상 정책",
                             "지원대상": "신청자 만 19세 이상, 무소득자"})


def value(**changes):
    fields = dict(kind="NUMBER", number=19, minimum=None, maximum=None,
                  min_inclusive=None, max_inclusive=None, text=None,
                  boolean=None, date_min=None, date_max=None)
    return {k: v for k, v in {**fields, **changes}.items() if v is not None}


def extraction(**condition_changes):
    return PolicyExtraction.model_validate({
        "policy_key": source().policy_key, "coverage": "partial", "unresolved": [],
        "groups": [{"group_id": "g1", "relation": "all", "scope_text": "가상 신청자 조건",
                    "source_field": "eligibility", "evidence_quote": "신청자 만 19세 이상"}],
        "conditions": [{"condition_id": "c1", "field_key": "age", "subject": "applicant",
                        "state_code": 1, "operator": "GTE", "value": value(), "unit": "YEARS",
                        "reference_basis": None, "role": "eligibility", "group_id": "g1",
                        "source_field": "eligibility", "evidence_quote": "만 19세 이상",
                        "unknown_reason": None, "review_note": "", **condition_changes}],
    })


def test_number_zero_and_boolean_false_are_real_values():
    adapter = TypeAdapter(ConditionValue)
    assert adapter.validate_python(value(number=0)).number == 0
    false_value = adapter.validate_python(value(kind="BOOLEAN", number=None, boolean=False))
    assert false_value.boolean is False
    assert extraction(value=value(number=0), operator="EQ").conditions[0].state_code == 1


@pytest.mark.parametrize("changes", [
    {"state_code": 0}, {"state_code": 9, "value": None, "operator": None},
    {"evidence_quote": None}, {"operator": "RANGE"},
    {"value": value(kind="TEXT", number=None, text="가상 조건")},
    {"field_key": "residence_region"},
])
def test_invalid_conditions_are_rejected(changes):
    with pytest.raises(ValidationError):
        extraction(**changes)


def test_range_exclusivity_and_reversed_ranges():
    fields = value(kind="NUMBER_RANGE", number=None, minimum=50, maximum=100,
                   min_inclusive=False, max_inclusive=True)
    assert TypeAdapter(ConditionValue).validate_python(fields).min_inclusive is False
    with pytest.raises(ValidationError):
        TypeAdapter(ConditionValue).validate_python({**fields, "minimum": 101})


@pytest.mark.parametrize("changes", [
    {"evidence_quote": "신청자 만 20세 이상"}, {"group_id": "invented"},
    {"source_field": "invented"}, {"group_id": None},
])
def test_evidence_and_scope_fail_closed(changes):
    with pytest.raises(ValueError):
        validate_extraction(extraction(**changes), source())


def test_nested_xml_repetitions_and_error_validation():
    payload = b'''<wantedDtl><resultCode>0</resultCode><servId>TEST</servId>
    <servNm>Test</servNm><applmetList><applmetNm>A</applmetNm></applmetList>
    <applmetList><applmetNm>B</applmetNm></applmetList></wantedDtl>'''
    parsed = _parse_detail_response(payload)
    assert parsed["applmetList"] == [{"applmetNm": "A"}, {"applmetNm": "B"}]
    with pytest.raises(RuntimeError):
        _parse_detail_response(payload.replace(b"<resultCode>0", b"<resultCode>30"))


def test_gov24_batch_no_five_record_limit_and_malformed_rows(tmp_path):
    path = tmp_path / "raw.json"
    rows = [{"서비스ID": str(i), "서비스명": "가상", "지원대상": "가상 조건"} for i in range(7)]
    path.write_text(json.dumps({"data": rows}), encoding="utf-8")
    assert len(load_raw_policies(path)) == 7
    rows.append(None)
    path.write_text(json.dumps({"data": rows}), encoding="utf-8")
    with pytest.raises(ValueError):
        load_raw_policies(path)


def test_source_mapping_keeps_scope_and_excludes_unrelated_fields():
    row = {"document_id": "../path", "title": "가상", "text": "본문\r\n다음 줄",
           "source_url": "https://example.invalid/notice", "private_setting": "not-sent"}
    record = normalize_record(row)
    assert record.fields == {"text": "본문\n다음 줄"}
    assert "not-sent" not in record.model_dump_json()
    assert len(record.source_hash) == 64


def test_dry_run_and_missing_source_skip_llm(tmp_path, monkeypatch):
    def unexpected(*args, **kwargs):
        raise AssertionError("LLM must not run")
    monkeypatch.setattr(pipeline, "extract_policy", unexpected)
    settings = Settings(_env_file=None)
    prepared = pipeline.parse_policy(source(), settings, tmp_path, prepare_only=True)
    assert prepared["processing_state"] == 8 and prepared["analysis"] is None
    absent = normalize_record({"servId": "TEST", "servNm": "가상 목록만 존재"})
    draft = pipeline.parse_policy(absent, settings, tmp_path)
    assert draft["analysis"]["conditions"][0]["state_code"] == 9
    assert not draft["matching_enabled"]


def test_configured_fallback_only_on_validation_failure(tmp_path, monkeypatch):
    calls = []
    def fake_extract(record, settings, output, model):
        calls.append(model)
        if len(calls) == 1:
            return extraction(evidence_quote="invented"), {}
        return extraction(), {"model": model}
    monkeypatch.setattr(pipeline, "extract_policy", fake_extract)
    settings = Settings(_env_file=None, codex_fallback_model="gpt-5.6-terra")
    result = pipeline.parse_policy(source(), settings, tmp_path)
    assert calls == ["gpt-5.6-luna", "gpt-5.6-terra"]
    assert result["status"] == "needs_review"
    assert result["attempts"][0]["status"] == "validation_failed"


def test_timeout_does_not_trigger_model_escalation(tmp_path, monkeypatch):
    def timeout(*args):
        raise llm.CodexRunError("codex_timeout")
    monkeypatch.setattr(pipeline, "extract_policy", timeout)
    result = pipeline.parse_policy(source(), Settings(_env_file=None,
                                   codex_fallback_model="gpt-5.6-terra"), tmp_path)
    assert result["status"] == "failed" and result["analysis"] is None
    assert len(result["attempts"]) == 1


def test_partial_coverage_and_failed_retries_stay_unpublished(tmp_path, monkeypatch):
    candidate = extraction()
    candidate.coverage = "complete"
    candidate.unresolved = ["가상 예외 해석 미확정"]
    monkeypatch.setattr(pipeline, "extract_policy", lambda *args: (candidate, {}))
    result = pipeline.parse_policy(source(), Settings(_env_file=None), tmp_path)
    assert result["reported_coverage"] == "complete"
    assert result["analysis"]["coverage"] == "partial"
    monkeypatch.setattr(pipeline, "extract_policy",
                        lambda *args: (extraction(evidence_quote="invented"), {}))
    result = pipeline.parse_policy(source(), Settings(_env_file=None), tmp_path)
    assert result["status"] == "failed" and result["analysis"] is None
    assert len(result["attempts"]) == 2


def test_config_model_loads_from_env_and_environment_wins(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("DB_ENABLED=false\nCODEX_MODEL=gpt-5.6-terra\n", encoding="utf-8")
    monkeypatch.setenv("APP_CONFIG_FILE", str(path))
    monkeypatch.delenv("CODEX_MODEL", raising=False)
    assert config.load_settings().codex_model == "gpt-5.6-terra"
    monkeypatch.setenv("CODEX_MODEL", "gpt-5.6-luna")
    assert config.load_settings().codex_model == "gpt-5.6-luna"


def test_cli_args_keep_credentials_out_and_validate_response(tmp_path, monkeypatch):
    executable = tmp_path / "codex.exe"
    executable.touch()
    monkeypatch.setenv("DB_PASSWORD", "test-private")
    monkeypatch.setenv("BokjiRO_API_KEY", "test-private")
    captured = {}
    class FakeProcess:
        returncode = 0
        def __init__(self, args, **kwargs):
            captured.update(args=args, **kwargs)
            Path(args[args.index("-o") + 1]).write_text(
                extraction().model_dump_json(), encoding="utf-8")
            kwargs["stdout"].write(b'{"type":"turn.completed","usage":{"output_tokens":1}}\n')
        def communicate(self, prompt, timeout):
            assert b"test-private" not in prompt
    monkeypatch.setattr(llm.subprocess, "Popen", FakeProcess)
    result, metadata = llm.extract_policy(source(), Settings(_env_file=None,
        codex_executable=str(executable)), tmp_path / "attempt", "gpt-5.6-luna")
    assert metadata["model"] == "gpt-5.6-luna"
    assert result.policy_key == source().policy_key
    assert "DB_PASSWORD" not in captured["env"] and "BokjiRO_API_KEY" not in captured["env"]
    assert captured["args"][captured["args"].index("--model") + 1] == "gpt-5.6-luna"
    assert "features.shell_tool=false" in captured["args"]
    assert "--ignore-user-config" in captured["args"]
    assert captured["cwd"] != Path.cwd()


def test_cli_timeout_terminates_own_process(tmp_path, monkeypatch):
    executable = tmp_path / "codex.exe"
    executable.touch()
    killed = []
    class HangingProcess:
        pid = 98765
        def __init__(self, *args, **kwargs):
            pass
        def communicate(self, *args, **kwargs):
            raise subprocess.TimeoutExpired("codex", 10)
        def poll(self):
            return 1
        def wait(self, timeout):
            return 1
    monkeypatch.setattr(llm.subprocess, "Popen", HangingProcess)
    monkeypatch.setattr(llm.subprocess, "run", lambda args, **kwargs: killed.append(args))
    with pytest.raises(llm.CodexRunError, match="timeout"):
        llm.extract_policy(source(), Settings(_env_file=None, codex_executable=str(executable)),
                           tmp_path / "attempt", "gpt-5.6-luna")
    assert killed == [["taskkill", "/PID", "98765", "/T", "/F"]]


def test_tool_event_rejects_an_otherwise_valid_response(tmp_path, monkeypatch):
    executable = tmp_path / "codex.exe"
    executable.touch()
    class ToolProcess:
        returncode = 0
        def __init__(self, args, **kwargs):
            Path(args[args.index("-o") + 1]).write_text(
                extraction().model_dump_json(), encoding="utf-8")
            kwargs["stdout"].write(
                b'{"type":"item.completed","item":{"type":"command_execution"}}\n'
                b'{"type":"turn.completed","usage":{}}\n')
        def communicate(self, *args, **kwargs):
            pass
    monkeypatch.setattr(llm.subprocess, "Popen", ToolProcess)
    with pytest.raises(llm.CodexRunError, match="unexpected_tool"):
        llm.extract_policy(source(), Settings(_env_file=None, codex_executable=str(executable)),
                           tmp_path / "attempt", "gpt-5.6-luna")


def test_batch_writes_drafts_using_safe_ids(tmp_path, monkeypatch):
    path = tmp_path / "notice.json"
    path.write_text(json.dumps({"document_id": "../../escape", "title": "가상", "text": ""}))
    folder, manifest = pipeline.parse_raw_files([path], settings=Settings(_env_file=None),
                                               output_root=tmp_path / "out")
    draft = folder / manifest["records"][0]["path"]
    assert draft.is_relative_to(folder)
    assert json.loads(draft.read_text(encoding="utf-8"))["method"] == "code_missing_source"
