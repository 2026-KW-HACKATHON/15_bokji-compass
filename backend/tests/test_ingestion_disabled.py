"""Pausing collection must avoid all database, network and model dependencies."""

import json

from app.core.config import Settings
from app.modules.ingestion import __main__ as cli
from app.modules.ingestion import public as worker


def paused_settings():
    return Settings(
        _env_file=None,
        ingestion_enabled=False,
        db_enabled=True,
        db_password="offline-test-only",
        data_go_kr_api_key="offline-test-only",
        bokjiro_api_key="offline-test-only",
        ingestion_discovery_enabled=True,
    )


def forbidden(*_args, **_kwargs):
    raise AssertionError("Paused collection must not access external dependencies")


class ForbiddenStore:
    def __getattr__(self, name):
        raise AssertionError(f"Paused collection must not access the store: {name}")


def test_paused_tick_skips_schema_signature_network_model_and_raw_files(tmp_path, monkeypatch):
    raw_path = tmp_path / "must-not-exist"
    monkeypatch.setattr(worker, "processing_signature", forbidden)
    monkeypatch.setattr(worker, "available_memory_mb", forbidden)
    result = worker.run_tick(
        paused_settings(),
        ForbiddenStore(),
        ForbiddenStore(),
        adapters={"gov24": forbidden, "bokjiro": forbidden, "bokjiro_detail": forbidden},
        parser=forbidden,
        discovery_fn=forbidden,
        notice_fetcher=forbidden,
        raw_root=raw_path,
    )
    assert result == {"status": "disabled", "reason": "collection_disabled"}
    assert not raw_path.exists()


def test_paused_live_cli_does_not_construct_any_database_or_run_worker(monkeypatch, capsys):
    monkeypatch.setattr(cli, "load_settings", paused_settings)
    for name in ("create_database_engine", "IngestionRepository", "PolicyRepository", "run_tick"):
        monkeypatch.setattr(cli, name, forbidden)
    assert cli.main(["tick", "--live"]) == 0
    assert json.loads(capsys.readouterr().out) == {
        "status": "disabled", "reason": "collection_disabled"
    }
