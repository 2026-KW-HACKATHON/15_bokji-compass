"""Account-scoped, opt-in ongoing welfare guidance for web and mobile clients."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field, ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import Service, guard
from app.api.members import Member
from app.api.policies import get_repository
from app.contracts.parsing import StrictModel
from app.modules.monitoring.models import (
    CandidateStateInput,
    PreferencesInput,
    SaveMonitoringInput,
)
from app.modules.monitoring.public import MonitoringScanIncomplete
from app.modules.monitoring.schema import initialize_monitoring_schema
from app.modules.monitoring.storage import MonitoringStore
from app.modules.monitoring.worker import evaluate_account

router = APIRouter(prefix="/v1/monitoring", tags=["monitoring"],
                   dependencies=[Depends(guard)])


class EmptyInput(StrictModel):
    pass


class AlertReadInput(StrictModel):
    ids: list[Annotated[str, Field(min_length=1, max_length=128)]] = Field(
        min_length=1, max_length=100)


def get_store(request: Request, service: Service, member: Member) -> MonitoringStore:
    state = request.app.state
    with state.monitoring_lock:
        if state.monitoring_store is None:
            # Production initialization is an explicit additive CLI migration.
            if not state.settings.auth_uses_mysql and state.settings.app_env == "test":
                initialize_monitoring_schema(service.engine)
            state.monitoring_store = MonitoringStore(service.engine)
    return state.monitoring_store


Store = Annotated[MonitoringStore, Depends(get_store)]


def snapshot(store: MonitoringStore, member: dict) -> dict:
    result = store.read(member["id"])
    result["scan_status"] = ("paused" if not result["enabled"] else
                             "ready" if result["last_checked_at"] else "pending")
    return result


def refresh_snapshot(request: Request, store: MonitoringStore, member: dict) -> dict:
    """A failed source read preserves the saved profile, candidates and successful timestamp."""
    try:
        result = evaluate_account(get_repository(request), store, member)
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
    except (SQLAlchemyError, ValidationError, ValueError, MonitoringScanIncomplete):
        pass
    else:
        result["scan_status"] = ("paused" if not result["enabled"] else
                                 "ready" if result["last_checked_at"] else "pending")
        return result
    result = snapshot(store, member)
    result["scan_status"] = "unavailable"
    result["scan_message"] = (
        "지원 공고를 확인하지 못했어요. 저장한 정보를 유지하고 다시 확인해 주세요.")
    return result


@router.get("")
def read_monitoring(member: Member, store: Store):
    return snapshot(store, member)


@router.post("/profile")
def save_profile(data: SaveMonitoringInput, request: Request, member: Member,
                 service: Service, store: Store):
    service.throttle("monitoring:" + member["id"], 20, 60, account_id=member["id"])
    store.save(member["id"], data.profile, enabled=data.enabled)
    return (refresh_snapshot(request, store, member) if data.enabled else snapshot(store, member))


@router.post("/preferences")
def save_preferences(data: PreferencesInput, request: Request, member: Member,
                     service: Service, store: Store):
    service.throttle("monitoring:" + member["id"], 20, 60, account_id=member["id"])
    if data.enabled and store.read(member["id"])["profile"] is None:
        raise HTTPException(409, "생활 정보를 저장하고 지속 안내에 동의해 주세요.")
    store.set_enabled(member["id"], data.enabled)
    return (refresh_snapshot(request, store, member) if data.enabled else snapshot(store, member))


@router.post("/refresh")
def refresh(data: EmptyInput, request: Request, member: Member, service: Service, store: Store):
    if not store.read(member["id"])["enabled"]:
        raise HTTPException(409, "지속 안내를 켠 뒤 지원 공고를 확인할 수 있어요.")
    service.throttle("monitoring-refresh:" + member["id"], 5, 60, account_id=member["id"])
    return refresh_snapshot(request, store, member)


@router.post("/candidates/state")
def save_candidate_state(data: CandidateStateInput, member: Member, store: Store):
    try:
        store.set_candidate_state(member["id"], data.policy_id, data.need_id, data.state)
    except LookupError:
        raise HTTPException(404, "추적 중인 지원 공고를 찾을 수 없어요.") from None
    return snapshot(store, member)


@router.post("/alerts/read")
def read_alerts(data: AlertReadInput, member: Member, store: Store):
    store.mark_read(member["id"], data.ids)
    return {"updated": True}


@router.post("/delete")
def delete_monitoring(data: EmptyInput, request: Request, member: Member, store: Store):
    # Invalidate old consented drafts before deleting, with the same dialogue -> DB
    # lock order as saves. A delayed save must not recreate the removed profile.
    request.app.state.dialogue_store.discard_account(member["id"])
    store.delete(member["id"])
    return snapshot(store, member)
