"""Offline discovery transport and URL tests; never launch CLI or retrieve web content."""

import json
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.modules.discovery import public
from app.modules.discovery.models import DiscoveryCandidate, canonicalize_url, normalize_domains


def candidate(**changes):
    return {"url": "https://youth.seoul.go.kr/notice?id=123&utm_source=test#top",
            "title": "청년 지원사업", "organization": "서울시", "reason": "복지 관련 지원 후보",
            "evidence": "청년 생활 지원", "evidence_status": "search_snippet", "region": "서울",
            "application_period": None, "source_kind": "official_notice", **changes}


def events():
    return [
        {"type": "item.started", "item": {"id": "search-1", "type": "web_search"}},
        {"type": "item.completed", "item": {"id": "search-1", "type": "web_search"}},
        {"type": "turn.completed", "usage": {"output_tokens": 12}},
    ]


@pytest.fixture
def launch(monkeypatch, tmp_path):
    captured = {}
    monkeypatch.setattr(public, "resolve_codex_executable", lambda _: tmp_path / "codex.exe")

    def install(*, payload=None, stream=None, hanging=False, stderr=b""):
        class Process:
            returncode = 0

            def __init__(self, args, **kwargs):
                captured.update(args=args, **kwargs)
                result = Path(args[args.index("-o") + 1])
                result.write_text(json.dumps(payload if payload is not None else {
                    "candidates": [candidate()]}, ensure_ascii=False), encoding="utf-8")
                for event in events() if stream is None else stream:
                    kwargs["stdout"].write(json.dumps(event).encode() + b"\n")
                kwargs["stdout"].flush()
                kwargs["stderr"].write(stderr)
                kwargs["stderr"].flush()

            def communicate(self, prompt, timeout):
                captured["prompt"] = prompt
                if hanging:
                    raise subprocess.TimeoutExpired("fake-codex", timeout)

        monkeypatch.setattr(public.subprocess, "Popen", Process)
        return captured

    return install


def discover(**changes):
    options = {"domains": [], "query": "청년 복지 공고", "timeout": 10, **changes}
    return public.discover(Settings(_env_file=None), **options)


def test_isolated_cli_settings_environment_and_search_evidence(launch, monkeypatch):
    monkeypatch.setenv("DB_PASSWORD", "private-test-value")
    monkeypatch.setenv("BOKJIRO_API_KEY", "private-test-value")
    captured = launch()
    candidates, metadata = discover()
    assert candidates[0]["url"] == "https://youth.seoul.go.kr/notice?id=123"
    assert candidates[0]["evidence_status"] == "search_snippet"
    assert metadata["verified"] is False
    assert metadata["web_search_actions"] == 1
    assert metadata["model"] == "gpt-5.6-luna"
    assert metadata["hard_search_limit"] is False
    args = captured["args"]
    for flag in ('web_search="live"', "features.shell_tool=false", "features.apps=false",
                 "features.plugins=false", "mcp_servers={}", "--ignore-user-config"):
        assert flag in args
    assert "read-only" in args and "--ephemeral" in args
    assert captured["cwd"] != Path.cwd() and not captured["cwd"].exists()
    assert "DB_PASSWORD" not in captured["env"] and "BOKJIRO_API_KEY" not in captured["env"]
    assert b"private-test-value" not in captured["prompt"]


@pytest.mark.parametrize("url", [
    "file:///tmp/private", "https://localhost/", "https://127.0.0.1/",
    "https://[::1]/", "https://192.168.1.1/", "https://example.local/",
    "https://youth.seoul.go.kr.evil.com/", "https://evil.com/",
    "https://name:password@youth.seoul.go.kr/", "https://youth.seoul.go.kr:8443/",
    "https://youth.seoul.go.kr\\@evil.com/", "https://youth.seoul.go.kr/\nsecret",
])
def test_reject_invalid_or_outside_allowlist_urls(url):
    with pytest.raises(ValueError):
        canonicalize_url(url, [])


def test_preserves_notice_identifiers_and_exact_host_allowlist():
    assert canonicalize_url("https://WWW.NOWON.KR:443/a?bbsId=5&nttId=2&fbclid=abc#z", []) == (
        "https://www.nowon.kr/a?bbsId=5&nttId=2")
    assert normalize_domains([]) == ["youth.seoul.go.kr", "www.nowon.kr"]
    with pytest.raises(ValueError):
        normalize_domains(["https://www.nowon.kr"])


def test_strict_candidate_schema_and_uncertain_evidence(launch):
    with pytest.raises(ValidationError):
        DiscoveryCandidate.model_validate(candidate(evidence_status="verified"))
    with pytest.raises(ValidationError):
        DiscoveryCandidate.model_validate(candidate(extra="ignored"))
    with pytest.raises(ValidationError):
        DiscoveryCandidate.model_validate(candidate(evidence=" "))
    launch(payload={"candidates": [candidate(evidence_status="uncertain", region=None)]})
    assert discover()[0][0]["evidence_status"] == "uncertain"


def test_same_canonical_candidate_url_only_returned_once(launch):
    launch(payload={"candidates": [candidate(), candidate(
        url="https://youth.seoul.go.kr/notice?id=123&utm_source=other")]})
    assert len(discover()[0]) == 1


@pytest.mark.parametrize("stream,code", [
    ([{"type": "turn.completed"}], "missing_search"),
    (events()[:-1], "missing_search"),
    ([{"type": "item.completed", "item": {"type": "command_execution"}}], "unexpected_tool"),
    ([{"type": "turn.failed"}], "turn_failed"),
    ([{"type": "unknown.tool"}], "invalid_event"),
])
def test_reject_missing_search_completion_or_unexpected_tools(launch, stream, code):
    launch(stream=stream)
    with pytest.raises(public.CodexRunError, match=code):
        discover()


@pytest.mark.parametrize("payload", [
    {"candidates": [candidate(url="https://evil.com/")]},
    {"candidates": [candidate()] * 11},
    {"candidates": [candidate(evidence_status="verified")]},
])
def test_invalid_candidates_fail_closed(launch, payload):
    launch(payload=payload)
    with pytest.raises(public.CodexRunError, match="invalid_candidates"):
        discover()


def test_explicit_candidate_cap_and_empty_valid_search(launch):
    launch(payload={"candidates": [candidate(), candidate(url="https://www.nowon.kr/a")]})
    with pytest.raises(public.CodexRunError, match="invalid_candidates"):
        discover(max_candidates=1)
    launch(payload={"candidates": []})
    assert discover()[0] == []


def test_live_observer_stops_exceeded_search_budget(launch, monkeypatch):
    launch(stream=[{"type": "item.started", "item": {"type": "web_search", "id": str(i)}}
                   for i in range(4)], hanging=True)
    stopped = []
    monkeypatch.setattr(public, "stop_codex_process", lambda process: stopped.append(process))
    with pytest.raises(public.CodexRunError, match="search_limit"):
        discover()
    assert len(stopped) == 1


def test_timeout_stops_own_process(launch, monkeypatch):
    launch(hanging=True)
    stopped = []
    monkeypatch.setattr(public, "stop_codex_process", lambda process: stopped.append(process))
    times = iter([0.0, 11.0])
    monkeypatch.setattr(public.time, "monotonic", lambda: next(times))
    with pytest.raises(public.CodexRunError, match="discovery_timeout"):
        discover()
    assert len(stopped) == 1


@pytest.mark.parametrize("limit,code", [
    ("MAX_EVENT_BYTES", "event_limit"), ("MAX_RESULT_BYTES", "result_limit"),
    ("MAX_STDERR_BYTES", "stderr_limit"),
])
def test_file_size_limits(launch, monkeypatch, limit, code):
    launch(stderr=b"test stderr")
    monkeypatch.setattr(public, limit, 1)
    with pytest.raises(public.CodexRunError, match=code):
        discover()


@pytest.mark.parametrize("changes", [{"query": " "}, {"timeout": 9}, {"max_candidates": 11},
                                     {"max_candidates": True}, {"domains": ["127.0.0.1"]}])
def test_invalid_request_does_not_start_cli(monkeypatch, changes):
    monkeypatch.setattr(public.subprocess, "Popen", lambda *a, **k: pytest.fail("Started CLI"))
    with pytest.raises(ValueError):
        discover(**changes)
