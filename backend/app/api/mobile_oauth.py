"""Browser-bound Kakao OAuth with a fixed app callback and one-use PKCE handoff."""

import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError

from app.api.auth import EmailInput, ProfileInput, Service, guard, ip
from app.modules.auth import kakao
from app.modules.auth.ai_privacy import validate_ai_consent
from app.modules.auth.consent import SignupConsentInput, consented_profile, save_signup_consent
from app.modules.auth.models import accounts, kakao_identities
from app.modules.auth.models import mobile_oauth_flows as flows
from app.modules.auth.service import SESSION_SECONDS, digest, password_hash

router = APIRouter(prefix="/v1/mobile/auth/kakao", dependencies=[Depends(guard)])
CALLBACK = "bokji-compass://auth/callback"
SECONDS = 600
TOKEN = r"^[A-Za-z0-9_-]{43}$"


class StartInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code_challenge: str = Field(pattern=TOKEN)


class ProofInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    flow: str = Field(pattern=TOKEN)
    code_verifier: SecretStr = Field(min_length=43, max_length=128)


class ExchangeInput(ProofInput):
    code: SecretStr = Field(min_length=43, max_length=43)


class CompleteInput(ProfileInput, EmailInput):
    signup_token: SecretStr = Field(min_length=43, max_length=43)
    consent: SignupConsentInput


class PendingInput(BaseModel):
    signup_token: SecretStr = Field(min_length=43, max_length=43)


def challenge(verifier):
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")


def session_result(service, account):
    token, user = service.issue_session(account, mobile=True)
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": SESSION_SECONDS,
        "user": user,
    }


def find(connection, token, *, live=True):
    query = select(flows).where(flows.c.token_hash == digest(token))
    if live:
        query = query.where(flows.c.expires_at > int(time.time()))
    return connection.execute(query).mappings().first()


def app_redirect(flow, **values):
    response = RedirectResponse(
        CALLBACK + "?" + urlencode({"flow": flow, **values}), status_code=303
    )
    response.headers.update({"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    return response


@router.post("/start")
def start(data: StartInput, request: Request, service: Service):
    settings = request.app.state.settings
    kakao.require_configuration(settings)
    service.throttle("mobile-kakao-start:" + ip(request), 20, 900)
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with service.engine.begin() as connection:
        connection.execute(delete(flows).where(flows.c.expires_at <= now))
        connection.execute(
            insert(flows).values(
                token_hash=digest(token),
                challenge=data.code_challenge,
                stage="new",
                expires_at=now + SECONDS,
            )
        )
    # Derive from the configured public callback, never from the request Host header.
    root = settings.kakao_redirect_uri.removesuffix("/v1/auth/kakao/callback")
    if root == settings.kakao_redirect_uri:
        raise HTTPException(503, "카카오 로그인 주소 설정을 확인해 주세요.")
    return {
        "flow": token,
        "expires_in": SECONDS,
        "authorization_url": root + "/v1/mobile/auth/kakao/authorize?" + urlencode({"flow": token}),
    }


@router.get("/authorize")
def authorize(request: Request, service: Service, flow: str = Query(pattern=TOKEN)):
    from app.api.kakao_auth import FLOW_COOKIE, cookie, create_flow

    kakao.require_configuration(request.app.state.settings)
    with service.engine.begin() as connection:
        changed = connection.execute(
            update(flows)
            .where(
                flows.c.token_hash == digest(flow),
                flows.c.stage == "new",
                flows.c.expires_at > int(time.time()),
            )
            .values(stage="browser")
        )
        if changed.rowcount != 1:
            return app_redirect(flow, error="expired")
    binding = secrets.token_urlsafe(32)
    state = "mobile." + flow
    create_flow(service, state, binding)
    response = RedirectResponse(kakao.authorization_url(request.app.state.settings, state), 303)
    cookie(response, request, FLOW_COOKIE, binding)
    response.headers.update({"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    return response


def complete_callback(request, service, flow, code, error, valid):
    if not valid:
        return app_redirect(flow, error="expired")
    with service.engine.connect() as connection:
        record = find(connection, flow)
    if not record or record["stage"] != "browser":
        return app_redirect(flow, error="expired")
    if error or not code:
        with service.engine.begin() as connection:
            connection.execute(delete(flows).where(flows.c.token_hash == digest(flow)))
        return app_redirect(flow, error="cancelled" if error == "access_denied" else "failed")
    try:
        subject, nickname = kakao.exchange_identity(request.app.state.settings, code)
    except HTTPException:
        with service.engine.begin() as connection:
            connection.execute(delete(flows).where(flows.c.token_hash == digest(flow)))
        return app_redirect(flow, error="failed")
    subject = digest("kakao:" + subject)
    handoff = secrets.token_urlsafe(32)
    with service.engine.begin() as connection:
        account_id = connection.execute(
            select(kakao_identities.c.account_id).where(
                kakao_identities.c.subject == subject,
            )
        ).scalar_one_or_none()
        changed = connection.execute(
            update(flows)
            .where(
                flows.c.token_hash == digest(flow),
                flows.c.stage == "browser",
                flows.c.expires_at > int(time.time()),
            )
            .values(
                stage="authorized",
                code_hash=digest(handoff),
                account_id=account_id,
                subject=subject,
                nickname=nickname,
                expires_at=int(time.time()) + 120,
            )
        )
        if changed.rowcount != 1:
            return app_redirect(flow, error="expired")
    return app_redirect(flow, code=handoff)


@router.post("/exchange")
def exchange(data: ExchangeInput, request: Request, service: Service):
    service.throttle("mobile-kakao-exchange:" + ip(request), 40, 900)
    pending = secrets.token_urlsafe(32)
    with service.engine.begin() as connection:
        flow = find(connection, data.flow)
        if (
            not flow
            or flow["stage"] != "authorized"
            or not hmac.compare_digest(
                flow["challenge"], challenge(data.code_verifier.get_secret_value())
            )
            or not hmac.compare_digest(
                flow["code_hash"] or "", digest(data.code.get_secret_value())
            )
        ):
            raise HTTPException(
                401, "카카오 인증이 만료됐거나 일치하지 않아요. 다시 로그인해 주세요."
            )
        consumed = connection.execute(delete(flows).where(flows.c.token_hash == digest(data.flow)))
        if consumed.rowcount != 1:
            raise HTTPException(401, "이미 처리된 인증이에요. 다시 로그인해 주세요.")
        if flow["account_id"]:
            account = (
                connection.execute(
                    select(accounts).where(
                        accounts.c.id == flow["account_id"],
                    )
                )
                .mappings()
                .first()
            )
            if account is None:
                raise HTTPException(401, "계정을 확인할 수 없어요. 다시 로그인해 주세요.")
        else:
            connection.execute(
                insert(flows).values(
                    token_hash=digest(pending),
                    challenge="",
                    stage="pending",
                    expires_at=int(time.time()) + SECONDS,
                    subject=flow["subject"],
                    nickname=flow["nickname"],
                )
            )
            account = None
    if account:
        return {"status": "signed_in", **session_result(service, account)}
    return {"status": "signup_required", "signup_token": pending, "expires_in": SECONDS}


@router.post("/complete", status_code=201)
def complete(data: CompleteInput, request: Request, service: Service):
    validate_ai_consent(data.consent, request.app.state.settings)
    service.throttle("mobile-kakao-complete:" + ip(request), 20, 900)
    token = data.signup_token.get_secret_value()
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
            flow = find(connection, token)
            if not flow or flow["stage"] != "pending" or not flow["subject"]:
                raise HTTPException(401, "카카오 가입 인증이 만료됐어요. 다시 로그인해 주세요.")
            if (
                connection.execute(
                    delete(flows).where(flows.c.token_hash == digest(token))
                ).rowcount
                != 1
            ):
                raise HTTPException(401, "이미 처리된 가입이에요. 다시 로그인해 주세요.")
            if data.consent.profile:
                account["name"] = data.name or flow["nickname"] or None
            connection.execute(insert(accounts).values(**account))
            save_signup_consent(connection, account["id"], data.consent, now)
            connection.execute(
                insert(kakao_identities).values(subject=flow["subject"], account_id=account["id"])
            )
    except IntegrityError:
        raise HTTPException(409, "이미 가입된 카카오 계정이에요. 다시 로그인해 주세요.") from None
    return session_result(service, account)


@router.post("/cancel")
def cancel(data: ProofInput, service: Service):
    with service.engine.begin() as connection:
        connection.execute(
            delete(flows).where(
                flows.c.token_hash == digest(data.flow),
                flows.c.challenge == challenge(data.code_verifier.get_secret_value()),
            )
        )
    return {"cancelled": True}


@router.post("/cancel-signup")
def cancel_signup(data: PendingInput, service: Service):
    with service.engine.begin() as connection:
        connection.execute(
            delete(flows).where(
                flows.c.token_hash == digest(data.signup_token.get_secret_value()),
                flows.c.stage == "pending",
            )
        )
    return {"cancelled": True}
