"""Backend-served console with a separate cookie and fresh superadmin checks."""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import LoginInput, Service, get_service, ip
from app.core.config import BACKEND_ROOT
from app.modules.admin.access import admin_role
from app.modules.auth.service import SESSION_SECONDS
from app.modules.server_admin import public as console
from app.modules.server_admin.settings import (
    SettingsConflict,
    SettingsInputError,
    SettingsWriteError,
)

COOKIE = "bokji_server_admin"
ASSETS = BACKEND_ROOT / "app/modules/server_admin/static"
pages = APIRouter(include_in_schema=False)


class ConsoleRoute(APIRoute):
    """Bound JSON before FastAPI parses it, including requests without Content-Length."""

    def get_route_handler(self):
        original = super().get_route_handler()

        async def bounded(request: Request):
            if request.method in {"POST", "PATCH"}:
                total, chunks = 0, []
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > 65536:
                        raise HTTPException(413, "관리자 요청은 64KB 이하로 보내 주세요.")
                    chunks.append(chunk)
                request._body = b"".join(chunks)
            return await original(request)

        return bounded


def guard_console(request: Request):
    if request.headers.get("Sec-Fetch-Site") not in {None, "same-origin", "none"}:
        raise HTTPException(403, "같은 백엔드 주소에서 관리 페이지를 열어 주세요.")
    origin = request.headers.get("Origin")
    if origin is not None:
        try:
            supplied = urlsplit(origin)
            own = urlsplit(str(request.base_url))
            valid = (supplied.scheme in {"http", "https"} and not supplied.username
                     and not supplied.password and supplied.hostname == own.hostname
                     and supplied.port == own.port and supplied.scheme == own.scheme
                     and supplied.path in {"", "/"} and not supplied.query
                     and not supplied.fragment)
        except ValueError:
            valid = False
        if not valid:
            raise HTTPException(403, "같은 백엔드 주소에서 관리 페이지를 열어 주세요.")
    if request.method in {"POST", "PATCH"} and request.headers.get("X-Auth-Request") != "1":
        raise HTTPException(403, "올바른 관리자 요청이 아닙니다.")


router = APIRouter(prefix="/v1/server-admin", tags=["server-admin"],
                   dependencies=[Depends(guard_console)], route_class=ConsoleRoute)


def require_console_admin(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "관리자 로그인이 필요합니다.")
    service = get_service(request)
    user = service.me(token, console=True)
    if admin_role(service.engine, user["id"]) != "superadmin":
        raise HTTPException(403, "최고 관리자만 서버를 관리할 수 있습니다.")
    return {"id": user["id"], "username": user["username"], "admin_role": "superadmin"}


Admin = Annotated[dict, Depends(require_console_admin)]


class ConsoleLogin(LoginInput):
    model_config = ConfigDict(extra="forbid")


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")
    changes: dict = Field(min_length=1, max_length=50)


@pages.get("/")
def home():
    return FileResponse(ASSETS / "index.html", media_type="text/html",
                        headers={"Cache-Control": "no-store"})


@pages.get("/server-admin-assets/{filename}")
def asset(filename: str):
    allowed = {"console.css": "text/css", "console.js": "text/javascript"}
    if filename not in allowed:
        raise HTTPException(404)
    return FileResponse(ASSETS / filename, media_type=allowed[filename],
                        headers={"Cache-Control": "no-store"})


@router.post("/login")
def login(data: ConsoleLogin, request: Request, response: Response, service: Service):
    token, user = service.login(data.username, data.password.get_secret_value(), ip(request),
                               request.cookies.get(COOKIE), console=True)
    if admin_role(service.engine, user["id"]) != "superadmin":
        service.logout(token, console=True)
        raise HTTPException(403, "최고 관리자 계정으로 로그인해 주세요.")
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=request.app.state.settings.app_env == "production",
                        samesite="strict", path="/")
    return {"user": {"id": user["id"], "username": user["username"],
                     "admin_role": "superadmin"}}


@router.get("/session")
def session(user: Admin):
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        get_service(request).logout(token, console=True)
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="strict",
                           secure=request.app.state.settings.app_env == "production")
    return {"status": "logged_out"}


@router.get("/overview")
def overview(request: Request, user: Admin):
    return console.get_overview(request.app.state)


@router.get("/settings")
def settings_view(request: Request, user: Admin):
    try:
        return console.read_settings(request.app.state)
    except (SettingsInputError, SettingsWriteError, OSError):
        raise HTTPException(503, "서버 설정 파일과 읽기 권한을 확인해 주세요.") from None


@router.patch("/settings")
def settings_update(data: SettingsPatch, request: Request, user: Admin):
    try:
        return console.update_settings(request.app.state, data.revision, data.changes)
    except SettingsConflict:
        raise HTTPException(
            409, "다른 작업에서 설정이 변경됐습니다. 새로고침 후 다시 저장해 주세요.") from None
    except SettingsInputError:
        raise HTTPException(
            422, "허용된 설정, 값 범위와 환경변수 우선 설정을 확인해 주세요.") from None
    except (SettingsWriteError, OSError):
        raise HTTPException(503, "서버 설정 파일과 저장 권한을 확인해 주세요.") from None


@router.get("/collection/{kind}")
def collection_view(kind: str, request: Request, user: Admin,
                    limit: Annotated[int, Query(ge=1, le=100)] = 20):
    if kind not in {"status", "changes", "candidates"}:
        raise HTTPException(404)
    try:
        return console.read_collection(request.app.state, kind, limit=limit)
    except (SQLAlchemyError, ValueError, RuntimeError):
        raise HTTPException(503, "공고 MySQL 연결과 수집 스키마 초기화를 확인해 주세요.") from None
