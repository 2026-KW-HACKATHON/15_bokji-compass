"""Schedule CLI selection, previews, explicit writes and safe errors; no live services."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.modules.schedules import __main__ as cli


@pytest.fixture
def services(monkeypatch):
    engine = SimpleNamespace(dispose=Mock())
    repository = object()
    records = [{"policy_key": f"gov24:{index}", "title": f"공고 {index}",
                "period": "기간 확인 필요", "schedule": {"scheduleStatus": "unknown"},
                "record": {"policy_key": f"gov24:{index}",
                           "revision_id": f"published-revision-{index}"}} for index in (1, 2)]
    load = Mock(return_value=SimpleNamespace(db_enabled=True))
    period = {"text": "매년 4월 말까지",
              "evidence": [{"source_field": "text", "quote": "매년 4월 말까지"}]}
    prepare = Mock(return_value={
        "status": "resolved", "draft": {"overview": {"application_period": period}},
        "attempts": [{"source_url": "https://official.go.kr/notice", "reason": "원문 확인"}],
    })
    save = Mock(return_value={"revision_id": "new-revision", "reused": False})
    monkeypatch.setattr(cli, "load_settings", load)
    monkeypatch.setattr(cli, "create_database_engine", lambda settings: engine)
    monkeypatch.setattr(cli, "PolicyRepository", lambda received, **options: repository)
    monkeypatch.setattr(cli, "audit_schedules", lambda received: records)
    monkeypatch.setattr(cli, "prepare_repair", prepare)
    monkeypatch.setattr(cli, "save_repair", save)
    return SimpleNamespace(engine=engine, load=load, prepare=prepare, save=save)


def test_audit_is_read_only_and_does_not_print_internal_records(services, capsys):
    assert cli.main(["audit"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["count"] == 2
    assert "record" not in report["items"][0]
    services.prepare.assert_not_called()
    services.save.assert_not_called()
    services.engine.dispose.assert_called_once()


def test_preview_stores_evidence_and_isolates_selected_policy_attempt_paths(
    services, tmp_path, capsys,
):
    assert cli.main(["repair", "--policy-key", "gov24:1", "--policy-key", "gov24:2",
                     "--output", str(tmp_path)]) == 0
    summary = json.loads(capsys.readouterr().out)
    report = json.loads(open(summary["output"], encoding="utf-8").read())
    assert summary["status"] == "preview"
    assert report["apply"] is False
    period = report["items"][0]["draft"]["overview"]["application_period"]
    assert period["evidence"][0]["quote"] == "매년 4월 말까지"
    assert report["items"][0]["attempts"][0]["source_url"] == "https://official.go.kr/notice"
    paths = [call.args[2] for call in services.prepare.call_args_list]
    assert len(set(paths)) == 2
    assert all(path.parent == paths[0].parent and not path.exists() for path in paths)
    services.save.assert_not_called()


def test_apply_saves_only_resolved_drafts_and_reports_unresolved_records(
    services, tmp_path, capsys,
):
    services.prepare.side_effect = [services.prepare.return_value,
                                    {"status": "unresolved", "draft": None, "attempts": []}]
    assert cli.main(["repair", "--policy-key", "gov24:1", "gov24:2", "--apply",
                     "--output", str(tmp_path)]) == 1
    summary = json.loads(capsys.readouterr().out)
    report = json.loads(open(summary["output"], encoding="utf-8").read())
    assert summary["status"] == "partial"
    assert report["resolved"] == report["unresolved"] == 1
    assert report["items"][0]["saved"]["revision_id"] == "new-revision"
    assert "saved" not in report["items"][1]
    services.save.assert_called_once()


@pytest.mark.parametrize("arguments", [
    ["repair", "--output", "unused"],
    ["repair", "--policy-key", *[f"gov24:{index}" for index in range(11)], "--output", "unused"],
    ["repair", "--policy-key", "gov24:1", "gov24:1", "--output", "unused"],
    ["repair", "--policy-key", "gov24:1", "gov24:2", "--url", "https://official.go.kr",
     "--output", "unused"],
    ["repair", "--policy-key", "gov24:1", "--search", "--output", "unused"],
])
def test_invalid_selection_never_connects_or_calls_models(services, arguments):
    with pytest.raises(SystemExit) as error:
        cli.main(arguments)
    assert error.value.code == 2
    services.load.assert_not_called()
    services.prepare.assert_not_called()
    services.save.assert_not_called()


def test_missing_published_key_is_rejected_before_any_repair_or_write(services, tmp_path, capsys):
    assert cli.main(["repair", "--policy-key", "gov24:1", "gov24:missing", "--apply",
                     "--output", str(tmp_path)]) == 1
    assert json.loads(capsys.readouterr().out)["error_type"] == "PolicyNotFound"
    assert not list(tmp_path.iterdir())
    services.prepare.assert_not_called()
    services.save.assert_not_called()


@pytest.mark.parametrize("error_class", [RuntimeError, TypeError])
def test_errors_do_not_echo_credentials_and_dispose_connections(
    services, monkeypatch, capsys, error_class,
):
    error = error_class("secret-api-key=test-secret")
    monkeypatch.setattr(cli, "audit_schedules", Mock(side_effect=error))
    assert cli.main(["audit"]) == 1
    output = capsys.readouterr().out
    assert "test-secret" not in output
    assert json.loads(output)["error_type"] == error_class.__name__
    services.engine.dispose.assert_called_once()


def test_apply_error_retains_preview_evidence_without_echoing_credentials(
    services, tmp_path, capsys,
):
    services.save.side_effect = TypeError("secret-api-key=test-secret")
    arguments = ["repair", "--policy-key", "gov24:1", "--apply", "--output", str(tmp_path)]
    assert cli.main(arguments) == 1
    output = capsys.readouterr().out
    report_text = open(json.loads(output)["output"], encoding="utf-8").read()
    assert "test-secret" not in output + report_text
    item = json.loads(report_text)["items"][0]
    assert item["status"] == "failed"
    assert item["error_type"] == "TypeError"
    period = item["draft"]["overview"]["application_period"]
    assert period["evidence"][0]["quote"] == "매년 4월 말까지"
    assert item["attempts"][0]["source_url"] == "https://official.go.kr/notice"
