"""One account boundary shared by cookie and native bearer consumers."""

from typing import Annotated

from fastapi import Depends, Request

from app.api.auth import COOKIE, Service
from app.api.mobile_auth import Credentials, mobile_token


def get_member(request: Request, service: Service, credentials: Credentials) -> dict:
    if "authorization" in request.headers:
        return service.me(mobile_token(credentials), mobile=True)
    return service.me(request.cookies.get(COOKIE))


Member = Annotated[dict, Depends(get_member)]
