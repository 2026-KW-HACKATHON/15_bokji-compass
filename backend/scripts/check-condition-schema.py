"""Verify condition DDL in a new disposable MySQL process; never read backend/.env."""

import argparse
import json
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pymysql

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.modules.regions.public import default_catalog  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mysqld", type=Path, required=True)
    args = parser.parse_args()
    executable = args.mysqld.resolve(strict=True)
    root = BACKEND / ".cache/condition-schema-tests"
    root.mkdir(parents=True, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix="run-", dir=root))
    data = run / "data"
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = [str(executable), "--no-defaults", f"--basedir={executable.parent.parent}",
            f"--datadir={data}"]
    process = connection = None
    with (run / "mysql.log").open("wb") as log:
        subprocess.run([*base, "--initialize-insecure"], stdout=log, stderr=log,
                       check=True, timeout=60, **options)
        try:
            process = subprocess.Popen(
                [*base, "--bind-address=127.0.0.1", f"--port={port}",
                 "--mysqlx=OFF", "--skip-log-bin"], stdout=log, stderr=log, **options)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f"Isolated MySQL exited; inspect {run}")
                try:
                    candidate = pymysql.connect(host="127.0.0.1", port=port, user="root",
                                                charset="utf8mb4", connect_timeout=1,
                                                autocommit=True)
                    with candidate.cursor() as cursor:
                        cursor.execute("SELECT @@datadir")
                        actual_data = Path(cursor.fetchone()[0]).resolve()
                    if actual_data != data.resolve():
                        candidate.close()
                        raise RuntimeError("Port belongs to another MySQL instance; refused")
                    connection = candidate
                    break
                except pymysql.OperationalError:
                    time.sleep(0.2)
            if connection is None:
                raise RuntimeError("Isolated MySQL startup timeout")
            with connection.cursor() as cur:
                cur.execute("SELECT VERSION()")
                version = cur.fetchone()[0]
                cur.execute("CREATE DATABASE condition_contract_test CHARACTER SET utf8mb4")
                cur.execute("USE condition_contract_test")
                ddl = (BACKEND / "database/004_condition_schema.sql").read_text(encoding="utf-8")
                for statement in "\n".join(
                    line for line in ddl.splitlines() if not line.strip().startswith("--")
                ).split(";"):
                    if statement.strip():
                        cur.execute(statement)
                catalog = default_catalog()
                meta = catalog.metadata
                cur.execute("INSERT INTO condition_region_snapshots VALUES (%s,%s,%s,%s,%s,%s)",
                            (catalog.version, catalog.as_of, meta["source_url"],
                             meta["archive_sha256"], meta["csv_sha256"], json.dumps(meta)))
                anomalies = {(a["system"], a["code"]) for a in meta["source_anomalies"]}
                rows = [(catalog.version, r.system, r.code, r.name,
                         catalog.parents.get((r.system, r.code)), r.valid_from, r.valid_to or None,
                         (r.system, r.code) in anomalies) for r in catalog.rows]
                for offset in range(0, len(rows), 1000):
                    cur.executemany(
                        "INSERT INTO condition_regions VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                        rows[offset:offset + 1000])
                cur.execute("SELECT COUNT(*) FROM condition_regions")
                assert cur.fetchone()[0] == len(rows)
                revision = "00000000-0000-0000-0000-000000000001"
                cur.execute("INSERT INTO condition_documents "
                            "(revision_id,policy_key,source_hash,schema_version,"
                            "region_snapshot_version,source_json,extraction_json,canonical_json) "
                            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                            (revision, "synthetic:test", "a" * 64, "welfare-conditions-v2",
                             catalog.version, "{}", "{}", "{}"))
                insert = ("INSERT INTO condition_entries "
                          "(revision_id,condition_id,field_key,source_field_key,subject,state_code,"
                          "operator,value_json,role,source_field,evidence_quote,unknown_reason,"
                          "review_note) VALUES (%s,%s,'income','income','applicant',%s,%s,%s,"
                          "'eligibility','eligibility',%s,%s,'synthetic check')")
                for index, (state, op, value, evidence, reason) in enumerate([
                    (0, None, None, "제한 없음", None),
                    (1, "EQ", '{"kind":"DECIMAL","number":"0"}', "무소득", None),
                    (1, "EQ", '{"kind":"BOOLEAN","boolean":false}', "무주택", None),
                    (9, None, None, None, "NOT_STATED"),
                ]):
                    cur.execute(insert, (revision, f"valid-{index}", state, op, value,
                                         evidence, reason))
                rejected = 0
                for index, values in enumerate([
                    (1, None, None, "근거", None), (0, "EQ", "{}", "근거", None),
                    (9, None, None, None, None), (1, "EQ", "{}", None, None),
                    (8, None, None, "근거", None),
                ]):
                    try:
                        cur.execute(insert, (revision, f"invalid-{index}", *values))
                    except pymysql.MySQLError as error:
                        if error.args[0] != 3819:
                            raise
                        rejected += 1
                assert rejected == 5
                try:
                    cur.execute("UPDATE condition_documents SET matching_enabled=TRUE")
                except pymysql.MySQLError as error:
                    if error.args[0] != 3819:
                        raise
                else:
                    raise AssertionError("Unpublished matching must fail")
                print(json.dumps({"mysql_version": version, "region_rows": len(rows),
                                  "valid_states": 4, "rejected_states": rejected,
                                  "publication_guard": "passed", "log_directory": str(run)}))
        finally:
            if connection is not None:
                try:
                    with connection.cursor() as cur:
                        cur.execute("SHUTDOWN")
                except pymysql.MySQLError:
                    pass
                connection.close()
            if process is not None:
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    process.wait(timeout=10)


if __name__ == "__main__":
    main()
