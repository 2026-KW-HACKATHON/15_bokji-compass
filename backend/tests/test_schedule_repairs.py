"""Schedule repairs use cited full text, immutable drafts and guarded publication."""

from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import Column, MetaData, String, Table

from app.contracts.parsing import SourcePolicy
from app.core.config import Settings
from app.modules.ingestion import web
from app.modules.normalization.public import normalize_conditions
from app.modules.schedules import __main__ as cli
from app.modules.schedules import public
from app.modules.storage.publication import PublicationConflict
from app.modules.storage.repository import validate_draft
from tests.test_raw_parsing import extraction, overview, source

PERIOD = "2026년 10월 1일부터 10월 31일까지"


@pytest.fixture
def record():
    original = source().model_dump()
    original["fields"]["application_method"] = f"신청 기간: {PERIOD}. 온라인 신청"
    original["fields"]["documents"] = "신분증, 재학증명서"
    analysis = extraction()
    draft = {
        "schema_version": "welfare-parsing-v2", "source": original,
        "review_status": "draft", "matching_enabled": False, "status": "needs_review",
        "analysis": analysis.model_dump(), "canonical": normalize_conditions(analysis).model_dump(),
        "overview": overview().model_dump(), "overview_status": "validated", "attempts": [],
    }
    validate_draft(draft)
    return {"policy_key": original["policy_key"], "revision_id": "published-parent",
            "source_json": original, "draft_json": draft}


def result(text=PERIOD, *, field="application_method", matches=True, reason="같은 사업 일정",
           expression=None):
    return public.PeriodExtraction.model_validate({
        "matches_policy": matches, "reason": reason,
        "application_period": {
            "status": "specified", "text": text,
            "evidence": [{"source_field": field, "quote": text}], "unresolved_reason": None,
        },
        **({"calendar_expression": expression} if expression is not None else {}),
    })


def missing():
    return public.PeriodExtraction.model_validate({
        "matches_policy": True, "reason": "신청 기간을 확인할 수 없음",
        "application_period": {"status": "not_stated", "text": None,
                               "evidence": [], "unresolved_reason": None},
    })


@pytest.mark.parametrize("field,text", [
    ("application_method", "2026년 11월 1일부터 11월 30일까지"),
    ("invented", PERIOD),
])
def test_source_quotes_and_field_names_must_be_present(record, monkeypatch, tmp_path, field, text):
    model = Mock(return_value=(result(text, field=field), {}))
    monkeypatch.setattr(public, "_extract_structured", model)
    with pytest.raises(ValueError, match="absent"):
        public.extract_period(SourcePolicy.model_validate(record["source_json"]),
                              Settings(_env_file=None), tmp_path)
    with pytest.raises(ValueError, match="Unverified"):
        public.build_repair(record, result(text, field=field))


def test_existing_full_source_repair_preserves_every_unrelated_condition(record):
    before = deepcopy(record)
    repaired = public.build_repair(record, result())
    assert repaired["source"] == before["source_json"]
    assert repaired["analysis"] == before["draft_json"]["analysis"]
    assert repaired["canonical"] == before["draft_json"]["canonical"]
    expected = deepcopy(before["draft_json"])
    expected["overview"]["application_period"] = result().application_period.model_dump()
    assert repaired == expected
    assert repaired["matching_enabled"] is False
    assert record == before


def test_official_reference_adds_only_cited_text_and_provenance(record):
    before = deepcopy(record)
    reference = {"title": "가상 정책 신청 안내", "text": f"지원 대상 안내\n{PERIOD}\n서류 안내",
                 "source_url": "https://support.go.kr/notice?id=1&utm_source=search#top"}
    repaired = public.build_repair(record, result(field=public.REFERENCE_FIELD),
                                   reference=reference)
    fields = repaired["source"]["fields"]
    for key, value in before["source_json"]["fields"].items():
        assert fields[key] == value
    assert fields[public.REFERENCE_FIELD] == PERIOD
    assert fields[public.REFERENCE_URL] == "https://support.go.kr/notice?id=1"
    assert repaired["source"]["source_hash"] != before["source_json"]["source_hash"]
    assert repaired["analysis"] == before["draft_json"]["analysis"]
    assert repaired["canonical"] == before["draft_json"]["canonical"]
    assert record == before
    validate_draft(repaired)


@pytest.mark.parametrize("reason", [
    "담당 기관이 다른 공고", "대상 지역이 다른 지자체 공고", "모집 회차가 다름",
])
def test_mismatched_reference_is_not_applied(record, reason):
    reference = {"title": "다른 기관 공고", "text": PERIOD,
                 "source_url": "https://support.go.kr/other"}
    assert public.build_repair(record, result(field=public.REFERENCE_FIELD, matches=False,
                                              reason=reason), reference=reference) is None


@pytest.mark.parametrize("source_period,reference_period,accepted", [
    ("2026년 모집, 접수 일정은 공고 확인", "2025년 4월 1일~4월 30일", False),
    ("2026년 모집, 접수 일정은 공고 확인", "2026년 4월 1일~4월 30일", True),
    ("매년 모집, 접수 일정은 공고 확인", "2025년 4월 1일~4월 30일", False),
    ("매년 모집, 접수 일정은 공고 확인", "2026년 4월 1일~4월 30일", True),
    ("매년 모집, 접수 일정은 공고 확인", "2027년 4월 1일~4월 30일", True),
])
def test_reference_year_matches_explicit_source_year_or_current_round(
    record, monkeypatch, source_period, reference_period, accepted,
):
    value = period_record(record, source_period)
    before = deepcopy(value)
    monkeypatch.setattr(public, "application_reference_year", lambda: 2026)
    reference = {"source_url": "https://support.go.kr/notice", "text": reference_period}
    repaired = public.build_repair(
        value, result(reference_period, field=public.REFERENCE_FIELD), reference=reference,
    )
    assert (repaired is not None) is accepted
    assert value == before


def test_search_snippet_is_never_saved_without_matching_fetched_body(record, monkeypatch, tmp_path):
    candidate = {"url": "https://support.go.kr/notice", "source_kind": "official_notice",
                 "evidence": PERIOD, "application_period": PERIOD}
    monkeypatch.setattr(public, "discover", Mock(return_value=([candidate], {"search": True})))
    body = {"source_url": candidate["url"],
            "text": "가상 정책 지원 대상 및 구비 서류 안내입니다. 일정은 별도 공지합니다."}
    monkeypatch.setattr(public, "fetch_notice", Mock(return_value=(body, b"public body")))
    model = Mock(side_effect=[(missing(), {}), (result(field=public.REFERENCE_FIELD), {})])
    monkeypatch.setattr(public, "_extract_structured", model)
    before = deepcopy(record)
    prepared = public.prepare_repair(record, Settings(_env_file=None), tmp_path,
                                     search=True, domains=("support.go.kr",))
    assert prepared["status"] == "unresolved" and prepared["draft"] is None
    assert model.call_args.kwargs["payload"]["reference"]["text"] == body["text"]
    assert PERIOD not in body["text"]
    assert record == before


@pytest.mark.parametrize("url", [
    "https://127.0.0.1/notice", "https://localhost/notice",
    "https://other.go.kr/notice", "https://support.go.kr.evil.example/notice",
    "https://support.go.kr:444/notice", "https://user:pass@support.go.kr/notice",
])
def test_internal_or_nonallowlisted_urls_never_reach_fetch(record, monkeypatch, tmp_path, url):
    monkeypatch.setattr(public, "extract_period", Mock(return_value=(missing(), {})))
    fetch = Mock()
    monkeypatch.setattr(public, "fetch_notice", fetch)
    prepared = public.prepare_repair(record, Settings(_env_file=None), tmp_path,
                                     domains=("support.go.kr",), urls=(url,))
    assert prepared["status"] == "unresolved"
    fetch.assert_not_called()


def test_dns_private_address_and_cross_domain_redirect_are_blocked(monkeypatch):
    monkeypatch.setattr(web.socket, "getaddrinfo", lambda *args, **kwargs: [
        (None, None, None, None, ("127.0.0.1", 443))])
    conn = Mock()
    monkeypatch.setattr(web, "PinnedHTTPSConnection", conn)
    with pytest.raises(RuntimeError, match="notice_private_address"):
        web.fetch_notice("https://support.go.kr/notice", ["support.go.kr"], public._FetchBudget())
    conn.assert_not_called()
    monkeypatch.setattr(web, "resolve_public", lambda *args: "8.8.8.8")
    response = SimpleNamespace(status=302, getheader=lambda key: "https://outside.go.kr/other")
    conn.return_value.getresponse.return_value = response
    with pytest.raises(ValueError, match="allowlist"):
        web.fetch_notice("https://support.go.kr/notice", ["support.go.kr"], public._FetchBudget())
    assert conn.call_count == 1


def test_redirect_budget_limits_requests_across_all_candidate_urls(record, monkeypatch, tmp_path):
    monkeypatch.setattr(public, "extract_period", Mock(return_value=(missing(), {})))
    monkeypatch.setattr(public.time, "monotonic", lambda: 100)
    monkeypatch.setattr(web, "resolve_public", lambda *args: "8.8.8.8")
    response = SimpleNamespace(status=302, getheader=lambda key: "/redirect-again")
    connection = Mock()
    connection.return_value.getresponse.return_value = response
    monkeypatch.setattr(web, "PinnedHTTPSConnection", connection)
    prepared = public.prepare_repair(record, Settings(_env_file=None), tmp_path,
                                     domains=("support.go.kr",),
                                     urls=tuple(f"https://support.go.kr/{i}" for i in range(5)))
    assert prepared["status"] == "unresolved"
    assert connection.call_count == 6
    assert len([attempt for attempt in prepared["attempts"] if attempt.get("error")]) == 3


def test_fetch_budget_stops_when_wall_clock_deadline_expires(monkeypatch):
    monkeypatch.setattr(public.time, "monotonic", lambda: 100)
    budget = public._FetchBudget()
    options = budget.before("notice")
    assert options == {"timeout": 15, "deadline": 145, "max_response_bytes": 2_000_000}
    monkeypatch.setattr(public.time, "monotonic", lambda: 146)
    with pytest.raises(TimeoutError, match="schedule_fetch_budget"):
        budget.before("notice")


def test_missing_overview_fails_with_a_clear_error_and_keeps_source(record):
    record["draft_json"]["overview"] = None
    before = deepcopy(record)
    with pytest.raises(ValueError, match="overview is required"):
        public.build_repair(record, result())
    assert record == before


def save_mocks(monkeypatch, record, *, parent_id="published-parent", manual=False, reused=False):
    connection = Mock()
    connection.execute.return_value.mappings.return_value.one.return_value = {
        "revision_id": parent_id, "draft_json": record["draft_json"],
    }
    catalog = Table("published", MetaData(), Column("policy_key", String))
    monkeypatch.setattr(public, "published_catalog", lambda repository: catalog)
    monkeypatch.setattr(public, "events_table", lambda repository: "events")
    monkeypatch.setattr(public, "has_manual_edits", lambda *args: manual)

    @contextmanager
    def transaction(repository, key):
        assert key == record["policy_key"]
        yield connection

    monkeypatch.setattr(public, "publication_transaction", transaction)
    publication = Mock()
    monkeypatch.setattr(public, "change_publication", publication)
    repository = SimpleNamespace(_save_revision=Mock(return_value=("new-revision", reused)),
                                 _save_legacy_policy=Mock())
    return repository, connection, publication


@pytest.mark.parametrize("parent_id,manual", [
    ("changed-parent", False), ("published-parent", True),
])
def test_changed_parent_or_any_manual_edit_blocks_save(record, monkeypatch, parent_id, manual):
    repaired = public.build_repair(record, result())
    repository, _, publication = save_mocks(monkeypatch, record, parent_id=parent_id, manual=manual)
    with pytest.raises(PublicationConflict):
        public.save_repair(repository, record, repaired)
    repository._save_revision.assert_not_called()
    repository._save_legacy_policy.assert_not_called()
    publication.assert_not_called()


def test_new_repair_shares_connection_for_revision_legacy_and_publication(record, monkeypatch):
    repaired = public.build_repair(record, result())
    repository, connection, publication = save_mocks(monkeypatch, record)
    assert public.save_repair(repository, record, repaired) == {
        "revision_id": "new-revision", "reused": False,
    }
    assert repository._save_revision.call_args.args[0] is connection
    assert repository._save_legacy_policy.call_args.args == (connection, repaired)
    assert publication.call_args.args[:3] == (repository, connection, "events")
    assert publication.call_args.kwargs["require_latest"] is True
    assert publication.call_args.kwargs["expected_status"] == "draft"


def test_reused_repair_does_not_republish_or_write_legacy_again(record, monkeypatch):
    repaired = public.build_repair(record, result())
    repository, _, publication = save_mocks(monkeypatch, record, reused=True)
    assert public.save_repair(repository, record, repaired)["reused"] is True
    repository._save_legacy_policy.assert_not_called()
    publication.assert_not_called()


def test_identical_current_draft_does_not_create_another_revision(record, monkeypatch):
    repaired = public.build_repair(record, result())
    record["draft_json"] = deepcopy(repaired)
    repository, _, publication = save_mocks(monkeypatch, record)
    assert public.save_repair(repository, record, repaired) == {
        "revision_id": record["revision_id"], "reused": True,
    }
    repository._save_revision.assert_not_called()
    repository._save_legacy_policy.assert_not_called()
    publication.assert_not_called()


def cli_mocks(monkeypatch, record):
    engine = Mock()
    repository = object()
    monkeypatch.setattr(cli, "load_settings", lambda: SimpleNamespace(db_enabled=True))
    monkeypatch.setattr(cli, "create_database_engine", Mock(return_value=engine))
    monkeypatch.setattr(cli, "PolicyRepository", lambda *args, **kwargs: repository)
    entry = {"policy_key": record["policy_key"], "title": "가상 정책", "period": "확인 필요",
             "schedule": {"scheduleStatus": "unknown"}, "record": record}
    monkeypatch.setattr(cli, "audit_schedules", Mock(return_value=[entry]))
    repaired = public.build_repair(record, result())
    prepare = Mock(return_value={"status": "resolved", "draft": repaired, "attempts": []})
    save = Mock(return_value={"revision_id": "new-revision", "reused": False})
    monkeypatch.setattr(cli, "prepare_repair", prepare)
    monkeypatch.setattr(cli, "save_repair", save)
    monkeypatch.setattr(cli, "_write_report", Mock())
    monkeypatch.setattr(cli, "_output_path", lambda value: Path(value))
    return engine, prepare, save


@pytest.mark.parametrize("apply", [False, True])
def test_cli_preview_never_saves_and_apply_requires_explicit_flag(
    record, monkeypatch, tmp_path, capsys, apply,
):
    engine, prepare, save = cli_mocks(monkeypatch, record)
    args = ["repair", "--policy-key", record["policy_key"], "--output", str(tmp_path)]
    if apply:
        args.append("--apply")
    assert cli.main(args) == 0
    assert prepare.call_count == 1
    assert save.call_count == int(apply)
    assert ('"status": "applied"' if apply else '"status": "preview"') in capsys.readouterr().out
    engine.dispose.assert_called_once()


@pytest.mark.parametrize("args", [
    ["--policy-key", "same", "same"],
    ["--policy-key", "a", "b", "--url", "https://support.go.kr/notice"],
    ["--policy-key", "a", "--search"],
    ["--policy-key", *[f"policy-{i}" for i in range(11)]],
])
def test_cli_rejects_unbounded_or_ambiguous_keys_before_connecting(monkeypatch, tmp_path, args):
    engine = Mock()
    monkeypatch.setattr(cli, "create_database_engine", engine)
    with pytest.raises(SystemExit) as error:
        cli.main(["repair", *args, "--output", str(tmp_path)])
    assert error.value.code == 2
    engine.assert_not_called()


def test_cli_missing_public_policy_does_not_run_models_or_save(record, monkeypatch, tmp_path):
    engine, prepare, save = cli_mocks(monkeypatch, record)
    assert cli.main(["repair", "--policy-key", "missing-policy", "--output", str(tmp_path)]) == 1
    prepare.assert_not_called()
    save.assert_not_called()
    engine.dispose.assert_called_once()


CALENDAR_EXPRESSIONS = [
    ("'25년 신청기한 : 2025.2.1.~2025.4.30.", "2025.2.1.~2025.4.30.",
     "dated", "2025-02-01", "2025-04-30"),
    ("예산범위내 상시신청", "상시신청", "ongoing", None, None),
    ("2026.1.~12.(※예산...)", "2026년1~12월", "dated", "2026-01-01", "2026-12-31"),
    ("매년9~10월 시 도를 통해공모", "매년9~10월", "dated", "2026-09-01", "2026-10-31"),
]


def period_record(record, period):
    value = deepcopy(record)
    value["source_json"]["fields"]["application_period"] = period
    value["draft_json"]["source"] = deepcopy(value["source_json"])
    return value


@pytest.mark.parametrize("period,expression,status,start,end", CALENDAR_EXPRESSIONS)
def test_normalized_calendar_rule_keeps_cited_period_and_all_other_source_fields(
    record, period, expression, status, start, end,
):
    from app.modules.storage.schedule_rules import resolve_calendar_schedule

    value = period_record(record, period)
    before = deepcopy(value)
    extracted = result(period, field="application_period", expression=expression)
    repaired = public.build_repair(value, extracted)
    assert repaired is not None
    assert repaired["source"] == before["source_json"]
    assert repaired["overview"]["application_period"] == extracted.application_period.model_dump()
    assert repaired["overview"]["application_period"]["text"] == period
    assert repaired["overview"]["application_period"]["evidence"][0]["quote"] == period
    assert repaired["analysis"] == before["draft_json"]["analysis"]
    assert repaired["canonical"] == before["draft_json"]["canonical"]
    if public.application_schedule(period)["scheduleStatus"] == "unknown":
        assert repaired.get("application_calendar")
    schedule = resolve_calendar_schedule(
        repaired["source"]["fields"], repaired["overview"], repaired.get("application_calendar"),
        reference_year=2026, reference_month=10,
    )
    assert schedule["scheduleStatus"] == status
    assert schedule["applicationStart"] == start
    assert schedule["applicationEnd"] == end
    assert value == before
    validate_draft(repaired)


@pytest.mark.parametrize("period,expression,status,start,end", CALENDAR_EXPRESSIONS)
def test_prepare_repair_reports_resolved_rule_schedule_after_original_quote_validation(
    record, monkeypatch, tmp_path, period, expression, status, start, end,
):
    value = period_record(record, period)
    before = deepcopy(value)
    extracted = result(period, field="application_period", expression=expression)
    model = Mock(return_value=(extracted, {"prompt_version": public.VERSION}))
    monkeypatch.setattr(public, "_extract_structured", model)
    prepared = public.prepare_repair(value, Settings(_env_file=None), tmp_path)
    assert prepared["status"] == "resolved"
    assert prepared["schedule"]["scheduleStatus"] == status
    assert prepared["schedule"]["applicationStart"] == start
    assert prepared["schedule"]["applicationEnd"] == end
    assert prepared["attempts"][0]["period"]["text"] == period
    assert model.call_args.kwargs["payload"]["target"]["fields"]["application_period"] == period
    assert value == before


@pytest.mark.parametrize("period,expression", [
    (PERIOD, None), ("매년9~10월 시 도를 통해공모", "매년9~10월"),
])
def test_repair_does_not_keep_a_calendar_expression_for_the_replaced_period(
    record, period, expression,
):
    old_period = "매년 4월 말일까지 신청을 받아요."
    value = period_record(record, period)
    value["source_json"]["fields"]["previous_application_period"] = old_period
    value["draft_json"]["source"] = deepcopy(value["source_json"])
    value["draft_json"]["overview"]["application_period"] = result(
        old_period, field="previous_application_period",
    ).application_period.model_dump()
    value["draft_json"]["overview"]["calendar_expression"] = "매년 4월 말까지"
    validate_draft(value["draft_json"])
    before = deepcopy(value)
    repaired = public.build_repair(value, result(period, field="application_period",
                                                expression=expression))
    assert repaired is not None
    assert repaired["overview"].get("calendar_expression") in (None, expression)
    assert repaired["overview"]["application_period"]["text"] == period
    assert repaired["source"] == before["source_json"]
    assert value == before
    validate_draft(repaired)


def test_calendar_expression_cannot_recombine_days_from_separate_cited_dates(record):
    period = "2026년 4월 1일부터 5월 30일까지 신청을 받아요."
    value = period_record(record, period)
    before = deepcopy(value)
    assert public.application_schedule(period)["scheduleStatus"] == "unknown"
    assert public.build_repair(value, result(
        period, field="application_period", expression="2026년 4월 30일~5월 1일",
    )) is None
    assert value == before
