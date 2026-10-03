"""Migration checksums tolerate Git newline conversion, never changed SQL contents."""

import hashlib
from unittest.mock import MagicMock, Mock

import pytest

from app.modules.storage import schema

SQL = b"-- Immutable migration\nCREATE TABLE synthetic (id INTEGER);\n"


def checksum(data):
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def migration(tmp_path, monkeypatch):
    root = tmp_path / "database"
    root.mkdir()
    path = root / "synthetic.sql"
    path.write_bytes(SQL)
    monkeypatch.setattr(schema, "BACKEND_ROOT", tmp_path)
    monkeypatch.setattr(schema, "MIGRATIONS", (path.name,))
    install_regions = Mock(return_value=0)
    monkeypatch.setattr(schema, "_install_regions", install_regions)
    inspector = Mock()
    inspector.get_table_names.return_value = []
    monkeypatch.setattr(schema, "inspect", Mock(return_value=inspector))
    engine = MagicMock()
    engine.dialect.name = "mysql"
    engine.url.database = "synthetic_test"
    connection = engine.connect.return_value.__enter__.return_value
    return path, engine, connection, install_regions


@pytest.mark.parametrize("stored_crlf", [False, True])
@pytest.mark.parametrize("checkout_crlf", [False, True])
def test_applied_migration_accepts_lf_crlf_without_rewriting_checksum(
    migration, stored_crlf, checkout_crlf,
):
    path, engine, connection, install_regions = migration
    stored = SQL.replace(b"\n", b"\r\n") if stored_crlf else SQL
    checkout = SQL.replace(b"\n", b"\r\n") if checkout_crlf else SQL
    path.write_bytes(checkout)
    connection.scalar.side_effect = [1, checksum(stored)]
    assert schema.initialize_policy_schema(engine) == {"applied": [], "region_rows": 0}
    assert connection.exec_driver_sql.call_count == 1  # Tracking-table IF NOT EXISTS only.
    assert "IF NOT EXISTS policy_schema_versions" in connection.exec_driver_sql.call_args.args[0]
    assert connection.execute.call_count == 1  # Advisory lock release only.
    assert "RELEASE_LOCK" in str(connection.execute.call_args.args[0])
    install_regions.assert_called_once()


@pytest.mark.parametrize("changed", [
    SQL.replace(b"INTEGER", b"TEXT"),
    SQL.replace(b"Immutable", b"Edited"),
    SQL.replace(b"id INTEGER", b"id  INTEGER"),
    b"\xef\xbb\xbf" + SQL,
    SQL.replace(b"\n", b"\r"),
])
def test_checksum_still_rejects_sql_or_other_byte_changes(migration, changed):
    path, engine, connection, install_regions = migration
    path.write_bytes(changed)
    connection.scalar.side_effect = [1, checksum(SQL)]
    with pytest.raises(RuntimeError, match="migration checksum differs"):
        schema.initialize_policy_schema(engine)
    assert connection.exec_driver_sql.call_count == 1
    assert connection.execute.call_count == 1
    assert "RELEASE_LOCK" in str(connection.execute.call_args.args[0])
    install_regions.assert_not_called()


def test_new_migration_records_canonical_lf_checksum(migration):
    path, engine, connection, _ = migration
    path.write_bytes(SQL.replace(b"\n", b"\r\n"))
    connection.scalar.side_effect = [1, None]
    assert schema.initialize_policy_schema(engine)["applied"] == [path.name]
    insert = connection.execute.call_args_list[0]
    assert "INSERT INTO policy_schema_versions" in str(insert.args[0])
    assert insert.args[1] == {"v": path.name, "c": checksum(SQL)}
