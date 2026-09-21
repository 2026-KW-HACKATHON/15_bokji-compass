"""Own a separate loopback-only development instance, never an existing service."""

import argparse
import json
import os
import secrets
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pymysql
from dotenv import dotenv_values, set_key

BACKEND = Path(__file__).resolve().parents[1]
INSTANCE = BACKEND / "data" / "mysql-dev"
DATA = INSTANCE / "data"
STATE = INSTANCE / "credentials.json"
CONFIG = INSTANCE / "my.ini"


def port_open(port: int) -> bool:
    with socket.socket() as probe:
        probe.settimeout(1)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def connect(state: dict):
    return pymysql.connect(
        host="127.0.0.1", port=state["port"], user="bokji_local_admin",
        password=state["admin_password"], connect_timeout=2, read_timeout=3,
        write_timeout=3, autocommit=True,
    )


def verify_instance(connection) -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT @@datadir")
        actual = Path(cursor.fetchone()[0]).resolve()
    if actual != DATA.resolve():
        raise RuntimeError("Target is not this project's MySQL data directory; refusing access.")


def find_mysqld(explicit: str | None) -> Path:
    if explicit:
        candidates = [Path(explicit)]
    else:
        program_files = Path(os.environ.get("ProgramFiles", "C:/Program Files"))
        candidates = [
            program_files / "MySQL/MySQL Server 8.4/bin/mysqld.exe",
            program_files / "MySQL/MySQL Server 8.0/bin/mysqld.exe",
        ]
        if found := shutil.which("mysqld"):
            candidates.append(Path(found))
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError("MySQL binary not found. Install MySQL x64 or pass --mysqld <mysqld.exe>.")


def initialize(executable: Path, port: int) -> dict:
    if DATA.exists() and any(DATA.iterdir()):
        raise RuntimeError("Existing data without project credentials: refusing initialization.")
    if port_open(port):
        raise RuntimeError(f"Port {port} is occupied. No existing server will be changed.")
    state = {
        "port": port, "executable": str(executable),
        "root_password": secrets.token_hex(24), "admin_password": secrets.token_hex(24),
        "app_password": secrets.token_hex(24),
    }
    DATA.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state), encoding="utf-8")
    with (INSTANCE / "initialize.log").open("ab") as log:
        result = subprocess.run(
            [str(executable), "--no-defaults", "--initialize-insecure",
             f"--basedir={executable.parent.parent}", f"--datadir={DATA}", "--console"],
            stdout=log, stderr=subprocess.STDOUT, timeout=180,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    if result.returncode:
        raise RuntimeError("MySQL initialization failed; inspect data/mysql-dev/initialize.log.")
    CONFIG.write_text(
        "[mysqld]\n"
        f'basedir="{executable.parent.parent.as_posix()}"\n'
        f'datadir="{DATA.as_posix()}"\n'
        f'port={port}\nbind-address=127.0.0.1\nmysqlx=0\nskip-name-resolve\n'
        'character-set-server=utf8mb4\ncollation-server=utf8mb4_0900_ai_ci\n'
        'default-time-zone=+00:00\n'
        f'log-error="{(INSTANCE / "server.log").as_posix()}"\n'
        f'pid-file="{(INSTANCE / "server.pid").as_posix()}"\n',
        encoding="utf-8",
    )
    statements = [
        f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{state['root_password']}';",
        "CREATE DATABASE IF NOT EXISTS bokji_compass_dev CHARACTER SET utf8mb4;",
        "CREATE DATABASE IF NOT EXISTS bokji_compass_test CHARACTER SET utf8mb4;",
        "CREATE USER IF NOT EXISTS 'bokji_local_admin'@'127.0.0.1' "
        f"IDENTIFIED BY '{state['admin_password']}';",
        "GRANT SHUTDOWN ON *.* TO 'bokji_local_admin'@'127.0.0.1';",
        "CREATE USER IF NOT EXISTS 'bokji_dev'@'127.0.0.1' "
        f"IDENTIFIED BY '{state['app_password']}';",
        "GRANT ALL PRIVILEGES ON bokji_compass_dev.* TO 'bokji_dev'@'127.0.0.1';",
        "CREATE USER IF NOT EXISTS 'bokji_test'@'127.0.0.1' "
        f"IDENTIFIED BY '{state['app_password']}';",
        "GRANT ALL PRIVILEGES ON bokji_compass_test.* TO 'bokji_test'@'127.0.0.1';",
    ]
    (INSTANCE / "bootstrap.sql").write_text("\n".join(statements), encoding="utf-8")
    return state


def start(state: dict) -> None:
    if port_open(state["port"]):
        with connect(state) as connection:
            verify_instance(connection)
        print("Project MySQL is already running.")
        return
    if not CONFIG.is_file() or not (DATA / "mysql").is_dir():
        raise RuntimeError("Initialization incomplete; inspect local logs. Data was preserved.")
    command = [state["executable"], f"--defaults-file={CONFIG}"]
    bootstrap = INSTANCE / "bootstrap.sql"
    if bootstrap.exists():
        command.append(f"--init-file={bootstrap}")
    with (INSTANCE / "process.log").open("ab") as log:
        process = subprocess.Popen(
            command, stdout=log, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW,
            cwd=INSTANCE,
        )
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("MySQL stopped during startup; inspect data/mysql-dev/server.log.")
        try:
            with connect(state) as connection:
                verify_instance(connection)
            # Confirm bootstrap completed, not merely the admin creation statement.
            with pymysql.connect(
                host="127.0.0.1", port=state["port"], user="bokji_test",
                password=state["app_password"], database="bokji_compass_test",
                connect_timeout=2,
            ):
                pass
            bootstrap.unlink(missing_ok=True)
            print(f"Project MySQL ready on 127.0.0.1:{state['port']}.")
            return
        except pymysql.MySQLError:
            time.sleep(0.5)
    # Terminate only the process started above, never an unrelated instance.
    process.terminate()
    process.wait(timeout=15)
    raise RuntimeError("Project MySQL startup timed out; inspect local logs.")


def write_application_env(state: dict) -> None:
    env_file = BACKEND / ".env"
    if not env_file.exists():
        shutil.copyfile(BACKEND / ".env.example", env_file)
    current = dotenv_values(env_file)
    if str(current.get("DB_ENABLED", "false")).lower() in {"true", "1", "yes"}:
        expected = {"DB_HOST": "127.0.0.1", "DB_PORT": str(state["port"]),
                    "DB_NAME": "bokji_compass_dev", "DB_USER": "bokji_dev"}
        if any(current.get(key) != value for key, value in expected.items()):
            raise RuntimeError(
                "Existing .env points to another DB; preserved. Configure it manually."
            )
    for key, value in {
        "DB_ENABLED": "true", "DB_HOST": "127.0.0.1", "DB_PORT": str(state["port"]),
        "DB_NAME": "bokji_compass_dev", "DB_USER": "bokji_dev",
        "DB_PASSWORD": state["app_password"],
    }.items():
        set_key(env_file, key, value)
    print("Project DB settings saved to ignored backend/.env; passwords were not printed.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["setup", "start", "stop", "status"])
    parser.add_argument("--mysqld")
    parser.add_argument("--port", type=int, default=3307)
    arguments = parser.parse_args()
    if os.name != "nt":
        parser.error("This helper is for native Windows only")
    if not 1024 <= arguments.port <= 65535:
        parser.error("Use an unprivileged TCP port from 1024 to 65535")
    INSTANCE.mkdir(parents=True, exist_ok=True)
    lock = INSTANCE / "operation.lock"
    try:
        lock_handle = lock.open("x")
    except FileExistsError:
        parser.exit(1, "Another operation or stale operation.lock exists; no data was changed.\n")
    try:
        if STATE.exists():
            state = json.loads(STATE.read_text(encoding="utf-8"))
        elif arguments.action == "setup":
            state = initialize(find_mysqld(arguments.mysqld), arguments.port)
        else:
            raise RuntimeError("Run setup-mysql.ps1 first.")
        if arguments.action in {"setup", "start"}:
            start(state)
            if arguments.action == "setup":
                write_application_env(state)
        elif port_open(state["port"]):
            with connect(state) as connection:
                verify_instance(connection)
                if arguments.action == "stop":
                    with connection.cursor() as cursor:
                        cursor.execute("SHUTDOWN")
                    print("Project MySQL shutdown requested.")
                else:
                    print(f"Project MySQL running on 127.0.0.1:{state['port']}.")
            if arguments.action == "stop":
                deadline = time.monotonic() + 20
                while port_open(state["port"]):
                    if time.monotonic() >= deadline:
                        raise RuntimeError(
                            "Shutdown is still pending; no process was force-killed."
                        )
                    time.sleep(0.25)
                print("Project MySQL is stopped.")
        else:
            print("Project MySQL is stopped.")
    except (RuntimeError, OSError, pymysql.MySQLError, subprocess.SubprocessError) as exc:
        # No SQL, password, or raw driver diagnostics in terminal output.
        message = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
        parser.exit(1, f"MySQL helper failed: {message}\n")
    finally:
        lock_handle.close()
        lock.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
