"""Shared web/mobile recommendations with optional member facts and explicit finance use."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.api.auth import COOKIE, get_service, guard
from app.api.members import get_member
from app.api.mobile_auth import Credentials
from app.api.policies import get_repository
from app.contracts.matching import RecommendationInput
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import FinancialProfileStore
from app.modules.matching import public
from app.modules.monitoring.storage import load_recommendation_feedback

router = APIRouter(prefix="/v1/recommendations", tags=["recommendations"],
                   dependencies=[Depends(guard)])


def optional_member(request: Request, credentials: Credentials):
    if "authorization" in request.headers or COOKIE in request.cookies:
        return get_member(request, get_service(request), credentials)
    return None


OptionalMember = Annotated[dict | None, Depends(optional_member)]


@router.post("")
def recommendations(data: RecommendationInput, request: Request, member: OptionalMember):
    if data.financialProfile is not None and data.use_saved_financial_profile:
        raise HTTPException(422, "금융정보는 직접 입력 또는 저장 정보 중 하나를 선택해 주세요.")
    if data.use_saved_financial_profile and member is None:
        raise HTTPException(401, "저장한 금융정보를 사용하려면 로그인이 필요해요.")
    repository = get_repository(request)
    financial = data.financialProfile
    if data.use_saved_financial_profile:
        service = get_service(request)
        with request.app.state.finance_lock:
            if request.app.state.finance_store is None:
                if not request.app.state.settings.auth_uses_mysql:
                    initialize_finance_schema(service.engine)
                request.app.state.finance_store = FinancialProfileStore(service.engine)
        try:
            stored = request.app.state.finance_store.read(member["id"])
        except ValidationError:
            raise HTTPException(503, "저장한 금융정보를 확인하지 못했어요.") from None
        if stored is None:
            raise HTTPException(409, "저장한 금융정보가 없어요. 먼저 입력·저장해 주세요.")
        financial = stored.profile
    facts = public.build_facts(member, data.profile, financial)
    feedback = (load_recommendation_feedback(get_service(request).engine, member["id"])
                if member is not None else [])
    result = public.recommend(repository, facts, data.profile, limit=data.limit, feedback=feedback)
    result["profile_source"] = "account" if member is not None else "request"
    result["financial_source"] = (
        "account" if data.use_saved_financial_profile else "request" if financial else "none")
    return result
