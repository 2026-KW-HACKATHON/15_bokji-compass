"""Run the local API proxy with configured storage and authentication settings."""

import sys
from pathlib import Path

import uvicorn

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.config import Settings, load_settings  # noqa: E402
from app.main import create_app  # noqa: E402


def share_settings() -> Settings:
    configuration = load_settings().model_dump()
    configuration.update(
        app_env="production", server_host="127.0.0.1", server_port=8001, cors_origins=[]
    )
    return Settings(
        _env_file=None,
        **configuration,
    )


if __name__ == "__main__":
    settings = share_settings()
    uvicorn.run(
        create_app(settings),
        host=settings.server_host,
        port=settings.server_port,
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
        access_log=False,
        loop="asyncio",
        http="h11",
    )
