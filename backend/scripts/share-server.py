"""Run a public demo API with explicit settings and a separate SQLite database."""

import sys
from pathlib import Path

import uvicorn

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

if __name__ == "__main__":
    settings = Settings(
        _env_file=None,
        app_env="development",
        server_host="127.0.0.1",
        server_port=8001,
        db_enabled=False,
        auth_enabled=True,
        auth_sms_mode="development",
        auth_sqlite_path=BACKEND / "data/tunnel-demo/auth.sqlite3",
        cors_origins=[],
    )
    uvicorn.run(
        create_app(settings), host="127.0.0.1", port=8001,
        proxy_headers=True, forwarded_allow_ips="127.0.0.1",
        access_log=False, loop="asyncio", http="h11",
    )
