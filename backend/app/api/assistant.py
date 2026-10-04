"""Member Q&A: account-scoped limits and a fresh, minimal model context per request."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field, field_validator

from app.api.auth import Service, guard
from app.api.members import Member
from app.api.policies import get_repository
from app.contracts.assistance import GuidanceProfile
from app.contracts.parsing import StrictModel
from app.modules.assistant import public
from app.modules.assistant.faq import prepared_faqs
from app.modules.llm.public import CodexRunError

router = APIRouter(prefix="/v1/assistant", tags=["assistant"], dependencies=[Depends(guard)])


class QuestionInput(StrictModel):
    revision_id: str = Field(pattern=r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")
    question: str = Field(min_length=1, max_length=2000)

    @field_validator("question")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Question is required")
        return value.strip()


@router.get("/faqs")
def faqs(request: Request, member: Member, revision_id: Annotated[str, Query(
        pattern=r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")]):
    repository = get_repository(request)
    record = repository.get_revision(revision_id)
    if record is None or record["review_status"] != "published":
        raise HTTPException(404, "공개된 공고를 찾을 수 없어요.")
    try:
        return prepared_faqs(record, revision_id)
    except ValueError:
        raise HTTPException(503, "공고의 기본 안내를 불러오지 못했어요.") from None


@router.post("/questions")
def question(data: QuestionInput, request: Request, member: Member, service: Service):
    # Authenticate before even reflecting the policy database or invoking the model.
    repository = get_repository(request)
    if repository.get_revision(data.revision_id) is None:
        raise HTTPException(404, "공개된 공고를 찾을 수 없어요.")
    service.throttle("assistant:" + member["id"], 6, 60)
    slots = request.app.state.assistant_slots
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "다른 질문에 답하고 있어요. 잠시 후 다시 질문해 주세요.",
                            headers={"Retry-After": "30"})
    try:
        age = member["age"]
        age_band = None if age is None else (f"{age // 10 * 10}대" if age >= 10 else "10세 미만")
        profile = GuidanceProfile(region=member["region"], age_band=age_band)
        # Bound HTTP work independently of the longer batch ingestion timeout.
        settings = request.app.state.settings.model_copy(update={"codex_timeout_seconds": 60})
        answer = public.answer_question(repository, data.revision_id, data.question,
                                         profile, settings)
        # A revision can be withdrawn while inference is in progress.
        if repository.get_revision(data.revision_id) is None:
            raise HTTPException(404, "공개된 공고를 찾을 수 없어요.")
        return answer
    except (CodexRunError, ValueError, OSError):
        raise HTTPException(
            503, "원문 근거를 확인한 답변을 만들지 못했어요. 다시 질문해 주세요.") from None
    finally:
        slots.release()
