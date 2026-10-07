"""Public catalog, with unpublished revisions inaccessible over HTTP."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

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


@router.get("")
def list_policies(
    repository: Repository,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(pattern=r"^(0|[1-9][0-9]{0,5})$")] = None,
    sort: Literal["popular", "recent", "name"] = "popular",
    q: Annotated[str, Query(max_length=200)] = "",
    category: Filter = "",
    region: Filter = "",
    audience: Filter = "",
    tag: Filter = "",
):
    return catalog.list_policies(
        repository,
        limit=limit,
        offset=int(cursor or 0),
        sort=sort,
        q=q,
        category=category,
        region=region,
        audience=audience,
        tag=tag,
    )


@router.get("/calendar")
def calendar(
    repository: Repository,
    month: Annotated[str, Query(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")],
    q: Annotated[str, Query(max_length=200)] = "",
    category: Filter = "",
    region: Filter = "",
    audience: Filter = "",
):
    return catalog.list_calendar(
        repository, month=month, q=q, category=category, region=region, audience=audience
    )


@router.get("/{policy_key}")
def get_policy(policy_key: str, repository: Repository):
    result = catalog.get_policy(repository, policy_key)
    if result is None:
        raise HTTPException(404, "공개된 공고를 찾을 수 없어요.")
    return result
