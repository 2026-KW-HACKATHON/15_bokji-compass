"""Backend-served console with a separate cookie and fresh superadmin checks."""

import subprocess
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import LoginInput, Service, get_service, ip
from app.api.policies import get_repository
from app.core.config import BACKEND_ROOT
from app.core.web_security import WRITE_METHODS, origin_key
from app.modules.admin.access import admin_role
from app.modules.auth.service import SESSION_SECONDS
from app.modules.server_admin import public as console
from app.modules.server_admin import runtime
from app.modules.server_admin.operations import OperationError, RunInput, scheduler
from app.modules.server_admin.settings import (
    SettingsConflict,
    SettingsInputError,
    SettingsWriteError,
)
from app.modules.storage import editor
from app.modules.storage.publication import PublicationConflict

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
                policy_edit = request.method == "PATCH" and request.url.path.startswith(
                    "/v1/server-admin/policies/"
                )
                maximum = 1048576 if policy_edit else 65536
                async for chunk in request.stream():
                    total += len(chunk)
                    if total > maximum:
                        raise HTTPException(
                            413, "공고 편집은 1MB, 그 외 관리자 요청은 64KB 이하입니다."
                        )
                    chunks.append(chunk)
                request._body = b"".join(chunks)
            return await original(request)

        return bounded


def guard_console(request: Request):
    if request.headers.get("Sec-Fetch-Site") not in {None, "same-origin", "none"}:
        raise HTTPException(403, "같은 백엔드 주소에서 관리 페이지를 열어 주세요.")
    origin = request.headers.get("Origin")
    if origin is not None:
        valid = (
            len(request.headers.getlist("origin")) == 1
            and origin_key(origin) is not None
            and origin_key(origin) == origin_key(str(request.base_url))
        )
        if not valid:
            raise HTTPException(403, "같은 백엔드 주소에서 관리 페이지를 열어 주세요.")
    if request.method in WRITE_METHODS and request.headers.getlist("X-Auth-Request") != ["1"]:
        raise HTTPException(403, "올바른 관리자 요청이 아닙니다.")


router = APIRouter(
    prefix="/v1/server-admin",
    tags=["server-admin"],
    dependencies=[Depends(guard_console)],
    route_class=ConsoleRoute,
)


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
    return FileResponse(
        ASSETS / "index.html", media_type="text/html", headers={"Cache-Control": "no-store"}
    )


@pages.get("/server-admin-assets/{filename}")
def asset(filename: str):
    allowed = {
        "console.css": "text/css",
        "console.js": "text/javascript",
        "policies.js": "text/javascript",
    }
    if filename not in allowed:
        raise HTTPException(404)
    return FileResponse(
        ASSETS / filename, media_type=allowed[filename], headers={"Cache-Control": "no-store"}
    )


@router.post("/login")
def login(data: ConsoleLogin, request: Request, response: Response, service: Service):
    token, user = service.login(
        data.username,
        data.password.get_secret_value(),
        ip(request),
        request.cookies.get(COOKIE),
        console=True,
    )
    if admin_role(service.engine, user["id"]) != "superadmin":
        service.logout(token, console=True)
        raise HTTPException(403, "최고 관리자 계정으로 로그인해 주세요.")
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=request.app.state.settings.app_env == "production",
        samesite="strict",
        path="/",
    )
    return {"user": {"id": user["id"], "username": user["username"], "admin_role": "superadmin"}}


@router.get("/session")
def session(user: Admin):
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE)
    if token:
        get_service(request).logout(token, console=True)
    response.delete_cookie(
        COOKIE,
        path="/",
        httponly=True,
        samesite="strict",
        secure=request.app.state.settings.app_env == "production",
    )
    return {"status": "logged_out"}


@router.get("/overview")
def overview(request: Request, user: Admin):
    return console.get_overview(request.app.state)


@router.get("/policies")
def policy_list(
    request: Request,
    user: Admin,
    q: Annotated[str, Query(max_length=200)] = "",
    status: Annotated[
        str, Query(pattern=r"^(all|raw|listing|draft|reviewed|published|rejected)$")
    ] = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str, Query(pattern=r"^(0|[1-9][0-9]{0,7})$")] = "0",
):
    return editor.list_editable_policies(
        get_repository(request), q=q, status=status, limit=limit, offset=int(cursor)
    )


@router.get("/policies/{policy_key}")
def policy_edit_view(policy_key: str, request: Request, user: Admin):
    result = editor.read_policy_edit(get_repository(request), policy_key)
    if result is None:
        raise HTTPException(404, "편집할 원문을 찾을 수 없습니다. 상세 수집 상태를 확인하세요.")
    return result


@router.patch("/policies/{policy_key}")
def policy_edit_save(policy_key: str, data: editor.PolicyEditInput, request: Request, user: Admin):
    try:
        return editor.save_policy_edit(get_repository(request), policy_key, data, user["id"])
    except PublicationConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except LookupError:
        raise HTTPException(404, "공고를 찾을 수 없습니다.") from None
    except ValueError:
        raise HTTPException(
            422, "공고 내용·요약 길이·조건 코드와 원문 근거를 확인하세요."
        ) from None


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
            409, "다른 작업에서 설정이 변경됐습니다. 새로고침 후 다시 저장해 주세요."
        ) from None
    except SettingsInputError:
        raise HTTPException(
            422, "허용된 설정, 값 범위와 환경변수 우선 설정을 확인해 주세요."
        ) from None
    except (SettingsWriteError, OSError):
        raise HTTPException(503, "서버 설정 파일과 저장 권한을 확인해 주세요.") from None


@router.get("/collection/{kind}")
def collection_view(
    kind: str, request: Request, user: Admin, limit: Annotated[int, Query(ge=1, le=100)] = 20
):
    if kind not in {"status", "changes", "candidates"}:
        raise HTTPException(404)
    try:
        return console.read_collection(request.app.state, kind, limit=limit)
    except (SQLAlchemyError, ValueError, RuntimeError):
        raise HTTPException(503, "공고 MySQL 연결과 수집 스키마 초기화를 확인해 주세요.") from None


@router.get("/operations")
def operations_view(request: Request, user: Admin):
    return request.app.state.server_operations.snapshot(request.app.state)


@router.post("/operations/{operation_id}/stop", status_code=202)
def operation_stop(operation_id: UUID, request: Request, user: Admin):
    try:
        return request.app.state.server_operations.stop(request.app.state, str(operation_id))
    except OperationError:
        raise HTTPException(409, "현재 실행 중인 AI 전체 분석 작업을 확인해 주세요.") from None


@router.post("/operations", status_code=202)
def operation_start(data: RunInput, request: Request, user: Admin):
    try:
        return request.app.state.server_operations.start(request.app.state, data)
    except OperationError as error:
        messages = {
            "operation_busy": "이미 실행 중인 작업이 있습니다. 완료 후 다시 실행해 주세요.",
            "restart_required": "DB 설정이 변경되었습니다. 서버를 재시작한 뒤 실행해 주세요.",
            "collection_disabled": "서버 설정에서 MySQL과 새 공고 수집 회차 허용을 켜 주세요.",
            "database_disabled": "공고 수집에는 MySQL 설정과 서버 재시작이 필요합니다.",
            "windows_required": "자동 수집 등록은 Windows 서버에서 사용할 수 있습니다.",
            "schedule_configuration_mismatch": (
                "자동 수집은 기본 .env 파일 설정을 사용합니다. "
                "별도 설정 파일과 프로세스 환경변수를 확인해 주세요."
            ),
            "schedule_time_limit": "자동 수집의 회차 제한 시간을 600초 이하로 설정해 주세요.",
        }
        status = 409 if error.args[0] in {"operation_busy", "restart_required"} else 503
        raise HTTPException(
            status, messages.get(error.args[0], "작업을 시작하지 못했습니다.")
        ) from None
    except (ValueError, OSError, RuntimeError):
        raise HTTPException(422, "실행 범위와 저장된 서버 설정을 확인해 주세요.") from None


@router.get("/schedule")
def schedule_view(request: Request, user: Admin):
    try:
        return scheduler("Status")
    except (OperationError, OSError, subprocess.SubprocessError):
        raise HTTPException(503, "Windows 자동 수집 작업 상태를 확인하지 못했습니다.") from None


@router.get("/processes")
def processes_view(request: Request, user: Admin):
    try:
        runtime.refresh_pending(request.app.state)
        return runtime.status()
    except (RuntimeError, OSError, subprocess.SubprocessError):
        raise HTTPException(503, "프로젝트 프로세스 상태를 확인하지 못했습니다.") from None


@router.post("/processes", status_code=202)
def processes_control(data: runtime.ControlInput, request: Request, user: Admin):
    try:
        return runtime.start(request.app.state, data)
    except runtime.RuntimeErrorCode as error:
        messages = {
            "collection_busy": (
                "수집·분석 작업이 실행 중입니다. 완료 또는 중지 후 서버·DB를 제어해 주세요."
            ),
            "control_busy": "서비스 제어 작업이 이미 진행 중입니다.",
            "windows_required": "프로세스 제어는 Windows 서버에서 사용할 수 있습니다.",
            "unmanaged_runtime": "개발 또는 운영 실행 BAT로 서버를 시작한 뒤 사용해 주세요.",
            "mysql_unmanaged": (
                "현재 DB는 프로젝트 MySQL 제어 대상이 아닙니다. DB 연결 설정을 확인해 주세요."
            ),
            "tunnel_unmanaged": "운영 실행 BAT와 고정 도메인 터널 구성을 확인해 주세요.",
        }
        code = error.args[0]
        raise HTTPException(
            409 if code in {"collection_busy", "control_busy"} else 503,
            messages.get(code, "프로세스 제어를 시작하지 못했습니다."),
        ) from None
    except (OSError, subprocess.SubprocessError):
        raise HTTPException(503, "프로세스 제어를 시작하지 못했습니다.") from None


@router.get("/processes/{job_id}")
def process_job(job_id: UUID, request: Request, user: Admin):
    try:
        runtime.refresh_pending(request.app.state)
        return {"operation": runtime.read_job(str(job_id))}
    except runtime.RuntimeErrorCode:
        raise HTTPException(404, "프로세스 제어 기록을 찾을 수 없습니다.") from None
