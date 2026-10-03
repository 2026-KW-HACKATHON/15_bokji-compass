import json
import shlex
import signal
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest
from pydantic import TypeAdapter, ValidationError

from app.contracts.parsing import ConditionValue, PolicyExtraction, PolicyOverview
from app.core import config
from app.core.config import Settings
from app.modules.collectors.bokjiro_services import _parse_detail_response
from app.modules.llm import public as llm
from app.modules.normalization.raw import load_raw_policies, normalize_record
from app.modules.pipeline import public as pipeline
from app.modules.validation.public import validate_extraction, validate_overview


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


def overview(**changes):
    return PolicyOverview.model_validate({
        "title": "가상 정책", "source_url": None, "category": "교육",
        "category_reason": "교육을 지원합니다.",
        "category_evidence": [{"source_field": "title", "quote": "가상 정책"}],
        "region_conditions": {"status": "not_stated", "text": None,
                               "evidence": [], "unresolved_reason": None},
        "gender_conditions": {"status": "not_stated", "text": None,
                              "evidence": [], "unresolved_reason": None},
        "age_conditions": {"status": "not_stated", "text": None,
                           "evidence": [], "unresolved_reason": None},
        "other_conditions": [],
        "benefits": {"status": "specified", "text": "교육 지원",
                     "evidence": [{"source_field": "title", "quote": "가상 정책"}],
                     "unresolved_reason": None},
        "policy_requirements": [{"condition_type": "age", "information_state": "specified",
                     "evidence_text": "만 19세 이상"}],
        "unresolved": [], **changes,
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


def test_overview_category_is_limited_and_evidence_is_verified():
    valid = overview()
    validate_overview(valid, source())
    with pytest.raises(ValidationError):
        overview(category="교통·안전")
    with pytest.raises(ValueError, match="evidence"):
        validate_overview(overview(benefits={"status": "specified", "text": "없는 내용",
                                             "evidence": [{"source_field": "title",
                                                           "quote": "없는 내용"}],
                                             "unresolved_reason": None}), source())
    with pytest.raises(ValidationError):
        overview(category=None)
    with pytest.raises(ValueError, match="title"):
        validate_overview(overview(title="다른 제목"), source())


def test_overview_url_comes_from_source_not_model(tmp_path, monkeypatch):
    source_record = source().model_copy(update={"source_url": "https://example.gov/notice/1"})
    monkeypatch.setattr(
        llm, "_extract_structured",
        lambda *args: (overview(source_url="https://attacker.invalid/fake"),
                       {"model": "test-model"}),
    )
    result, _ = llm.extract_policy_overview(
        source_record, Settings(_env_file=None), tmp_path, "test-model")
    assert result.source_url == source_record.source_url
    validate_overview(result, source_record)


def test_overview_sections_distinguish_unrestricted_from_not_stated():
    unrestricted = overview(region_conditions={
        "status": "unrestricted", "text": "지역 제한 없음",
        "evidence": [{"source_field": "text", "quote": "가상 정책"}],
        "unresolved_reason": None,
    })
    assert unrestricted.region_conditions.status == "unrestricted"
    with pytest.raises(ValidationError):
        overview(age_conditions={"status": "unrestricted", "text": "나이 제한 없음",
                                "evidence": [], "unresolved_reason": None})


def test_policy_requirements_match_legacy_table_and_require_source_evidence():
    valid = overview(policy_requirements=[
        {"condition_type": "other", "information_state": "specified",
         "evidence_text": "무소득자"},
    ])
    validate_overview(valid, source())
    gender_source = normalize_record({"서비스ID": "gender-test", "서비스명": "가상 정책",
                                     "지원대상": "여성"})
    gender = overview(policy_requirements=[
        {"condition_type": "gender", "information_state": "specified",
         "evidence_text": "여성"},
    ])
    validate_overview(gender, gender_source)
    with pytest.raises(ValueError, match="evidence"):
        validate_overview(overview(policy_requirements=[
            {"condition_type": "other", "information_state": "specified",
             "evidence_text": "없는 조건"},
        ]), source())


def test_code_complete_policy_still_generates_overview(tmp_path, monkeypatch):
    record = normalize_record({"document_id": "clear-1", "title": "가상 정책",
                               "text": "신청자 만 19세 이상"})
    monkeypatch.setattr(pipeline, "extract_policy",
                        lambda *args: (_ for _ in ()).throw(AssertionError("not needed")))
    monkeypatch.setattr(pipeline, "extract_policy_overview",
                        lambda *args: (overview(), {"model": "test-model"}))
    result = pipeline.parse_policy(record, Settings(_env_file=None), tmp_path)
    assert result["method"] == "code_rules"
    assert result["overview_status"] == "validated"
    assert result["overview"]["category"] == "교육"


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


def test_gov24_overview_fields_are_preserved_as_source_evidence():
    record = normalize_record({
        "서비스ID": "gov24-1", "서비스명": "청년 주거 지원",
        "서비스목적요약": "청년의 주거비 부담을 완화합니다.",
        "서비스분야": "주거", "지원내용": "월세 보증을 지원합니다.",
    })
    assert record.fields["purpose_summary"] == "청년의 주거비 부담을 완화합니다."
    assert record.fields["provider_category"] == "주거"


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


def test_cli_overview_uses_six_category_prompt_and_schema(tmp_path, monkeypatch):
    executable = tmp_path / "codex.exe"
    executable.touch()
    executable.chmod(0o700)
    captured = {}

    class OverviewProcess:
        returncode = 0

        def __init__(self, args, **kwargs):
            captured["args"] = args
            Path(args[args.index("-o") + 1]).write_text(
                overview().model_dump_json(), encoding="utf-8")
            kwargs["stdout"].write(b'{"type":"turn.completed","usage":{}}\n')

        def communicate(self, prompt, timeout):
            captured["prompt"] = prompt.decode("utf-8")

    monkeypatch.setattr(llm.subprocess, "Popen", OverviewProcess)
    result, metadata = llm.extract_policy_overview(
        source(), Settings(_env_file=None, codex_executable=str(executable)),
        tmp_path / "overview-attempt", "gpt-5.6-luna")
    assert result.category == "교육"
    assert metadata["prompt_version"] == "welfare-overview-v2"
    assert all(category in captured["prompt"] for category in
               ("생활·금융", "주거", "일자리", "교육", "건강·돌봄", "문화"))
    assert all(field in captured["prompt"] for field in (
        "title", "region_conditions", "gender_conditions", "age_conditions",
        "other_conditions", "benefits"))
    assert "신청자/가구의 주소·거주·주민등록 지역 자격만" in captured["prompt"]
    assert "전국 대상(지역 제한 없음)" in captured["prompt"]
    assert "지역 표현은 region_conditions에만 두고" in captured["prompt"]
    assert "policy_requirements 테이블 행에 대응" in captured["prompt"]
    assert "공고의 성별 자격 조건은 gender" in captured["prompt"]
    assert "ENUM('age','birth_region','residence_region','gender','other')" in captured["prompt"]


def test_cli_args_keep_credentials_out_and_validate_response(tmp_path, monkeypatch):
    executable = tmp_path / "codex.exe"
    executable.touch()
    executable.chmod(0o700)
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
    monkeypatch.setattr(llm, "IS_WINDOWS", True)
    times = iter([0.0, 301.0])
    monkeypatch.setattr(llm.time, "monotonic", lambda: next(times))
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
    executable.chmod(0o700)
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


@pytest.mark.parametrize("filename,limit,code", [
    ("events.jsonl", "MAX_EVENT_BYTES", "event_limit"),
    ("stderr.log", "MAX_STDERR_BYTES", "stderr_limit"),
    ("response.json", "MAX_RESULT_BYTES", "result_limit"),
])
@pytest.mark.parametrize("running", [False, True])
def test_cli_output_limits_apply_before_parsing_and_stop_running_process(
    tmp_path, monkeypatch, filename, limit, code, running,
):
    monkeypatch.setattr(llm, "resolve_codex_executable", lambda _: tmp_path / "codex.exe")
    monkeypatch.setattr(llm, limit, 32)
    stopped = []
    monkeypatch.setattr(llm, "stop_codex_process", lambda process: stopped.append(process))

    class OversizedProcess:
        returncode = 0

        def __init__(self, args, **kwargs):
            output = Path(args[args.index("-o") + 1]).parent
            (output / filename).write_bytes(b"x" * 33)

        def communicate(self, *args, **kwargs):
            if running:
                raise subprocess.TimeoutExpired("fake-codex", 0.2)

    monkeypatch.setattr(llm.subprocess, "Popen", OversizedProcess)
    with pytest.raises(llm.CodexRunError, match=code):
        llm.extract_policy(source(), Settings(_env_file=None), tmp_path / "attempt", "test-model")
    assert len(stopped) == int(running)


@pytest.mark.parametrize("event,code", [
    (b'[]\n', "invalid_cli_event"),
    (b'{"type":"item.started","item":null}\n', "invalid_cli_event"),
    (b'{"type":"unknown.tool"}\n', "invalid_cli_event"),
    (b'{"type":"item.started","item":{"type":"command_execution"}}\n', "unexpected_tool"),
])
def test_cli_rejects_malformed_or_tool_events_before_process_finishes(
    tmp_path, monkeypatch, event, code,
):
    monkeypatch.setattr(llm, "resolve_codex_executable", lambda _: tmp_path / "codex.exe")
    stopped = []
    monkeypatch.setattr(llm, "stop_codex_process", lambda process: stopped.append(process))

    class EventProcess:
        def __init__(self, args, **kwargs):
            kwargs["stdout"].write(event)
            kwargs["stdout"].flush()

        def communicate(self, *args, **kwargs):
            raise subprocess.TimeoutExpired("fake-codex", 0.2)

    monkeypatch.setattr(llm.subprocess, "Popen", EventProcess)
    with pytest.raises(llm.CodexRunError, match=code):
        llm.extract_policy(source(), Settings(_env_file=None), tmp_path / "attempt", "test-model")
    assert len(stopped) == 1


def test_batch_writes_drafts_using_safe_ids(tmp_path, monkeypatch):
    path = tmp_path / "notice.json"
    path.write_text(json.dumps({"document_id": "../../escape", "title": "가상", "text": ""}))
    folder, manifest = pipeline.parse_raw_files([path], settings=Settings(_env_file=None),
                                               output_root=tmp_path / "out", storage="json")
    draft = folder / manifest["records"][0]["path"]
    assert draft.is_relative_to(folder)
    assert json.loads(draft.read_text(encoding="utf-8"))["method"] == "code_missing_source"


def test_posix_cli_discovery_and_execute_permission(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "IS_WINDOWS", False)
    executable = tmp_path / "codex"
    executable.touch()
    monkeypatch.setattr(llm.os, "access", lambda path, mode: True)
    monkeypatch.setattr(llm.shutil, "which",
                        lambda name: str(executable) if name == "codex" else None)
    assert llm.resolve_codex_executable("") == executable.resolve()
    assert llm.resolve_codex_executable(str(executable)) == executable.resolve()
    monkeypatch.setattr(llm.os, "access", lambda path, mode: False)
    with pytest.raises(llm.CodexRunError, match="execute permission"):
        llm.resolve_codex_executable("")
    monkeypatch.setattr(llm.shutil, "which", lambda name: None)
    with pytest.raises(llm.CodexRunError, match="codex_not_found"):
        llm.resolve_codex_executable("")


def test_windows_discovery_keeps_desktop_fallback_and_rejects_wrapper(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "IS_WINDOWS", True)
    monkeypatch.setattr(llm.shutil, "which", lambda name: None)
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    native = tmp_path / "OpenAI/Codex/bin/version/codex.exe"
    native.parent.mkdir(parents=True)
    native.touch()
    assert llm.resolve_codex_executable("") == native.resolve()
    wrapper = tmp_path / "codex.cmd"
    wrapper.touch()
    with pytest.raises(llm.CodexRunError, match="native .exe"):
        llm.resolve_codex_executable(str(wrapper))
    with pytest.raises(llm.CodexRunError, match="absolute"):
        llm.resolve_codex_executable("codex.exe")


def test_posix_login_environment_keeps_home_but_not_application_secrets(monkeypatch):
    for key, value in {"HOME": "/Users/developer", "CODEX_HOME": "/Users/developer/.codex",
                       "TMPDIR": "/tmp/cli", "LANG": "ko_KR.UTF-8",
                       "OPENAI_API_KEY": "private", "DB_PASSWORD": "private",
                       "DATA_GO_KR_API_KEY": "private", "BokjiRO_API_KEY": "private"}.items():
        monkeypatch.setenv(key, value)
    environment = llm.cli_environment()
    assert environment["HOME"] == "/Users/developer"
    assert environment["CODEX_HOME"] == "/Users/developer/.codex"
    assert environment["TMPDIR"] == "/tmp/cli"
    assert environment["LANG"] == "ko_KR.UTF-8"
    assert "private" not in environment.values()


def test_posix_timeout_uses_own_new_session(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "IS_WINDOWS", False)
    times = iter([0.0, 301.0])
    monkeypatch.setattr(llm.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(signal, "SIGKILL", 9, raising=False)
    monkeypatch.setattr(llm, "resolve_codex_executable", lambda _: tmp_path / "codex")
    process = Mock(pid=12345)
    process.communicate.side_effect = subprocess.TimeoutExpired("codex", 10)
    process.poll.return_value = -9
    launch = Mock(return_value=process)
    kill_group = Mock()
    monkeypatch.setattr(llm.subprocess, "Popen", launch)
    monkeypatch.setattr(llm.os, "killpg", kill_group, raising=False)
    with pytest.raises(llm.CodexRunError, match="codex_timeout"):
        llm.extract_policy(source(), Settings(_env_file=None), tmp_path / "attempt", "gpt-5.6-luna")
    assert launch.call_args.kwargs["start_new_session"] is True
    assert "creationflags" not in launch.call_args.kwargs
    kill_group.assert_called_once_with(12345, signal.SIGKILL)
    process.wait.assert_called_once_with(timeout=10)


def test_windows_timeout_still_reaps_process_when_taskkill_unavailable(monkeypatch):
    monkeypatch.setattr(llm, "IS_WINDOWS", True)
    process = Mock(pid=12345)
    process.poll.return_value = None
    monkeypatch.setattr(llm.subprocess, "run", Mock(side_effect=FileNotFoundError))
    llm.stop_codex_process(process)
    process.kill.assert_called_once()
    process.wait.assert_called_once_with(timeout=10)


@pytest.mark.skipif(sys.platform == "win32", reason="Requires native POSIX process execution")
def test_posix_executable_with_spaces_runs_without_shell(tmp_path):
    executable = tmp_path / "codex test"
    response = extraction().model_dump_json()
    program = (
        'import sys\nfrom pathlib import Path\n'
        'assert "SOURCE_JSON" in sys.stdin.read()\n'
        f'Path(sys.argv[sys.argv.index("-o") + 1]).write_text({response!r})\n'
        'print(\'{"type":"turn.completed","usage":{}}\')\n')
    executable.write_text(
        f'#!/bin/sh\nexec {shlex.quote(sys.executable)} -c {shlex.quote(program)} "$@"\n',
        encoding="utf-8")
    executable.chmod(0o700)
    result, _ = llm.extract_policy(source(), Settings(_env_file=None,
        codex_executable=str(executable)), tmp_path / "attempt", "gpt-5.6-luna")
    assert result.policy_key == source().policy_key
