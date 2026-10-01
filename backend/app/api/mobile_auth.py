"""Native-app bearer sessions; web cookies are neither read nor issued here."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.auth import LoginInput, Service, guard, ip
from app.modules.auth.service import SESSION_SECONDS

bearer = HTTPBearer(auto_error=False)
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def mobile_token(credentials: Credentials) -> str:
    if credentials is None or not re.fullmatch(r"[A-Za-z0-9_-]{43}", credentials.credentials):
        raise HTTPException(401, "로그인이 필요해요.")
    return credentials.credentials


Token = Annotated[str, Depends(mobile_token)]
router = APIRouter(prefix="/v1/mobile/auth", tags=["mobile-auth"], dependencies=[Depends(guard)])


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
