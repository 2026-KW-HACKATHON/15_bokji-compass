"""Versioned, explicit signup choices; optional consent is never inferred."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from sqlalchemy import insert

from app.modules.auth.models import ADDRESS_FIELDS, auth_consents

NOTICE_VERSION = "2026-10-07.3"
ACCOUNT_RETENTION = "계정 유지 기간 동안 보유하며, 회원 탈퇴 시 즉시 삭제합니다."


class SignupConsentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notice_version: Literal["2026-10-07.3"]
    collection: StrictBool
    profile: StrictBool = False
    ai: StrictBool = False
    ai_notice_version: str | None = Field(default=None, max_length=64)

    @field_validator("collection")
    @classmethod
    def required_collection_consent(cls, value):
        if value is not True:
            raise ValueError("회원가입에 필요한 개인정보 수집·이용 동의가 필요해요.")
        return value


def save_signup_consent(connection, account_id, consent, accepted_at):
    """The caller's account transaction also records the server acceptance time."""
    values = consent.model_dump()
    if not consent.ai:
        values["ai_notice_version"] = None
    connection.execute(
        insert(auth_consents).values(
            account_id=account_id,
            accepted_at=accepted_at,
            **values,
        )
    )


def consented_profile(data):
    if not data.consent.profile:
        return {
            "name": None,
            "age": None,
            "gender": "undisclosed",
            "region": None,
            **dict.fromkeys(ADDRESS_FIELDS),
        }
    return data.model_dump(include={"name", "age", "gender", "region", *ADDRESS_FIELDS})
