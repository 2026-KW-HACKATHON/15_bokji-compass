"""Recommendation preferences are request-only; account facts come from the session."""

from typing import Literal

from pydantic import Field

from app.contracts.categories import POLICY_DISPLAY_CATEGORIES, PolicyDisplayCategory
from app.contracts.finance import FinancialProfile
from app.contracts.parsing import StrictModel

RegionName = Literal[
    "전국", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
    "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
]
AgeBand = Literal["19세 미만", "19~34세", "35~49세", "50~64세", "65세 이상"]
Category = PolicyDisplayCategory
# Keep legacy values readable; display labels and groupings belong to the client.
Occupation = Literal[
    "학생", "취업 준비 중", "직장인", "자영업자", "프리랜서", "무직", "은퇴 후", "기타"
]


class RecommendationProfile(StrictModel):
    region: RegionName = "전국"
    ageBand: AgeBand | None = None
    occupation: Occupation | None = None
    household: Literal["혼자 살아요", "가족과 살아요"] | None = None
    interests: list[Category] = Field(
        default_factory=list, max_length=len(POLICY_DISPLAY_CATEGORIES))


class RecommendationInput(StrictModel):
    profile: RecommendationProfile | None = None
    limit: int = Field(default=3, strict=True, ge=1, le=3)
    financialProfile: FinancialProfile | None = None
    use_saved_financial_profile: bool = Field(default=False, strict=True)
