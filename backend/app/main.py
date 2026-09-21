"""ASGI entrypoint: app.main:app. Imports do not connect to MySQL."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router
from app.core.config import Settings, load_settings
from app.core.database import create_database_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    configuration = settings if settings is not None else load_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        engine = create_database_engine(configuration) if configuration.db_enabled else None
        application.state.database_engine = engine
        try:
            yield
        finally:
            if engine is not None:
                engine.dispose()

    application = FastAPI(title="복지나침반 API", version="0.1.0", lifespan=lifespan)
    application.state.settings = configuration
    application.add_middleware(
        CORSMiddleware, allow_origins=configuration.cors_origins,
        allow_credentials=False, allow_methods=["GET"], allow_headers=["*"],
    )
    application.include_router(router)
    return application


app = create_app()
