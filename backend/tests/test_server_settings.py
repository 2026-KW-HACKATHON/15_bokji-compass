"""Offline server settings editing against synthetic dotenv files only."""

import json
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event

import pytest
from dotenv import dotenv_values

from app.core.config import Settings
from app.modules.server_admin import settings as editor


@pytest.fixture(autouse=True)
def isolate_config_environment(monkeypatch):
    for key in tuple(os.environ):
        if key.lower() in editor.EDITABLE_FIELDS:
            monkeypatch.delenv(key)


@pytest.fixture
def configured(tmp_path):
    path = tmp_path / "synthetic.env"
    path.write_text("# preserved comment\nUNRELATED='preserved value'\n", encoding="utf-8")
    return path, Settings(_env_file=None, app_env="test")


def save(path, settings, changes):
    revision = editor.get_view(path, settings)["revision"]
    return editor.save_changes(path, settings, revision, changes)


def test_view_has_metadata_and_no_secret_values(configured):
    path, settings = configured
    path.write_text("DB_PASSWORD='synthetic-db-secret'\nBOKJIRO_API_KEY='synthetic-key'\n",
                    encoding="utf-8")
    view = editor.get_view(path, settings)
    assert view["secret_configured"] == {
        "db_password": True, "data_go_kr_api_key": False, "bokjiro_api_key": True,
    }
    serialized = json.dumps(view)
    assert "synthetic-db-secret" not in serialized
    assert "synthetic-key" not in serialized
    assert not editor.SECRET_FIELDS.intersection(view["values"])
    fields = {field["name"]: field for field in view["fields"]}
    assert fields["ingestion_page_size"]["maximum"] == 100
    assert fields["db_password"]["kind"] == "secret"
    assert fields["db_port"]["restart_required"] is True
    assert "auth_enabled" not in fields
    assert "codex_executable" not in fields


def test_save_preserves_unknown_values_and_comments_and_normalizes_duplicates(configured):
    path, settings = configured
    original = ("# 설명\r\nUNRELATED='preserved\\value' # untouched\r\n"
                "export INGESTION_PAGE_SIZE=12 # batch note\r\n"
                "ingestion_page_size='14' # duplicate note\r\n# ending\r\n")
    path.write_bytes(original.encode("utf-8"))
    result = save(path, settings, {"ingestion_page_size": 10})
    raw = path.read_bytes().decode("utf-8")
    assert "# 설명\r\nUNRELATED='preserved\\value' # untouched\r\n" in raw
    assert "INGESTION_PAGE_SIZE='10' # batch note\r\n" in raw
    assert "# duplicate note\r\n# ending\r\n" in raw
    assert len([line for line in raw.splitlines() if line.startswith("INGESTION_PAGE_SIZE=")]) == 1
    assert result["values"]["ingestion_page_size"] == 10
    assert result["restart_required"] is False
    assert result["worker_reload_fields"] == ["ingestion_page_size"]


def test_write_only_secrets_roundtrip_special_characters_without_echo(configured):
    path, settings = configured
    value = "synthetic\\secret's \"quote\" #dollar$"
    result = save(path, settings, {"data_go_kr_api_key": value})
    assert dotenv_values(path)["DATA_GO_KR_API_KEY"] == value
    desired = editor.configured_settings(path, settings)
    assert desired.data_go_kr_api_key.get_secret_value() == value
    assert value not in json.dumps(result)
    assert result["secret_configured"]["data_go_kr_api_key"] is True
    cleared = save(path, settings, {"data_go_kr_api_key": ""})
    assert cleared["secret_configured"]["data_go_kr_api_key"] is False


def test_database_changes_stay_staged_for_restart(configured):
    path, settings = configured
    result = save(path, settings, {"db_enabled": True, "db_password": "synthetic-only",
                                  "db_port": 3308})
    assert settings.db_enabled is False
    assert settings.db_port == 3307
    assert result["restart_required"] is True
    assert result["restart_fields"] == ["db_enabled", "db_password", "db_port"]
    assert result["worker_reload_fields"] == []
    current = editor.configured_settings(path, settings)
    assert current.db_enabled is True
    assert editor.get_view(path, current)["restart_fields"] == []


@pytest.mark.parametrize("changes", [
    {"auth_enabled": False}, {"server_port": 9999}, {"codex_executable": "untrusted.exe"},
    {"ingestion_page_size": "10"}, {"ingestion_page_size": True},
    {"ingestion_page_size": 101}, {"ingestion_discovery_enabled": "true"},
    {"ingestion_discovery_domains": []}, {"ingestion_discovery_domains": ["localhost"]},
    {"ingestion_discovery_domains": ["https://www.nowon.kr"]},
    {"ingestion_discovery_domains": ["127.0.0.1"]},
    {"ingestion_discovery_query": ""}, {"db_password": None},
    {"db_password": "synthetic\nAUTH_ENABLED=false"},
    {"bokjiro_api_key": "${UNKNOWN_ENV}"},
    {"ingestion_http_interval_seconds": float("nan")},
    {"ingestion_page_size": 50, "ingestion_queue_limit": 49},
    {"db_enabled": True}, {},
])
def test_invalid_edits_never_modify_file_or_echo_values(configured, changes):
    path, settings = configured
    original = path.read_bytes()
    with pytest.raises(editor.SettingsInputError) as error:
        save(path, settings, changes)
    assert path.read_bytes() == original
    assert "synthetic" not in str(error.value)
    assert "${UNKNOWN_ENV}" not in str(error.value)


def test_environment_managed_value_is_readonly(configured, monkeypatch):
    path, _ = configured
    path.write_text("INGESTION_MAX_JOBS='3'\n", encoding="utf-8")
    monkeypatch.setenv("INGESTION_MAX_JOBS", "7")
    settings = Settings(_env_file=None, app_env="test")
    view = editor.get_view(path, settings)
    assert view["env_overrides"] == ["ingestion_max_jobs"]
    assert view["values"]["ingestion_max_jobs"] == 7
    with pytest.raises(editor.SettingsInputError) as error:
        editor.save_changes(path, settings, view["revision"], {"ingestion_max_jobs": 4})
    assert error.value.code == "setting_managed_by_environment"
    assert path.read_text(encoding="utf-8") == "INGESTION_MAX_JOBS='3'\n"


def test_two_concurrent_writers_cannot_lose_an_edit(configured):
    path, settings = configured
    revision = editor.get_view(path, settings)["revision"]
    barrier = Barrier(2)

    def update(value):
        barrier.wait(timeout=5)
        try:
            editor.save_changes(path, settings, revision, {"ingestion_max_jobs": value})
            return "saved"
        except editor.SettingsConflict as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(update, value) for value in (3, 4)]
        results = sorted(future.result(timeout=10) for future in futures)
        assert results == ["config_changed", "saved"]
    assert editor.get_view(path, settings)["values"]["ingestion_max_jobs"] in {3, 4}


@pytest.mark.skipif(os.name != "nt", reason="Windows mandatory byte-range locking")
def test_empty_lock_file_is_not_initialized_while_another_writer_holds_it(configured, monkeypatch):
    import msvcrt

    path, settings = configured
    original = path.read_bytes()
    revision = editor.get_view(path, settings)["revision"]
    lock_path = path.with_name(path.name + ".server-admin.lock")
    holder = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    real_lock, real_write = msvcrt.locking, os.write
    attempted = Event()

    def observe_lock(descriptor, mode, size):
        try:
            return real_lock(descriptor, mode, size)
        finally:
            if descriptor != holder and mode == msvcrt.LK_NBLCK:
                attempted.set()

    def observe_write(descriptor, value):
        try:
            return real_write(descriptor, value)
        finally:
            attempted.set()

    try:
        # Windows locks byte ranges beyond EOF. This is the exact interval between a
        # new writer acquiring the first byte and initializing an empty lock file.
        real_lock(holder, msvcrt.LK_NBLCK, 1)
        assert lock_path.stat().st_size == 0
        monkeypatch.setattr(msvcrt, "locking", observe_lock)
        monkeypatch.setattr(editor.os, "write", observe_write)
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(editor.save_changes, path, settings, revision,
                                     {"ingestion_max_jobs": 3})
            try:
                assert attempted.wait(timeout=5)
                assert path.read_bytes() == original
            finally:
                os.lseek(holder, 0, os.SEEK_SET)
                real_lock(holder, msvcrt.LK_UNLCK, 1)
            assert future.result(timeout=5)["values"]["ingestion_max_jobs"] == 3
        assert lock_path.read_bytes() == b"\0"
    finally:
        os.close(holder)


def test_file_changed_manually_rejects_stale_revision(configured):
    path, settings = configured
    revision = editor.get_view(path, settings)["revision"]
    path.write_text("# external edit\n", encoding="utf-8")
    with pytest.raises(editor.SettingsConflict):
        editor.save_changes(path, settings, revision, {"ingestion_max_jobs": 3})
    assert path.read_text(encoding="utf-8") == "# external edit\n"


def test_replace_failure_keeps_original_and_removes_temporary_secret(configured, monkeypatch):
    path, settings = configured
    original = path.read_bytes()

    def refuse(*_):
        raise OSError("synthetic filesystem failure")

    monkeypatch.setattr(editor.os, "replace", refuse)
    with pytest.raises(editor.SettingsWriteError) as error:
        save(path, settings, {"data_go_kr_api_key": "synthetic-write-secret"})
    assert error.value.code == "config_write_failed"
    assert "synthetic-write-secret" not in str(error.value)
    assert path.read_bytes() == original
    assert not list(path.parent.glob(".server-settings-*"))


def test_new_file_and_domain_allowlist_are_serialized_for_normal_loader(tmp_path):
    path = tmp_path / "new.env"
    settings = Settings(_env_file=None, app_env="test")
    result = save(path, settings, {"ingestion_discovery_domains": ["WWW.NOWON.KR", "www.nowon.kr"],
                                  "ingestion_discovery_query": "노원구 복지 모집 공고",
                                  "policy_auto_publish": False})
    assert result["values"]["ingestion_discovery_domains"] == ["www.nowon.kr"]
    loaded = Settings(_env_file=path, app_env="test")
    assert loaded.ingestion_discovery_query == "노원구 복지 모집 공고"
    assert loaded.ingestion_discovery_domains == ["www.nowon.kr"]
    assert loaded.policy_auto_publish is False


@pytest.mark.parametrize("raw", [b"BOKJIRO_API_KEY='unclosed", b"\xff"])
def test_invalid_existing_configuration_refuses_edit(configured, raw):
    path, settings = configured
    path.write_bytes(raw)
    with pytest.raises(editor.SettingsInputError):
        editor.get_view(path, settings)
    assert path.read_bytes() == raw


def test_config_path_resolution_matches_backend_loader(monkeypatch):
    from app.core.config import BACKEND_ROOT

    monkeypatch.setenv("APP_CONFIG_FILE", "synthetic/path.env")
    assert editor.resolve_config_path() == BACKEND_ROOT / "synthetic/path.env"


def test_symlink_config_is_refused(tmp_path):
    target, alias = tmp_path / "target.env", tmp_path / "alias.env"
    target.write_text("# synthetic\n", encoding="utf-8")
    try:
        alias.symlink_to(target)
    except OSError:
        pytest.skip("Host does not permit synthetic symlinks")
    with pytest.raises(editor.SettingsWriteError):
        editor.get_view(alias, Settings(_env_file=None))
