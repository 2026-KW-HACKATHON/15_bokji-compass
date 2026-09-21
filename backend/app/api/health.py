"""Operational health checks; no business data or schema creation."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter(tags=["health"])


@router.get("/health")
def liveness() -> dict[str, str]:
    return {"status": "ok", "service": "bokji-compass-backend"}


@router.get("/health/ready", responses={503: {"description": "Database unavailable"}})
def readiness(request: Request) -> JSONResponse:
    engine = request.app.state.database_engine
    if engine is None:
        return JSONResponse(
            status_code=503, content={"status": "not_ready", "database": "disabled"},
        )
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        # Driver errors may contain connection details. Do not return them to callers.
        return JSONResponse(
            status_code=503, content={"status": "not_ready", "database": "unavailable"},
        )
    return JSONResponse(content={"status": "ready", "database": "reachable"})
