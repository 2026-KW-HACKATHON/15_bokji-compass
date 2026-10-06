"""Cookie-authenticated administrator boundary for the exhibition gateway."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.auth import COOKIE, Service, guard
from app.api.policies import get_repository
from app.modules.admin.access import admin_grants, admin_role
from app.modules.admin.provision import create_operator
from app.modules.auth.models import accounts
from app.modules.storage import public as storage

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(guard)])


def require_superadmin(request, service):
    user = service.me(request.cookies.get(COOKIE))
    if admin_role(service.engine, user["id"]) != "superadmin":
        raise HTTPException(403, "최고 관리자만 관리 기능을 사용할 수 있어요.")
    return user


class CreateAdminInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(pattern=r"^[a-z0-9_]{4,20}$")
    password: SecretStr = Field(min_length=12, max_length=128)
    confirm_password: SecretStr = Field(min_length=12, max_length=128)


@router.get("/session")
def admin_session(request: Request, service: Service):
    user = service.me(request.cookies.get(COOKIE))
    role = admin_role(service.engine, user["id"])
    if role is None:
        raise HTTPException(403, "관리자 계정만 접근할 수 있어요.")
    return {"is_admin": True, "admin_role": role}


@router.get("/accounts")
def list_admin_accounts(request: Request, service: Service):
    require_superadmin(request, service)
    with service.engine.connect() as connection:
        rows = (
            connection.execute(
                select(accounts, admin_grants.c.role, admin_grants.c.created_at.label("granted_at"))
                .join(admin_grants, accounts.c.id == admin_grants.c.account_id)
                .order_by(admin_grants.c.created_at, accounts.c.id)
            )
            .mappings()
            .all()
        )
    return {
        "items": [
            {
                "username": service.public_account(row)["username"],
                "role": row["role"],
                "created_at": row["granted_at"],
            }
            for row in rows
        ]
    }


@router.post("/accounts", status_code=201)
def create_admin_account(data: CreateAdminInput, request: Request, service: Service):
    require_superadmin(request, service)
    password = data.password.get_secret_value()
    if password != data.confirm_password.get_secret_value():
        raise HTTPException(400, "비밀번호 확인이 일치하지 않습니다.")
    try:
        # A browser can never select or assign the superadmin role.
        create_operator(service.engine, data.username, password, role="qr_admin")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    except IntegrityError:
        raise HTTPException(409, "이미 사용 중인 아이디입니다.") from None
    return {"username": data.username, "admin_role": "qr_admin"}


class PublicationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["publish", "unpublish"]
    expected_status: Literal["draft", "reviewed", "published", "rejected"]
    note: str = Field(min_length=1, max_length=1000)


@router.get("/policies")
def publication_list(
    request: Request,
    service: Service,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(pattern=r"^(0|[1-9][0-9]{0,5})$")] = None,
):
    require_superadmin(request, service)
    result = storage.list_publication_revisions(
        get_repository(request), limit=limit, offset=int(cursor or 0)
    )
    return {**result, "autoPublish": request.app.state.settings.policy_auto_publish}


@router.get("/policies/{revision_id}")
def publication_review(revision_id: UUID, request: Request, service: Service):
    require_superadmin(request, service)
    result = storage.review_publication_revision(get_repository(request), str(revision_id))
    if result is None:
        raise HTTPException(404, "공고 개정을 찾을 수 없습니다.")
    return result


@router.post("/policies/{revision_id}/publication")
def publication_update(
    revision_id: UUID,
    data: PublicationInput,
    request: Request,
    service: Service,
):
    user = require_superadmin(request, service)
    try:
        return storage.set_publication_status(
            get_repository(request),
            str(revision_id),
            action=data.action,
            expected_status=data.expected_status,
            actor_id=user["id"],
            note=data.note,
        )
    except storage.PublicationConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except LookupError:
        raise HTTPException(404, "공고 개정을 찾을 수 없습니다.") from None
    except ValueError:
        raise HTTPException(422, "검증 결과와 검토 내용을 확인해 주세요.") from None
