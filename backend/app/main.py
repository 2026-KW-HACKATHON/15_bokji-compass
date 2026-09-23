"""ASGI entrypoint: app.main:app. Imports do not connect to MySQL."""

from contextlib import asynccontextmanager
from threading import Lock

from fastapi import FastAPI
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import database_error_handler
from app.api.auth import router as auth_router
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
            if application.state.auth_engine is not None:
                application.state.auth_engine.dispose()
            if engine is not None:
                engine.dispose()

    application = FastAPI(title="복지나침반 API", version="0.1.0", lifespan=lifespan)
    application.state.settings = configuration
    application.state.auth_service = None
    application.state.auth_engine = None
    application.state.auth_lock = Lock()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Auth-Request"],
    )
    application.add_exception_handler(SQLAlchemyError, database_error_handler)

    @application.exception_handler(RequestValidationError)
    async def safe_validation_error(request, exc):
        if request.url.path.startswith("/v1/auth/"):
            # Pydantic's default error body can echo raw passwords and OTPs.
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "아이디·비밀번호·필수 정보의 입력 형식을 확인해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        return await request_validation_exception_handler(request, exc)

    @application.middleware("http")
    async def private_auth_response(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/v1/auth/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    application.include_router(router)
    application.include_router(auth_router)
    return application


app = create_app()
