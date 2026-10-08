"""Browser-bound, one-use OAuth and short-lived new-member onboarding."""

import hmac
import re
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, insert, select
from sqlalchemy.exc import IntegrityError

from app.api.auth import COOKIE, EmailInput, ProfileInput, Service, guard, ip
from app.modules.admin.access import with_capabilities
from app.modules.auth import kakao
from app.modules.auth.consent import SignupConsentInput, consented_profile, save_signup_consent
from app.modules.auth.models import accounts, kakao_flows, kakao_identities
from app.modules.auth.service import SESSION_SECONDS, digest, password_hash

router = APIRouter(prefix="/v1/auth/kakao", tags=["auth"], dependencies=[Depends(guard)])
FLOW_COOKIE = "bokji_kakao_flow"
PENDING_COOKIE = "bokji_kakao_signup"
FLOW_SECONDS = 600


class KakaoSignupInput(ProfileInput, EmailInput):
    consent: SignupConsentInput


def cookie(response, request, name, value, seconds=FLOW_SECONDS):
    response.set_cookie(
        name,
        value,
        max_age=seconds,
        httponly=True,
        samesite="lax",
        secure=request.app.state.settings.app_env == "production",
        path="/",
    )


def clear_cookie(response, request, name):
    response.delete_cookie(
        name,
        httponly=True,
        samesite="lax",
        path="/",
        secure=request.app.state.settings.app_env == "production",
    )


def redirect(request, fragment):
    response = RedirectResponse(
        request.app.state.settings.kakao_web_url + "#" + fragment, status_code=303
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def create_flow(service, token, binding, subject=None, nickname=None):
    now = int(time.time())
    with service.engine.begin() as connection:
        connection.execute(delete(kakao_flows).where(kakao_flows.c.expires_at <= now))
        connection.execute(
            insert(kakao_flows).values(
                token_hash=digest(token),
                binding_hash=digest(binding),
                expires_at=now + FLOW_SECONDS,
                subject=subject,
                nickname=nickname or "",
            )
        )


def find_flow(connection, token):
    return (
        connection.execute(
            select(kakao_flows).where(
                kakao_flows.c.token_hash == digest(token),
                kakao_flows.c.expires_at > int(time.time()),
            )
        )
        .mappings()
        .first()
    )


@router.get("/status")
def status(request: Request):
    settings = request.app.state.settings
    try:
        kakao.require_configuration(settings)
        enabled = settings.auth_enabled
    except HTTPException:
        enabled = False
    return {"enabled": enabled}


@router.post("/start")
def start(request: Request, response: Response, service: Service):
    settings = request.app.state.settings
    kakao.require_configuration(settings)
    service.throttle("kakao-start:" + ip(request), 20, 900)
    state, binding = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    create_flow(service, state, binding)
    cookie(response, request, FLOW_COOKIE, binding)
    clear_cookie(response, request, PENDING_COOKIE)
    return {"authorization_url": kakao.authorization_url(settings, state)}


@router.get("/callback")
def callback(
    request: Request,
    service: Service,
    state: str = Query(default="", max_length=128),
    code: str = Query(default="", max_length=4096),
    error: str = Query(default="", max_length=256),
):
    settings = request.app.state.settings
    kakao.require_configuration(settings)
    binding = request.cookies.get(FLOW_COOKIE, "")
    valid = False
    with service.engine.begin() as connection:
        flow = find_flow(connection, state)
        if (
            flow
            and flow["subject"] is None
            and binding
            and hmac.compare_digest(flow["binding_hash"], digest(binding))
        ):
            valid = (
                connection.execute(
                    delete(kakao_flows).where(kakao_flows.c.token_hash == digest(state))
                ).rowcount
                == 1
            )
    from app.api.mobile_oauth import complete_callback

    if re.fullmatch(r"mobile\.[A-Za-z0-9_-]{43}", state):
        response = complete_callback(
            request, service, state.removeprefix("mobile."), code, error, valid
        )
        clear_cookie(response, request, FLOW_COOKIE)
        return response
    if not valid:
        response = redirect(request, "login?kakao=expired")
    elif error:
        response = redirect(request, "login?kakao=cancelled")
    elif not code:
        response = redirect(request, "login?kakao=failed")
    else:
        try:
            subject, nickname = kakao.exchange_identity(settings, code)
            subject = digest("kakao:" + subject)
        except HTTPException:
            response = redirect(request, "login?kakao=failed")
        else:
            with service.engine.connect() as connection:
                account = (
                    connection.execute(
                        select(accounts)
                        .join(kakao_identities, kakao_identities.c.account_id == accounts.c.id)
                        .where(kakao_identities.c.subject == subject)
                    )
                    .mappings()
                    .first()
                )
            if account:
                token, _ = service.issue_session(account, request.cookies.get(COOKIE))
                response = redirect(request, "home")
                cookie(response, request, COOKIE, token, SESSION_SECONDS)
                clear_cookie(response, request, PENDING_COOKIE)
            else:
                pending = secrets.token_urlsafe(32)
                create_flow(service, pending, pending, subject, nickname)
                response = redirect(request, "signup?kakao=complete")
                cookie(response, request, PENDING_COOKIE, pending)
    clear_cookie(response, request, FLOW_COOKIE)
    return response


@router.get("/pending")
def pending(request: Request, service: Service):
    token = request.cookies.get(PENDING_COOKIE, "")
    with service.engine.connect() as connection:
        flow = find_flow(connection, token)
    if not flow or not flow["subject"]:
        raise HTTPException(401, "카카오 인증이 만료됐어요. 다시 로그인해 주세요.")
    return {"name": flow["nickname"] or ""}


@router.post("/cancel")
def cancel(request: Request, response: Response, service: Service):
    token = request.cookies.get(PENDING_COOKIE, "")
    if token:
        with service.engine.begin() as connection:
            connection.execute(delete(kakao_flows).where(kakao_flows.c.token_hash == digest(token)))
    clear_cookie(response, request, PENDING_COOKIE)
    return {"message": "가입 방법을 다시 선택해 주세요."}


@router.post("/complete", status_code=201)
def complete(data: KakaoSignupInput, request: Request, response: Response, service: Service):
    from app.modules.auth.ai_privacy import validate_ai_consent

    validate_ai_consent(data.consent, request.app.state.settings)
    service.throttle("kakao-complete:" + ip(request), 20, 900)
    pending_token = request.cookies.get(PENDING_COOKIE, "")
    # No usable password or phone is created for a social identity.
    now = int(time.time())
    account = dict(
        id=secrets.token_urlsafe(24),
        username="k_" + secrets.token_hex(12),
        password_hash=password_hash(secrets.token_urlsafe(48)),
        phone=None,
        created_at=now,
        email=data.email,
        **consented_profile(data),
    )
    try:
        with service.engine.begin() as connection:
            flow = find_flow(connection, pending_token)
            if not flow or not flow["subject"]:
                raise HTTPException(401, "카카오 인증이 만료됐어요. 다시 로그인해 주세요.")
            consumed = connection.execute(
                delete(kakao_flows).where(kakao_flows.c.token_hash == digest(pending_token))
            )
            if consumed.rowcount != 1:
                raise HTTPException(401, "카카오 로그인을 다시 진행해 주세요.")
            if data.consent.profile:
                account["name"] = data.name or flow["nickname"] or None
            connection.execute(insert(accounts).values(**account))
            save_signup_consent(connection, account["id"], data.consent, now)
            connection.execute(
                insert(kakao_identities).values(subject=flow["subject"], account_id=account["id"])
            )
    except IntegrityError:
        raise HTTPException(409, "이미 가입된 카카오 계정이에요. 다시 로그인해 주세요.") from None
    token, user = service.issue_session(account, request.cookies.get(COOKIE))
    cookie(response, request, COOKIE, token, SESSION_SECONDS)
    clear_cookie(response, request, PENDING_COOKIE)
    return {"user": with_capabilities(service, user)}
