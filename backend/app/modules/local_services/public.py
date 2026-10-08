"""Read-only catalog API. No account data, database, HTTP requests, or invented records."""

import json
from collections import defaultdict
from pathlib import Path

from .models import LocalService
from .regions import (
    district_contains,
    normalize_district,
    normalize_neighborhood,
    normalize_region,
)

CATALOG_DIRECTORY = Path(__file__).resolve().parents[3] / "reference/local_services/services"
FOCUS = {"region": "서울", "district": "노원구", "neighborhood": "월계1동"}


class CatalogError(ValueError):
    """Curated files are missing or invalid; never substitute sample records."""


def load_catalog(directory: Path | None = None) -> tuple[LocalService, ...]:
    """Validate all files on read so edits and deletions never leave a stale catalog."""
    root = directory if directory is not None else CATALOG_DIRECTORY
    try:
        files = sorted(root.glob("*.json"))
        if not files:
            raise CatalogError("Local service catalog has no JSON files")
        services = []
        identities = set()
        names = set()
        for path in files:
            try:
                records = json.loads(path.read_text(encoding="utf-8-sig"))
                if not isinstance(records, list) or not records:
                    raise ValueError("Each catalog file must contain a nonempty JSON array")
                for record in records:
                    service = LocalService.model_validate(record)
                    if service.id in identities:
                        raise ValueError(f"Duplicate service ID: {service.id}")
                    # Identical titles in different regions are valid.
                    name_key = (service.title, service.sourceUrl, tuple(sorted(
                        area.model_dump_json() for area in service.coverage
                    )))
                    if name_key in names:
                        raise ValueError(f"Duplicate service entry: {service.id}")
                    identities.add(service.id)
                    names.add(name_key)
                    services.append(service)
            except (OSError, UnicodeError, ValueError) as exc:
                raise CatalogError(f"Invalid local service catalog {path.name}: {exc}") from exc
        return tuple(services)
    except OSError as exc:
        raise CatalogError("Local service catalog cannot be read") from exc


def _neighborhood_matches(name: str, kind: str | None, selected: str, selected_kind: str) -> bool:
    return bool(selected) and name == selected and (
        selected_kind == "unknown" or kind == selected_kind
    )


def _exact_local_match(service, region, district, neighborhood, neighborhood_type):
    for area in service.focusAreas:
        if area.region == region and area.district == district and _neighborhood_matches(
            area.neighborhood, area.neighborhoodType, neighborhood, neighborhood_type
        ):
            return True
    return any(
        area.scope == "neighborhood" and area.region == region and area.district == district
        and any(_neighborhood_matches(name, area.neighborhoodType, neighborhood, neighborhood_type)
                for name in area.neighborhoods)
        for area in service.coverage
    )


def _applies(service, region, district, neighborhood, neighborhood_type):
    for area in service.coverage:
        if not region or region == "전국" or area.scope == "national":
            return True
        if area.region != region:
            continue
        if (not district and not neighborhood) or area.scope == "province":
            return True
        if not district_contains(area.district, district):
            if not neighborhood and district_contains(district, area.district):
                return True
            continue
        if area.scope == "district" or not neighborhood:
            return True
        if any(_neighborhood_matches(name, area.neighborhoodType, neighborhood, neighborhood_type)
               for name in area.neighborhoods):
            return True
    return False


def catalog_coverage(services: tuple[LocalService, ...]) -> dict:
    districts: dict[tuple[str, str], set[str]] = defaultdict(set)
    for service in services:
        for area in service.coverage:
            districts[(area.region, area.district)].add(service.id)
    return {
        "regions": [
            {"region": region, "district": district, "count": len(identities)}
            for (region, district), identities in sorted(districts.items())
        ],
        "totalServices": len(services),
        "totalDistricts": sum(bool(district) for _, district in districts),
    }


def list_services(
    *, region: str = "서울", district: str = "노원구", neighborhood: str = "",
    neighborhood_type: str = "unknown", category: str = "all", scope: str = "all",
    directory: Path | None = None,
) -> dict:
    region = normalize_region(region)
    district = normalize_district(district)
    neighborhood = normalize_neighborhood(neighborhood)
    if neighborhood_type not in {"unknown", "administrative", "legal"}:
        raise ValueError("Invalid neighborhood type")
    if category not in {"all", "transport", "health", "care", "culture"}:
        raise ValueError("Invalid service category")
    if scope not in {"all", "neighborhood"}:
        raise ValueError("Invalid service scope")
    if (district or neighborhood) and region in {"", "전국"}:
        raise ValueError("A district or neighborhood requires an explicit province")
    if neighborhood and not district and region != "세종":
        raise ValueError("A neighborhood requires an explicit district outside Sejong")
    services = load_catalog(directory)
    result = []
    for service in services:
        if category != "all" and service.category != category:
            continue
        exact = _exact_local_match(service, region, district, neighborhood, neighborhood_type)
        if scope == "neighborhood" and not exact:
            continue
        if scope == "all" and not _applies(
            service, region, district, neighborhood, neighborhood_type
        ):
            continue
        result.append((not exact, service))
    result.sort(key=lambda pair: (pair[0], pair[1].title, pair[1].id))
    return {
        "items": [service.model_dump() for _, service in result],
        "total": len(result),
        "coverage": catalog_coverage(services),
        "focus": dict(FOCUS),
        "checkedAt": min(service.checkedAt for service in services),
    }
