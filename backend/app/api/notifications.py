"""Bearer-only notification settings and device enrollment."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.auth import Service, guard
from app.api.mobile_auth import Token
from app.modules.notifications.models import DeviceInput, Preferences
from app.modules.notifications.storage import NotificationStore, initialize_notification_schema

router = APIRouter(prefix="/v1/mobile/notifications", tags=["notifications"],
                   dependencies=[Depends(guard)])


def get_store(request: Request, service: Service, token: Token):
    user = service.me(token, mobile=True)
    state = request.app.state
    with state.notification_lock:
        if state.notification_store is None:
            if not state.settings.auth_uses_mysql and state.settings.app_env == "test":
                initialize_notification_schema(service.engine)
            state.notification_store = NotificationStore(service.engine)
    return user["id"], service.session_digest(token, mobile=True), state.notification_store


MemberStore = Annotated[tuple[str, str, NotificationStore], Depends(get_store)]


@router.get("/preferences")
def read_preferences(member: MemberStore):
    account_id, _, store = member
    return store.read(account_id)


@router.post("/preferences")
def save_preferences(data: Preferences, member: MemberStore):
    account_id, _, store = member
    return store.save(account_id, data)


@router.post("/devices")
def register_device(data: DeviceInput, member: MemberStore):
    account_id, session_hash, store = member
    store.register(account_id, session_hash, data)
    return {"registered": True}


@router.post("/devices/disable")
def disable_device(member: MemberStore):
    account_id, session_hash, store = member
    store.disable_session(account_id, session_hash)
    return {"disabled": True}
