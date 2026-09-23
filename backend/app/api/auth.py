"""JSON-only auth API. Cookies are never exposed to JavaScript."""

import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import BACKEND_ROOT
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import SESSION_SECONDS, AuthService, DevelopmentSmsSender

COOKIE = "bokji_session"
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
            if settings.app_env == "production" and not settings.db_enabled:
                raise HTTPException(503, "운영 인증 데이터베이스 설정이 필요해요.")
            if settings.db_enabled:
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
                except Exception:
                    engine.dispose()
                    raise
                state.auth_engine = engine
            development = settings.app_env in {"development", "test"}
            dev_sms = development and settings.auth_sms_mode == "development"
            state.auth_service = AuthService(
                engine,
                development_sms=dev_sms,
                sender=DevelopmentSmsSender() if dev_sms else None,
            )
    return state.auth_service


Service = Annotated[AuthService, Depends(get_service)]


class PhoneInput(BaseModel):
    phone: str = Field(min_length=10, max_length=20)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value):
        value = re.sub(r"[\s-]", "", value)
        if not re.fullmatch(r"010[0-9]{8}", value):
            raise ValueError("010으로 시작하는 휴대전화 번호를 입력해 주세요.")
        return value


class VerifyInput(PhoneInput):
    challenge_id: str = Field(min_length=20, max_length=64)
    code: str = Field(pattern=r"^[0-9]{6}$")


class LoginInput(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_]{4,20}$")
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value):
        return value.lower()


class SignupInput(LoginInput, PhoneInput):
    name: str = Field(min_length=1, max_length=50)
    confirm_password: SecretStr = Field(min_length=8, max_length=128)
    age: int = Field(strict=True, ge=0, le=120)
    gender: Literal["male", "female", "other", "undisclosed"]
    region: str = Field(max_length=32)
    verification_token: str = Field(min_length=20, max_length=64)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        value = value.strip()
        if not value or any(ord(character) < 32 for character in value):
            raise ValueError("이름을 입력해 주세요.")
        return value

    @field_validator("region")
    @classmethod
    def validate_region(cls, value):
        if value not in REGIONS:
            raise ValueError("거주 지역을 선택해 주세요.")
        return value

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


@router.post("/phone/request")
def request_code(data: PhoneInput, request: Request, service: Service):
    return service.request_code(data.phone, ip(request))


@router.post("/phone/verify")
def verify_code(data: VerifyInput, request: Request, service: Service):
    return service.verify_code(data.challenge_id, data.phone, data.code, ip(request))


@router.post("/signup", status_code=201)
def signup(data: SignupInput, request: Request, service: Service):
    return service.register(data, ip(request))


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
    return {"user": user}


@router.get("/me")
def me(request: Request, service: Service):
    return {"user": service.me(request.cookies.get(COOKIE))}


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
