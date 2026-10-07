"""ASGI entrypoint: app.main:app. Imports do not connect to MySQL."""

import asyncio
import time
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from threading import BoundedSemaphore, Lock, RLock

from fastapi import FastAPI
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.admin import router as admin_router
from app.api.assistant import router as assistant_router
from app.api.assistant_dialogue import router as assistant_dialogue_router
from app.api.auth import database_error_handler
from app.api.auth import router as auth_router
from app.api.finance import router as finance_router
from app.api.health import router
from app.api.kakao_auth import router as kakao_auth_router
from app.api.mobile_auth import router as mobile_auth_router
from app.api.monitoring import router as monitoring_router
from app.api.notifications import router as notifications_router
from app.api.policies import router as policies_router
from app.api.recommendations import router as recommendations_router
from app.api.server_admin import pages as server_admin_pages
from app.api.server_admin import router as server_admin_router
from app.core.config import Settings, load_settings
from app.core.database import create_database_engine
from app.modules.assistant.dialogue_models import DialogueStore
from app.modules.auth.privacy import PrivacyError
from app.modules.server_admin.operations import Operations
from app.modules.server_admin.public import configuration_path


def create_app(settings: Settings | None = None, *, config_path: Path | None = None) -> FastAPI:
    configuration = settings if settings is not None else load_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        engine = create_database_engine(configuration) if configuration.db_enabled else None
        application.state.database_engine = engine

        async def expire_dialogues():
            while True:
                await asyncio.sleep(30)
                await asyncio.to_thread(application.state.dialogue_store.prune_expired)

        cleanup_task = asyncio.create_task(expire_dialogues())
        try:
            yield
        finally:
            cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await cleanup_task
            application.state.dialogue_store.clear()
            await asyncio.to_thread(application.state.server_operations.close)
            if application.state.auth_engine is not None:
                application.state.auth_engine.dispose()
            if engine is not None:
                engine.dispose()

    application = FastAPI(title="복지나침반 API", version="0.1.0", lifespan=lifespan)
    application.state.settings = configuration
    application.state.server_config_path = config_path or configuration_path()
    application.state.server_config_lock = RLock()
    application.state.server_operations = Operations()
    application.state.server_started_at = time.time()
    application.state.auth_service = None
    application.state.auth_engine = None
    application.state.auth_lock = Lock()
    application.state.finance_store = None
    application.state.finance_lock = Lock()
    application.state.notification_store = None
    application.state.notification_lock = Lock()
    application.state.monitoring_store = None
    application.state.monitoring_lock = Lock()
    application.state.policy_repository = None
    application.state.policy_lock = Lock()
    application.state.assistant_slots = BoundedSemaphore(2)
    application.state.dialogue_store = DialogueStore()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=configuration.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Auth-Request", "Authorization"],
    )

    @application.exception_handler(PrivacyError)
    async def safe_privacy_error(request, exc):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "기존 암호화 회원 데이터 이관이 필요해요. "
                "서버에서 초기화 명령을 실행해 주세요."
            },
            headers={"Cache-Control": "no-store"},
        )

    @application.exception_handler(SQLAlchemyError)
    async def safe_database_error(request, exc):
        if request.url.path.startswith(
            ("/v1/policies", "/v1/assistant/", "/v1/admin/policies", "/v1/recommendations")
        ):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "공고 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/finance/"):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "저장한 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/monitoring"):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "지속 안내 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."},
                headers={"Cache-Control": "no-store"},
            )
        return await database_error_handler(request, exc)

    @application.exception_handler(RequestValidationError)
    async def safe_validation_error(request, exc):
        if request.url.path.startswith("/v1/monitoring"):
            return JSONResponse(
                status_code=422,
                content={"detail": "생활 정보와 저장 동의, 지속 안내 설정을 확인해 주세요."},
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/recommendations"):
            return JSONResponse(
                status_code=422,
                content={"detail": "추천 정보와 금융정보 사용 선택을 확인해 주세요."},
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/server-admin/"):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "관리자 로그인 정보와 설정 입력 형식을 확인해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/admin/policies"):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "공고 개정·공개 상태·검토 메모의 형식을 확인해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/mobile/notifications/"):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "알림 설정과 기기 등록 정보의 입력 형식을 확인해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/assistant/"):
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "공고와 질문의 입력 형식을 확인해 주세요.",
                },
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith("/v1/finance/"):
            return JSONResponse(
                status_code=422,
                content={"detail": "금액과 필수 항목, 저장 동의 여부를 확인해 주세요."},
                headers={"Cache-Control": "no-store"},
            )
        if request.url.path.startswith(("/v1/auth/", "/v1/mobile/auth/", "/v1/admin/")):
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
        if request.url.path.startswith(
            (
                "/v1/auth/",
                "/v1/mobile/auth/",
                "/v1/finance/",
                "/v1/mobile/notifications/",
                "/v1/monitoring",
                "/v1/assistant/",
                "/v1/policies",
                "/v1/recommendations",
                "/v1/admin/",
                "/v1/server-admin/",
            )
        ):
            response.headers["Cache-Control"] = "no-store"
        if request.url.path == "/" or request.url.path.startswith(
            ("/v1/server-admin/", "/server-admin-assets/")
        ):
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "same-origin"
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; script-src 'self'; style-src 'self'; "
                "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
                "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
            )
        return response

    application.include_router(router)
    application.include_router(auth_router)
    application.include_router(kakao_auth_router)
    application.include_router(admin_router)
    application.include_router(server_admin_pages)
    application.include_router(server_admin_router)
    application.include_router(mobile_auth_router)
    application.include_router(notifications_router)
    application.include_router(monitoring_router)
    application.include_router(finance_router)
    application.include_router(policies_router)
    application.include_router(assistant_router)
    application.include_router(assistant_dialogue_router)
    application.include_router(recommendations_router)
    return application


app = create_app()
