"""Public, stateless estimates and explicitly saved, account-private raw facts."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError, field_validator

from app.api.auth import Service, guard
from app.api.members import Member
from app.contracts.finance import CalculationInput, FinanceModel, SaveFinancialProfile
from app.modules.finance import public
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import FinancialProfileStore, StoredFinancialProfile

router = APIRouter(prefix="/v1/finance", tags=["finance"])


class ProfileSaveInput(SaveFinancialProfile):
    @field_validator("consent", mode="before")
    @classmethod
    def explicit_consent(cls, value):
        if value is not True:
            raise ValueError("명시적인 저장 동의가 필요합니다.")
        return value


class DeleteProfileInput(FinanceModel):
    pass


def get_member_store(request: Request, service: Service, user: Member):
    state = request.app.state
    with state.finance_lock:
        if state.finance_store is None:
            if not state.settings.auth_uses_mysql:
                initialize_finance_schema(service.engine)
            state.finance_store = FinancialProfileStore(service.engine)
    return user["id"], state.finance_store


MemberStore = Annotated[tuple[str, FinancialProfileStore], Depends(get_member_store)]


def profile_response(stored: StoredFinancialProfile | None):
    if stored is None:
        return {"profile": None, "calculation": None, "updated_at": None}
    return {
        "profile": stored.profile.model_dump(mode="json"),
        "calculation": public.calculate(stored.profile),
        "updated_at": stored.updated_at,
    }


@router.get("/rules")
def rules():
    return public.rules_catalog()


@router.post("/calculate")
def calculate(data: CalculationInput):
    return public.calculate(data.profile)


@router.get("/profile")
def read_profile(member: MemberStore):
    account_id, store = member
    try:
        stored = store.read(account_id)
    except ValidationError:
        raise HTTPException(
            503, "저장한 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        ) from None
    return profile_response(stored)


@router.post("/profile", dependencies=[Depends(guard)])
def save_profile(data: ProfileSaveInput, member: MemberStore):
    account_id, store = member
    return profile_response(store.save(account_id, data.profile))


@router.post("/profile/delete", dependencies=[Depends(guard)])
def delete_profile(data: DeleteProfileInput, member: MemberStore):
    account_id, store = member
    store.delete(account_id)
    return {"deleted": True}
