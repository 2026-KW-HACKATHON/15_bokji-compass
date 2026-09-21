"""Run with .venv/Scripts/python.exe server.py [--reload]."""

import argparse

import uvicorn

from app.core.config import BACKEND_ROOT, load_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the Welfare Compass backend")
    parser.add_argument("--reload", action="store_true", help="Development reload only")
    arguments = parser.parse_args()
    settings = load_settings()
    if arguments.reload and settings.app_env == "production":
        parser.error("--reload is only allowed outside production")
    uvicorn.run(
        "app.main:app", host=settings.server_host, port=settings.server_port,
        loop="asyncio", http="h11", reload=arguments.reload,
        reload_dirs=[str(BACKEND_ROOT / "app")] if arguments.reload else None,
    )


if __name__ == "__main__":
    main()
