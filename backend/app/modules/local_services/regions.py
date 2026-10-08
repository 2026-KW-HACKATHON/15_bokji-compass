"""Name normalization only; never infer administrative/legal neighborhood mappings."""

import re

PROVINCE_ALIASES = {
    "서울특별시": "서울",
    "서울시": "서울",
    "부산광역시": "부산",
    "부산시": "부산",
    "대구광역시": "대구",
    "대구시": "대구",
    "인천광역시": "인천",
    "인천시": "인천",
    "광주광역시": "광주",
    "전남광주통합특별시": "전남광주통합특별시",
    "전남광주": "전남광주통합특별시",
    "대전광역시": "대전",
    "대전시": "대전",
    "울산광역시": "울산",
    "울산시": "울산",
    "세종특별자치시": "세종",
    "세종시": "세종",
    "경기도": "경기",
    "강원도": "강원",
    "강원특별자치도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전라북도": "전북",
    "전북특별자치도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주도": "제주",
    "제주특별자치도": "제주",
}
PROVINCES = frozenset(PROVINCE_ALIASES.values())
DISTRICT = re.compile(r"[가-힣]{1,20}(?:시|군|구)(?: [가-힣]{1,20}구)?\Z")
NEIGHBORHOOD = re.compile(r"[가-힣]{1,20}(?:\d{1,2}(?:[·.]\d{1,2})?)?(?:동|읍|면)\Z")


def normalize_region(value: str) -> str:
    normalized = PROVINCE_ALIASES.get(value.strip(), value.strip())
    if normalized not in PROVINCES | {"", "전국"}:
        raise ValueError("Unknown province name")
    return normalized


def normalize_district(value: str) -> str:
    normalized = " ".join(value.split())
    if normalized and not DISTRICT.fullmatch(normalized):
        raise ValueError("Expected a city, county, district, or city and district name")
    return normalized


def normalize_neighborhood(value: str) -> str:
    normalized = value.strip()
    if normalized and not NEIGHBORHOOD.fullmatch(normalized):
        raise ValueError("Expected an explicit neighborhood name")
    return normalized


def district_contains(coverage: str, selected: str) -> bool:
    return coverage == selected or selected.startswith(coverage + " ")
