from unittest.mock import MagicMock

import pytest

from scripts import mysql_dev


def test_other_database_directory_is_never_shutdown(tmp_path, monkeypatch):
    monkeypatch.setattr(mysql_dev, "DATA", tmp_path / "owned")
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (str(tmp_path / "other-project"),)
    with pytest.raises(RuntimeError, match="refusing access"):
        mysql_dev.verify_instance(connection)
    cursor.execute.assert_called_once_with("SELECT @@datadir")


def test_initialize_preserves_existing_data(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    original = data / "existing-data"
    original.write_text("keep", encoding="utf-8")
    monkeypatch.setattr(mysql_dev, "DATA", data)
    with pytest.raises(RuntimeError, match="refusing initialization"):
        mysql_dev.initialize(tmp_path / "mysqld.exe", 3307)
    assert original.read_text(encoding="utf-8") == "keep"


def test_setup_preserves_another_configured_database(tmp_path, monkeypatch):
    monkeypatch.setattr(mysql_dev, "BACKEND", tmp_path)
    env_file = tmp_path / ".env"
    original = "DB_ENABLED=true\nDB_HOST=other-project\nDB_PORT=3306\n"
    env_file.write_text(original, encoding="utf-8")
    with pytest.raises(RuntimeError, match="preserved"):
        mysql_dev.write_application_env({"port": 3307, "app_password": "example"})
    assert env_file.read_text(encoding="utf-8") == original


def test_mysql_inspection_is_read_only_when_not_configured(tmp_path, monkeypatch):
    state_path = tmp_path / "not-created/credentials.json"
    monkeypatch.setattr(mysql_dev, "STATE", state_path)
    assert mysql_dev.inspect_instance() == {
        "configured": False, "controllable": False, "running": False, "ready": False}
    assert not state_path.parent.exists()


def test_mysql_inspection_never_connects_to_an_external_database(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace

    from app.core import config

    state_path = tmp_path / "credentials.json"
    original = json.dumps({"port": 3307})
    state_path.write_text(original, encoding="utf-8")
    monkeypatch.setattr(mysql_dev, "STATE", state_path)
    monkeypatch.setattr(config, "load_settings", lambda: SimpleNamespace(
        db_enabled=True, db_host="another-database.invalid", db_port=3307))
    monkeypatch.setattr(mysql_dev, "port_open", lambda _: pytest.fail("must not probe"))
    assert mysql_dev.inspect_instance()["controllable"] is False
    assert state_path.read_text(encoding="utf-8") == original


@pytest.mark.skipif(mysql_dev.os.name != "nt", reason="Windows MySQL helper")
def test_restart_checks_prerequisites_before_shutting_down_a_running_db(tmp_path, monkeypatch):
    import json

    state_path = tmp_path / "credentials.json"
    original = json.dumps({"port": 3307, "executable": str(tmp_path / "missing.exe")})
    state_path.write_text(original, encoding="utf-8")
    monkeypatch.setattr(mysql_dev, "STATE", state_path)
    monkeypatch.setattr(mysql_dev, "INSTANCE", tmp_path)
    monkeypatch.setattr(mysql_dev, "CONFIG", tmp_path / "my.ini")
    monkeypatch.setattr(mysql_dev.sys, "argv", ["mysql_dev.py", "restart"])
    monkeypatch.setattr(mysql_dev, "stop", lambda _: pytest.fail("must not stop the DB"))
    with pytest.raises(SystemExit):
        mysql_dev.main()
    assert state_path.read_text(encoding="utf-8") == original
    assert not (tmp_path / "operation.lock").exists()
