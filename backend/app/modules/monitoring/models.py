"""Explicit account monitoring facts and actions; omitted facts stay unknown."""

from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator

from app.contracts.categories import POLICY_DISPLAY_CATEGORIES, PolicyDisplayCategory
from app.contracts.matching import Occupation
from app.contracts.parsing import StrictModel


def seoul_today() -> date:
    return datetime.now(ZoneInfo("Asia/Seoul")).date()


class MonitoringProfile(StrictModel):
    occupation: Occupation | None = None
    household: Literal["혼자 살아요", "가족과 살아요"] | None = None
    interests: list[PolicyDisplayCategory] = Field(
        default_factory=list, max_length=len(POLICY_DISPLAY_CATEGORIES))
    housing_tenure: Literal["owner", "renter", "other"] | None = None
    housing_type: Literal["detached", "multi_family", "apartment", "other"] | None = None
    building_year: int | None = Field(default=None, ge=1800)
    repair_needed: bool | None = None
    job_seeking: bool | None = None
    disaster_type: Literal["flood", "fire", "earthquake", "other"] | None = None
    disaster_damage: bool | None = None
    disaster_occurred_on: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")

    @field_validator("building_year")
    @classmethod
    def validate_building_year(cls, value):
        if value is not None and value > seoul_today().year:
            raise ValueError("준공 연도는 올해 이전의 연도로 입력해 주세요.")
        return value

    @field_validator("disaster_occurred_on")
    @classmethod
    def validate_disaster_date(cls, value):
        if value is not None:
            occurred = date.fromisoformat(value)
            if occurred > seoul_today():
                raise ValueError("피해 발생일은 오늘 이전의 날짜로 입력해 주세요.")
        return value


class SaveMonitoringInput(StrictModel):
    profile: MonitoringProfile
    consent: bool
    enabled: bool

    @field_validator("consent")
    @classmethod
    def require_consent(cls, value):
        if value is not True:
            raise ValueError("지속 안내를 위한 정보 저장에 동의해 주세요.")
        return value


class PreferencesInput(StrictModel):
    enabled: bool


class CandidateStateInput(StrictModel):
    policy_id: str = Field(min_length=1, max_length=128)
    need_id: str = Field(min_length=1, max_length=64)
    state: Literal["watching", "preparing", "applied", "dismissed", "completed"]
