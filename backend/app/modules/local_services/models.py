"""Strict curated-catalog schema; verified scope and provenance remain explicit."""

import ipaddress
import re
from datetime import date, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .regions import district_contains, normalize_district, normalize_neighborhood, normalize_region

Category = Literal["transport", "health", "care", "culture"]
NeighborhoodType = Literal["administrative", "legal"]
Text = Annotated[str, Field(min_length=1, max_length=3000)]


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class CoverageArea(CatalogModel):
    region: str
    district: str
    scope: Literal["district", "neighborhood", "province", "national"]
    neighborhoods: list[str]
    neighborhoodType: NeighborhoodType | None

    _region = field_validator("region")(normalize_region)
    _district = field_validator("district")(normalize_district)

    @field_validator("neighborhoods")
    @classmethod
    def valid_neighborhoods(cls, values: list[str]) -> list[str]:
        names = [normalize_neighborhood(value) for value in values]
        if any(not name for name in names) or len(set(names)) != len(names):
            raise ValueError("Neighborhood names must be nonempty and unique")
        return names

    @model_validator(mode="after")
    def coherent_scope(self):
        if self.scope == "national":
            if self.region != "전국" or self.district:
                raise ValueError("National coverage requires 전국 and no district")
        else:
            if not self.region or self.region == "전국":
                raise ValueError("Regional coverage needs an explicit province")
            if self.scope == "province" and self.district:
                raise ValueError("Province coverage must not name a district")
            if self.scope in {"district", "neighborhood"} and not self.district:
                if self.region != "세종" or self.scope != "neighborhood":
                    raise ValueError("District coverage needs a district")
        if self.scope == "neighborhood":
            if not self.neighborhoods or self.neighborhoodType is None:
                raise ValueError("Neighborhood coverage needs names and their official system")
        elif self.neighborhoods or self.neighborhoodType is not None:
            raise ValueError("Only neighborhood scope can contain neighborhood names")
        return self


class FocusArea(CatalogModel):
    region: str
    district: str
    neighborhood: str
    neighborhoodType: NeighborhoodType

    _region = field_validator("region")(normalize_region)
    _district = field_validator("district")(normalize_district)
    _neighborhood = field_validator("neighborhood")(normalize_neighborhood)

    @model_validator(mode="after")
    def concrete_area(self):
        if not self.region or self.region == "전국" or not self.neighborhood:
            raise ValueError("Focus area requires an explicit province and neighborhood")
        if not self.district and self.region != "세종":
            raise ValueError("Focus area requires a district outside Sejong")
        return self


class LocalService(CatalogModel):
    id: Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)]
    category: Category
    title: Annotated[str, Field(min_length=1, max_length=200)]
    summary: Text
    coverage: Annotated[list[CoverageArea], Field(min_length=1, max_length=100)]
    focusAreas: Annotated[list[FocusArea], Field(max_length=100)]
    area: Text
    audience: Text
    cost: Text
    usage: Text
    sourceName: Annotated[str, Field(min_length=1, max_length=200)]
    sourceUrl: Annotated[str, Field(min_length=1, max_length=2000)]
    checkedAt: str
    sourcePublishedAt: str | None
    evidence: Text

    @field_validator("sourceUrl")
    @classmethod
    def public_source_url(cls, value: str) -> str:
        if re.search(r"[\s\x00-\x1f\x7f]", value) or "\\" in value:
            raise ValueError("Source URL contains unsafe characters")
        try:
            parts = urlsplit(value)
            host = (parts.hostname or "").lower().rstrip(".")
            port = parts.port
        except ValueError as exc:
            raise ValueError("Invalid source URL") from exc
        if (parts.scheme not in {"https", "http"} or not host or "." not in host
                or parts.username or parts.password or port not in {None, 80, 443}
                or host.endswith((".local", ".localhost", ".internal", ".test", ".invalid"))):
            raise ValueError("Source URL must be a public HTTP(S) agency link")
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError("Source URL must name a public agency hostname")
        return value

    @field_validator("checkedAt", "sourcePublishedAt")
    @classmethod
    def iso_date(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("Dates must use YYYY-MM-DD")
        parsed = date.fromisoformat(value)
        if parsed > datetime.now(ZoneInfo("Asia/Seoul")).date():
            raise ValueError("Evidence dates cannot be in the future")
        return value

    @model_validator(mode="after")
    def provenance_and_duplicates(self):
        if self.sourcePublishedAt and self.sourcePublishedAt > self.checkedAt:
            raise ValueError("Publication cannot be later than verification")
        for values in (self.coverage, self.focusAreas):
            keys = [value.model_dump_json() for value in values]
            if len(set(keys)) != len(keys):
                raise ValueError("Duplicate geographic entries")
        for area in self.focusAreas:
            covered = any(
                candidate.scope == "national"
                or (candidate.region == area.region and (
                    candidate.scope == "province"
                    or (district_contains(candidate.district, area.district) and (
                        candidate.scope == "district"
                        or (area.neighborhood in candidate.neighborhoods
                            and area.neighborhoodType == candidate.neighborhoodType)
                    ))
                ))
                for candidate in self.coverage
            )
            if not covered:
                raise ValueError("Focus area must lie within verified coverage")
        return self
