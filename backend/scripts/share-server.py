"""Run the local API proxy with configured MySQL and server privacy keys."""

import sys
from pathlib import Path

import uvicorn

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.config import load_settings  # noqa: E402
from app.main import create_app  # noqa: E402

if __name__ == "__main__":
    settings = load_settings()
    settings.server_host = "127.0.0.1"
    settings.server_port = 8001
    uvicorn.run(
        create_app(settings),
        host="127.0.0.1",
        port=8001,
        proxy_headers=True,
        forwarded_allow_ips="127.0.0.1",
        access_log=False,
        loop="asyncio",
        http="h11",
    )
