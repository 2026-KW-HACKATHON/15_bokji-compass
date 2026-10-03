"""Isolated local API for mobile preview checks; never reads backend/.env."""

import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import password_hash
from sqlalchemy import create_engine, insert

if __name__ == "__main__":
    cache = ROOT / "tmp"
    cache.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="mobile-preview-", dir=cache) as directory:
        database = Path(directory) / "test.sqlite3"
        settings = Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_sqlite_path=database,
            cors_origins=["http://127.0.0.1:8081", "http://localhost:8081"],
        )
        engine = create_engine("sqlite:///" + database.as_posix())
        initialize_auth_schema(engine)
        with engine.begin() as connection:
            connection.execute(
                insert(accounts).values(
                    **dict(
                        id="mobile-preview",
                        username="mobile_preview",
                        name="앱 테스트",
                        password_hash=password_hash("PreviewOnly42!"),
                        age=30,
                        gender="undisclosed",
                        region="서울",
                        phone=None,
                        created_at=1,
                    )
                )
            )
        engine.dispose()
        app = create_app(settings)
        uvicorn.run(app, host="127.0.0.1", port=8766, access_log=False)
