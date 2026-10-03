"""Explicit, checksum-tracked MySQL migrations; never run from a request or parser."""

import hashlib
import re
from datetime import date

from sqlalchemy import MetaData, Table, insert, inspect, select, text

from app.core.config import BACKEND_ROOT
from app.modules.regions.public import default_catalog

MIGRATIONS = (
    "004_condition_schema.sql", "005_policy_ingestion.sql",
    "006_policy_publication.sql", "007_policy_collection.sql",
    "008_legacy_policy_projection.sql",
)


def _migration_checksums(data: bytes) -> tuple[str, set[str]]:
    """Keep historical raw hashes valid across Git LF/CRLF checkout conversion only."""
    lf = data.replace(b"\r\n", b"\n")
    canonical = hashlib.sha256(lf).hexdigest()
    accepted = {canonical, hashlib.sha256(data).hexdigest(),
                hashlib.sha256(lf.replace(b"\n", b"\r\n")).hexdigest()}
    return canonical, accepted


def initialize_policy_schema(engine) -> dict:
    if engine.dialect.name != "mysql":
        raise ValueError("Policy storage requires MySQL")
    with engine.connect() as connection:
        lock = "bokji-policy-schema:" + hashlib.sha256(
            str(engine.url.database).encode()).hexdigest()[:32]
        if connection.scalar(text("SELECT GET_LOCK(:name, 10)"), {"name": lock}) != 1:
            raise RuntimeError("Policy schema initialization is busy")
        try:
            connection.exec_driver_sql("""CREATE TABLE IF NOT EXISTS policy_schema_versions (
                version VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
                checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
            ) ENGINE=InnoDB""")
            connection.commit()
            applied = []
            for filename in MIGRATIONS:
                data = (BACKEND_ROOT / "database" / filename).read_bytes()
                checksum, accepted_checksums = _migration_checksums(data)
                prior = connection.scalar(text(
                    "SELECT checksum FROM policy_schema_versions WHERE version=:version"
                ), {"version": filename})
                if prior is not None:
                    if prior not in accepted_checksums:
                        raise RuntimeError("Applied policy migration checksum differs")
                    continue
                sql = re.sub(r"--[^\n]*", "", data.decode("utf-8-sig"))
                tables = re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", sql)
                conditional_tables = set(re.findall(
                    r"CREATE TABLE IF NOT EXISTS (\w+)", sql))
                existing = set(inspect(connection).get_table_names())
                conflicts = existing.intersection(tables) - conditional_tables
                if conflicts:
                    raise RuntimeError(
                        "Untracked or partial policy schema exists; preserve and inspect it "
                        "before migration. No tables were replaced.")
                # MySQL DDL commits implicitly. A partial migration is NOT reported as applied.
                for statement in sql.split(";"):
                    if statement.strip():
                        connection.exec_driver_sql(statement)
                if filename == "008_legacy_policy_projection.sql":
                    _ensure_policy_source_key(connection)
                connection.execute(text(
                    "INSERT INTO policy_schema_versions (version, checksum) VALUES (:v, :c)"
                ), {"v": filename, "c": checksum})
                connection.commit()
                applied.append(filename)
            connection.commit()
            count = _install_regions(connection)
            return {"applied": applied, "region_rows": count}
        finally:
            connection.rollback()
            connection.execute(text("SELECT RELEASE_LOCK(:name)"), {"name": lock})
            connection.commit()


def _ensure_policy_source_key(connection) -> None:
    columns = {column["name"] for column in inspect(connection).get_columns("policies")}
    if "source_key" not in columns:
        connection.exec_driver_sql(
            "ALTER TABLE policies ADD COLUMN source_key "
            "VARCHAR(255) COLLATE utf8mb4_bin NULL"
        )
    indexes = inspect(connection).get_indexes("policies")
    unique_source_key = any(
        index["unique"] and index["column_names"] == ["source_key"]
        for index in indexes
    )
    if not unique_source_key:
        if any(index["name"] == "uq_policies_source_key" for index in indexes):
            raise RuntimeError("Existing policies source-key index is incompatible")
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX uq_policies_source_key ON policies (source_key)"
        )
    connection.commit()


def _install_regions(connection) -> int:
    catalog = default_catalog()
    metadata = MetaData()
    snapshots = Table("condition_region_snapshots", metadata, autoload_with=connection)
    regions = Table("condition_regions", metadata, autoload_with=connection)
    connection.commit()
    with connection.begin():
        prior = connection.execute(select(snapshots).where(
            snapshots.c.version == catalog.version)).mappings().first()
        if prior:
            if (prior["csv_sha256"] != catalog.metadata["csv_sha256"]
                    or prior["archive_sha256"] != catalog.metadata["archive_sha256"]):
                raise RuntimeError("Stored region snapshot differs")
            return 0
        source = catalog.metadata
        connection.execute(insert(snapshots).values(
            version=catalog.version, effective_date=date.fromisoformat(catalog.as_of),
            source_url=source["source_url"], archive_sha256=source["archive_sha256"],
            csv_sha256=source["csv_sha256"], metadata_json=source))
        anomalies = {(r["system"], r["code"]) for r in source["source_anomalies"]}
        rows = [dict(
            snapshot_version=catalog.version, code_system=r.system, code=r.code, name=r.name,
            parent_code=catalog.parents.get((r.system, r.code)),
            valid_from=date.fromisoformat(r.valid_from),
            valid_to=date.fromisoformat(r.valid_to) if r.valid_to else None,
            source_anomaly=(r.system, r.code) in anomalies,
        ) for r in catalog.rows]
        for offset in range(0, len(rows), 1000):
            connection.execute(insert(regions), rows[offset:offset + 1000])
        return len(rows)
