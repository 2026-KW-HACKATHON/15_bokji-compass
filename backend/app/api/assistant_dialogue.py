"""Guided, deterministic conversations; only explicitly confirmed facts can be saved."""

import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field, StrictBool, field_validator
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import Service, guard, ip
from app.api.members import Member
from app.api.monitoring import Store, refresh_snapshot, snapshot
from app.api.policies import get_repository
from app.contracts.parsing import StrictModel
from app.modules.assistant.dialogue import respond
from app.modules.assistant.dialogue_models import DialogueError, DialogueInput
from app.modules.auth.service import digest
from app.modules.monitoring.feedback import personalize
from app.modules.monitoring.models import MonitoringProfile

router = APIRouter(prefix="/v1/assistant", tags=["assistant"],
                   dependencies=[Depends(guard)])


class SaveDialogueProfile(StrictModel):
    continuation: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    consent: StrictBool
    confirmed: StrictBool

    @field_validator("consent", "confirmed")
    @classmethod
    def explicit_confirmation(cls, value):
        if value is not True:
            raise ValueError("확인한 생활 정보의 저장에 동의해 주세요.")
        return value


@router.post("/chat/dialogue")
def guest_chat(data: DialogueInput, request: Request, response: Response, service: Service):
    """Ordinary guest chatbot: deterministic guidance, no AI or account/profile access.

    The authenticated AI-assistant dialogue and profile-save routes stay unchanged.
    A separate opaque guest cookie isolates temporary facts between browsers.
    """
    guest = request.cookies.get("bokji_chat", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", guest):
        guest = secrets.token_urlsafe(32)
    service.throttle("assistant-dialogue:guest:" + ip(request), 60, 60)
    try:
        repository = get_repository(request)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        repository = None
    except SQLAlchemyError:
        repository = None
    try:
        result = respond(repository, {"id": "guest:" + digest(guest), "age": None, "region": None},
                         data, request.app.state.dialogue_store)
    except DialogueError as exc:
        raise HTTPException(exc.status_code, exc.message) from None
    result["can_save_profile"] = False
    response.set_cookie("bokji_chat", guest, max_age=1800, httponly=True,
                        secure=request.url.scheme == "https", samesite="lax")
    return result


@router.post("/dialogue")
def dialogue(data: DialogueInput, request: Request, member: Member,
             service: Service, store: Store):
    service.throttle("assistant-dialogue:" + member["id"], 60, 60, account_id=member["id"])
    context = request.app.state.dialogue_store
    preferences = store.read(member["id"])
    saved = preferences["profile"]
    try:
        repository = get_repository(request)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        repository = None
    except SQLAlchemyError:
        # A catalog reflection/connection failure still permits practical guidance.
        repository = None
    try:
        result = respond(repository, member, data, context,
                         saved_profile=MonitoringProfile.model_validate(saved) if saved else None,
                         feedback=preferences.get("recommendation_feedback", []))
        # A catalog scan may outlive account withdrawal. Drop its temporary facts too.
        latest = store.read(member["id"])
        prior_count = len(result["candidates"])
        result["candidates"] = personalize(
            result["candidates"], latest.get("recommendation_feedback", []))
        result["candidate_count"] -= prior_count - len(result["candidates"])
        return result
    except DialogueError as exc:
        raise HTTPException(exc.status_code, exc.message) from None
    except HTTPException as exc:
        if exc.status_code == 401:
            context.discard_account(member["id"])
        raise


@router.post("/dialogue/profile")
def save_dialogue_profile(data: SaveDialogueProfile, request: Request, member: Member,
                          service: Service, store: Store):
    service.throttle("assistant-dialogue-save:" + member["id"], 20, 60,
                     account_id=member["id"])
    try:
        result = request.app.state.dialogue_store.save_confirmed(
            member["id"], data.continuation,
            lambda changes: store.merge_confirmed_profile(member["id"], changes))
    except DialogueError as exc:
        raise HTTPException(exc.status_code, exc.message) from None
    return (refresh_snapshot(request, store, member) if result["enabled"]
            else snapshot(store, member, request))
