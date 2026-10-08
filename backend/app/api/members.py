"""One account boundary shared by cookie and native bearer consumers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.api.auth import COOKIE, Service
from app.api.mobile_auth import Credentials, mobile_token


def get_member(request: Request, service: Service, credentials: Credentials) -> dict:
    if "authorization" in request.headers:
        return service.me(mobile_token(credentials), mobile=True)
    return service.me(request.cookies.get(COOKIE))


Member = Annotated[dict, Depends(get_member)]


def get_optional_member(request: Request, service: Service, credentials: Credentials):
    """Public policy guidance does not require an active account session."""
    try:
        return get_member(request, service, credentials)
    except HTTPException as exc:
        if exc.status_code != 401:
            raise
        return None


OptionalMember = Annotated[dict | None, Depends(get_optional_member)]
