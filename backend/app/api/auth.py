"""JSON-only auth API. Cookies are never exposed to JavaScript."""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT
from app.modules.admin.access import with_capabilities
from app.modules.auth.mail import EMAIL_SECONDS, RESEND_SECONDS, normalize_email
from app.modules.auth.migration import ensure_plaintext_storage
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import SESSION_SECONDS, AuthService

COOKIE = "bokji_session"
EMAIL_COOKIE = "bokji_signup_email"
REGIONS = {
    "서울",
    "경기",
    "인천",
    "부산",
    "대구",
    "광주",
    "대전",
    "울산",
    "세종",
    "강원",
    "충북",
    "충남",
    "전북",
    "전남",
    "경북",
    "경남",
    "제주",
}


def guard(request: Request):
    if request.method == "POST" and request.headers.get("X-Auth-Request") != "1":
        raise HTTPException(403, "올바른 인증 요청이 아니에요.")


router = APIRouter(prefix="/v1/auth", tags=["auth"], dependencies=[Depends(guard)])


def get_service(request: Request):
    state = request.app.state
    settings = state.settings
    if not settings.auth_enabled:
        raise HTTPException(503, "인증 서비스가 비활성화되어 있어요.")
    with state.auth_lock:
        if state.auth_service is None:
            if settings.auth_uses_mysql:
                engine = state.database_engine
            else:
                path = settings.auth_sqlite_path
                if not path.is_absolute():
                    path = BACKEND_ROOT / path
                path.parent.mkdir(parents=True, exist_ok=True)
                engine = create_engine(
                    "sqlite:///" + path.as_posix(),
                    connect_args={"check_same_thread": False, "timeout": 10},
                )
                try:
                    initialize_auth_schema(engine)
                    ensure_plaintext_storage(engine)
                except Exception:
                    engine.dispose()
                    raise
                state.auth_engine = engine
            if settings.auth_uses_mysql:
                ensure_plaintext_storage(engine)
            state.auth_service = AuthService(engine, settings)
    return state.auth_service


Service = Annotated[AuthService, Depends(get_service)]


class UsernameInput(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_]{4,20}$")

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value):
        return value.lower()


class LoginInput(UsernameInput):
    password: SecretStr = Field(min_length=8, max_length=128)


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=50)
    age: int | None = Field(default=None, strict=True, ge=0, le=120)
    gender: Literal["male", "female", "other", "undisclosed"] = "undisclosed"
    region: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError("이름을 입력해 주세요.")
        return value

    @field_validator("region")
    @classmethod
    def validate_region(cls, value):
        if value is not None and value not in REGIONS:
            raise ValueError("거주 지역을 선택해 주세요.")
        return value


class EmailInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        return normalize_email(value)


class EmailVerifyInput(EmailInput):
    code: SecretStr = Field(min_length=6, max_length=6)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value):
        if not re.fullmatch(r"[0-9]{6}", value.get_secret_value()):
            raise ValueError("6자리 인증번호를 입력해 주세요.")
        return value


class SignupInput(LoginInput, ProfileInput, EmailInput):
    # Password signup retains its existing required fields.
    name: str = Field(min_length=1, max_length=50)
    age: int = Field(strict=True, ge=0, le=120)
    gender: Literal["male", "female", "other", "undisclosed"]
    region: str = Field(max_length=32)
    confirm_password: SecretStr = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def matching_passwords(self):
        password = self.password.get_secret_value()
        if password != self.confirm_password.get_secret_value():
            raise ValueError("비밀번호와 비밀번호 확인이 일치하지 않아요.")
        if not re.search(r"[a-zA-Z]", password) or not re.search(r"[0-9]", password):
            raise ValueError("비밀번호는 영문과 숫자를 포함해야 해요.")
        return self


def ip(request: Request):
    # Do not trust arbitrary X-Forwarded-For; configure trusted proxies in the ASGI server.
    return request.client.host if request.client else "unknown"


@router.post("/signup", status_code=201)
def signup(data: SignupInput, request: Request, response: Response, service: Service):
    result = service.register(data, ip(request), request.cookies.get(EMAIL_COOKIE, ""))
    email_cookie(response, request)
    return result


def email_cookie(response, request, token=""):
    options = dict(
        httponly=True,
        samesite="lax",
        path="/",
        secure=request.app.state.settings.app_env == "production",
    )
    if token:
        response.set_cookie(EMAIL_COOKIE, token, max_age=EMAIL_SECONDS, **options)
    else:
        response.delete_cookie(EMAIL_COOKIE, **options)


@router.post("/email/request")
def request_email(data: EmailInput, request: Request, response: Response, service: Service):
    token = service.request_email_code(
        data.email, ip(request), request.cookies.get(EMAIL_COOKIE, "")
    )
    email_cookie(response, request, token)
    return {
        "message": "인증번호를 보냈어요. 이메일을 확인해 주세요.",
        "expires_in": EMAIL_SECONDS,
        "resend_after": RESEND_SECONDS,
    }


@router.post("/email/verify")
def verify_email(data: EmailVerifyInput, request: Request, response: Response, service: Service):
    token = request.cookies.get(EMAIL_COOKIE, "")
    service.verify_email_code(data.email, data.code.get_secret_value(), token, ip(request))
    email_cookie(response, request, token)
    return {
        "message": "이메일 인증이 완료됐어요. 10분 안에 가입을 마쳐 주세요.",
        "expires_in": EMAIL_SECONDS,
    }


@router.post("/username/check")
def check_username(data: UsernameInput, request: Request, service: Service):
    return service.check_username(data.username, ip(request))


@router.post("/login")
def login(data: LoginInput, request: Request, response: Response, service: Service):
    token, user = service.login(
        data.username, data.password.get_secret_value(), ip(request), request.cookies.get(COOKIE)
    )
    response.set_cookie(
        COOKIE,
        token,
        max_age=SESSION_SECONDS,
        httponly=True,
        secure=request.app.state.settings.app_env == "production",
        samesite="lax",
        path="/",
    )
    return {"user": with_capabilities(service, user)}


@router.get("/me")
def me(request: Request, service: Service):
    return {"user": with_capabilities(service, service.me(request.cookies.get(COOKIE)))}


@router.post("/profile")
def update_profile(data: ProfileInput, request: Request, service: Service):
    user = service.me(request.cookies.get(COOKIE))
    return {"user": with_capabilities(service, service.update_profile(user["id"], data))}


@router.post("/logout")
def logout(request: Request, response: Response, service: Service):
    service.logout(request.cookies.get(COOKIE))
    response.delete_cookie(
        COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=request.app.state.settings.app_env == "production",
    )
    return {"message": "로그아웃했어요."}


async def database_error_handler(request: Request, exc: SQLAlchemyError):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=503,
        content={"detail": "데이터베이스 연결 및 인증 테이블 설정을 확인해 주세요."},
        headers={"Cache-Control": "no-store"},
    )
