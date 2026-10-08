"""Public catalog, with unpublished revisions inaccessible over HTTP."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from app.api.mobile_auth import Credentials
from app.contracts.translation import PolicyLanguage, PolicyTranslationResponse
from app.modules.policy_translation.public import TranslationError, translate_public_policy
from app.modules.storage import catalog
from app.modules.storage.public import PolicyRepository

router = APIRouter(prefix="/v1/policies", tags=["policies"])


def get_repository(request: Request):
    state = request.app.state
    if not state.settings.db_enabled or state.database_engine is None:
        raise HTTPException(503, "공고 데이터베이스 연결을 준비하고 있어요.")
    with state.policy_lock:
        if state.policy_repository is None:
            state.policy_repository = PolicyRepository(state.database_engine)
    return state.policy_repository


Repository = Annotated[PolicyRepository, Depends(get_repository)]
Filter = Annotated[str, Query(max_length=100)]


def explorer_member(request: Request, credentials: Credentials, eligible_only: bool = False):
    if not eligible_only:
        return None
    from app.api.auth import get_service
    from app.api.members import get_member

    return get_member(request, get_service(request), credentials)


@router.get("/options")
def search_options(repository: Repository):
    return catalog.explorer_options(repository)


@router.get("")
def list_policies(
    repository: Repository,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(pattern=r"^(0|[1-9][0-9]{0,5})$")] = None,
    sort: Literal["relevance", "popular", "recent", "name"] | None = None,
    q: Annotated[str, Query(max_length=200)] = "",
    search_scope: Literal["all", "organization", "content"] = "all",
    search_mode: Literal["smart", "literal"] = "smart",
    search_relation: Literal["publisher", "related"] | None = None,
    category: Filter = "",
    region: Filter = "",
    audience: Filter = "",
    tag: Filter = "",
    provider: Annotated[str, Query(pattern=r"^[a-zA-Z0-9_-]{0,50}$")] = "",
    organization: Filter = "",
    status: Literal[
        "", "upcoming", "open", "closed", "selecting", "selected", "paying", "paid"
    ] = "",
    age_bands: Annotated[
        list[Literal["0-18", "19-24", "25-30", "31-39", "40-64", "65-120"]], Query(max_length=6)
    ] = [],
    age_min: Annotated[int | None, Query(ge=0, le=120)] = None,
    age_max: Annotated[int | None, Query(ge=0, le=120)] = None,
    eligible_only: bool = False,
    member: Annotated[dict | None, Depends(explorer_member)] = None,
):
    if age_min is not None and age_max is not None and age_min > age_max:
        raise HTTPException(422, "최소 나이는 최대 나이보다 클 수 없어요.")
    return catalog.list_policies(
        repository,
        limit=limit,
        offset=int(cursor or 0),
        sort=sort,
        q=q,
        search_scope=search_scope,
        search_mode=search_mode,
        search_relation=search_relation,
        category=category,
        region=region,
        audience=audience,
        tag=tag,
        provider=provider,
        organization=organization,
        status=status,
        age_bands=age_bands,
        age_min=age_min,
        age_max=age_max,
        eligible_only=eligible_only,
        member=member,
    )


@router.get("/calendar")
def calendar(
    repository: Repository,
    month: Annotated[str, Query(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")],
    q: Annotated[str, Query(max_length=200)] = "",
    search_scope: Literal["all", "organization", "content"] = "all",
    search_mode: Literal["smart", "literal"] = "smart",
    search_relation: Literal["publisher", "related"] | None = None,
    category: Filter = "",
    region: Filter = "",
    audience: Filter = "",
):
    return catalog.list_calendar(
        repository,
        month=month,
        q=q,
        search_scope=search_scope,
        search_mode=search_mode,
        search_relation=search_relation,
        category=category,
        region=region,
        audience=audience,
    )


@router.get("/{policy_key}")
def get_policy(policy_key: str, repository: Repository):
    result = catalog.get_policy(repository, policy_key)
    if result is None:
        raise HTTPException(404, "공개된 공고를 찾을 수 없어요.")
    return result


async def validate_translation_request(request: Request):
    # Only published policy identity and a fixed language can reach the generation service.
    items = list(request.query_params.multi_items())
    if (
        len(items) != 1
        or items[0][0] != "language"
        or items[0][1] not in {"ko", "en", "zh", "vi", "ja"}
    ):
        raise HTTPException(422, {"code": "translation_invalid_request"})
    async for chunk in request.stream():
        if chunk:
            raise HTTPException(422, {"code": "translation_invalid_request"})


def translation_repository(request: Request):
    try:
        return get_repository(request)
    except HTTPException as error:
        raise HTTPException(error.status_code, {"code": "translation_unavailable"}) from None


@router.get(
    "/{policy_key}/translation",
    response_model=PolicyTranslationResponse,
    dependencies=[Depends(validate_translation_request)],
    responses={
        404: {"description": "Published policy not found"},
        422: {"description": "Only a policy ID and supported language are accepted"},
        429: {"description": "Translation generation is busy"},
        503: {"description": "Translation provider or durable cache is unavailable"},
    },
)
def translate_policy(
    request: Request,
    policy_key: Annotated[str, Path(min_length=1, max_length=255)],
    language: Annotated[PolicyLanguage, Query()],
    repository: Annotated[PolicyRepository, Depends(translation_repository)],
):
    try:
        return translate_public_policy(
            repository,
            policy_key,
            language,
            request.app.state.settings,
            request.app.state.policy_translation_slots,
        )
    except TranslationError as error:
        headers = {"Retry-After": str(error.retry_after)} if error.status_code == 429 else None
        raise HTTPException(error.status_code, {"code": error.code}, headers=headers) from None
