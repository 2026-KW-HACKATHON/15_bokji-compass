"""Native-app bearer sessions; web cookies are neither read nor issued here."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import Field, SecretStr

from app.api.auth import EmailInput, EmailVerifyInput, LoginInput, Service, SignupInput, guard, ip
from app.modules.auth.mail import EMAIL_SECONDS, RESEND_SECONDS
from app.modules.auth.service import SESSION_SECONDS

bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def mobile_token(credentials: Credentials) -> str:
    if credentials is None or not re.fullmatch(r"[A-Za-z0-9_-]{43}", credentials.credentials):
        raise HTTPException(401, "로그인이 필요해요.")
    return credentials.credentials


Token = Annotated[str, Depends(mobile_token)]
router = APIRouter(prefix="/v1/mobile/auth", tags=["mobile-auth"], dependencies=[Depends(guard)])


class MobileEmailInput(EmailInput):
    verification_token: SecretStr = Field(default=SecretStr(""), max_length=43)


class MobileVerifyInput(EmailVerifyInput):
    verification_token: SecretStr = Field(min_length=43, max_length=43)


class MobileSignupInput(SignupInput):
    verification_token: SecretStr = Field(min_length=43, max_length=43)


@router.post("/email/request")
def request_email(data: MobileEmailInput, request: Request, service: Service):
    token = service.request_email_code(
        data.email, ip(request), data.verification_token.get_secret_value()
    )
    return {
        "verification_token": token,
        "expires_in": EMAIL_SECONDS,
        "resend_after": RESEND_SECONDS,
    }


@router.post("/email/verify")
def verify_email(data: MobileVerifyInput, request: Request, service: Service):
    service.verify_email_code(
        data.email,
        data.code.get_secret_value(),
        data.verification_token.get_secret_value(),
        ip(request),
    )
    return {"verified": True, "expires_in": EMAIL_SECONDS}


@router.post("/signup", status_code=201)
def signup(data: MobileSignupInput, request: Request, service: Service):
    return service.register(data, ip(request), data.verification_token.get_secret_value())


@router.post("/login")
def login(data: LoginInput, request: Request, service: Service):
    token, user = service.login(
        data.username,
        data.password.get_secret_value(),
        ip(request),
        mobile=True,
    )
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": SESSION_SECONDS,
        "user": user,
    }


@router.get("/me")
def me(token: Token, service: Service):
    return {"user": service.me(token, mobile=True)}


@router.post("/logout")
def logout(token: Token, service: Service):
    service.logout(token, mobile=True)
    return {"message": "로그아웃했어요."}
