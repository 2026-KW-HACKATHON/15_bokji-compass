"""Public geographic service browsing; query inputs never access member addresses."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Response

from app.modules.local_services import public

router = APIRouter(prefix="/v1/local-services", tags=["local-services"])
logger = logging.getLogger(__name__)


@router.get("")
def local_services(
    response: Response,
    region: Annotated[str, Query(max_length=30)] = "서울",
    district: Annotated[str, Query(max_length=50)] = "노원구",
    neighborhood: Annotated[str, Query(max_length=40)] = "",
    neighborhood_type: Literal["unknown", "administrative", "legal"] = "unknown",
    category: Literal["all", "transport", "health", "care", "culture"] = "all",
    scope: Literal["all", "neighborhood"] = "all",
):
    response.headers["Cache-Control"] = "no-store"
    try:
        return public.list_services(
            region=region, district=district, neighborhood=neighborhood,
            neighborhood_type=neighborhood_type, category=category, scope=scope,
        )
    except public.CatalogError:
        logger.exception("The reviewed local service catalog is unavailable")
        raise HTTPException(
            503, "지역 복지 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
            headers={"Cache-Control": "no-store"},
        ) from None
    except ValueError:
        raise HTTPException(
            422, "시·도, 시·군·구와 동·읍·면 이름을 확인해 주세요.",
            headers={"Cache-Control": "no-store"},
        ) from None
