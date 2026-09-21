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
