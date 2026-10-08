"""Geography, provenance, failure isolation, and the public no-database contract."""

import copy
import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.modules.local_services import public
from app.modules.local_services.__main__ import main


def coverage(region="서울", district="노원구", scope="district", names=None, kind=None):
    return {
        "region": region, "district": district, "scope": scope,
        "neighborhoods": names or [], "neighborhoodType": kind,
    }


def record(identity="district-service", *, areas=None, focus=None, category="care", title=None):
    return {
        "id": identity, "category": category, "title": title or identity,
        "summary": "테스트 서비스 설명", "coverage": areas or [coverage()],
        "focusAreas": focus or [], "area": "테스트 지역", "audience": "대상 확인 필요",
        "cost": "공식 안내 확인", "usage": "공식 기관 문의", "sourceName": "시험용 공식 기관",
        "sourceUrl": f"https://www.nowon.kr/service/{identity}", "checkedAt": "2026-01-02",
        "sourcePublishedAt": "2026-01-01", "evidence": "범위·대상·이용방법 확인 근거",
    }


def write_catalog(directory, records, filename="services.json"):
    directory.mkdir(exist_ok=True)
    (directory / filename).write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def catalog(tmp_path):
    focus = [{"region": "서울", "district": "노원구", "neighborhood": "월계1동",
              "neighborhoodType": "administrative"}]
    records = [
        record("district-service", title="가 지역 전체"),
        record("focus-service", focus=focus, title="하 월계1동 거점", category="transport"),
        record("admin-service", areas=[coverage(scope="neighborhood", names=["월계1동"],
                                               kind="administrative")]),
        record("legal-service", areas=[coverage(scope="neighborhood", names=["월계동"],
                                               kind="legal")]),
        record("sibling-service", areas=[coverage(scope="neighborhood", names=["월계2동"],
                                                 kind="administrative")]),
        record("dobong-service", areas=[coverage(district="도봉구")]),
        record("province-service", areas=[coverage(district="", scope="province")]),
        record("national-service", areas=[coverage(region="전국", district="", scope="national")]),
        record("suwon-service", areas=[coverage(region="경기", district="수원시")]),
        record("yeongtong-service", areas=[coverage(region="경기", district="수원시 영통구")]),
        record("paldal-service", areas=[coverage(region="경기", district="수원시 팔달구")]),
        record("sejong-service", areas=[coverage(region="세종", district="", scope="neighborhood",
                                                names=["조치원읍"], kind="administrative")]),
    ]
    directory = tmp_path / "catalog"
    write_catalog(directory, records)
    return directory


def ids(response):
    return {service["id"] for service in response["items"]}


def test_explicit_neighborhood_keeps_broad_services_without_inventing_crosswalk(catalog):
    response = public.list_services(directory=catalog, region="서울특별시", neighborhood="월계1동")
    assert ids(response) == {
        "district-service", "focus-service", "admin-service",
        "province-service", "national-service",
    }
    assert {item["id"] for item in response["items"][:2]} == {"focus-service", "admin-service"}
    assert response["focus"] == {"region": "서울", "district": "노원구", "neighborhood": "월계1동"}
    assert response["coverage"]["totalServices"] == 12
    assert response["coverage"]["totalDistricts"] == 5
    assert response["checkedAt"] == "2026-01-02"


def test_neighborhood_scope_requires_exact_confirmed_name_and_system(catalog):
    params = {"directory": catalog, "neighborhood": "월계1동", "scope": "neighborhood"}
    assert ids(public.list_services(**params)) == {"focus-service", "admin-service"}
    assert public.list_services(**params, neighborhood_type="legal")["items"] == []
    assert ids(public.list_services(directory=catalog, neighborhood="월계동", scope="neighborhood",
                                    neighborhood_type="legal")) == {"legal-service"}
    assert public.list_services(directory=catalog, scope="neighborhood")["total"] == 0


def test_category_filters_and_metadata_stay_catalog_wide(catalog):
    response = public.list_services(directory=catalog, neighborhood="월계1동", category="transport")
    assert ids(response) == {"focus-service"}
    assert response["coverage"]["totalServices"] == 12


def test_nested_city_district_matches_parent_city_but_never_sibling(catalog):
    response = public.list_services(directory=catalog, region="경기도", district="수원시 영통구")
    assert ids(response) == {"suwon-service", "yeongtong-service", "national-service"}


def test_district_browsing_includes_neighborhoods_without_claiming_exact_match(catalog):
    response = public.list_services(directory=catalog)
    assert ids(response) == {
        "district-service", "focus-service", "admin-service", "legal-service", "sibling-service",
        "province-service", "national-service",
    }
    city = public.list_services(directory=catalog, region="경기", district="수원시")
    assert ids(city) == {"suwon-service", "yeongtong-service", "paldal-service", "national-service"}


def test_province_and_national_browsing(catalog):
    assert public.list_services(directory=catalog, region="전국", district="")["total"] == 12
    response = public.list_services(directory=catalog, region="경기", district="")
    assert ids(response) == {
        "suwon-service", "yeongtong-service", "paldal-service", "national-service",
    }


def test_sejong_neighborhood_has_no_district_and_still_matches_exactly(catalog):
    params = {"directory": catalog, "region": "세종특별자치시", "district": ""}
    assert ids(public.list_services(**params, neighborhood="조치원읍")) == {
        "sejong-service", "national-service",
    }
    assert ids(public.list_services(**params, neighborhood="보람동")) == {"national-service"}


@pytest.mark.parametrize("overrides", [
    {"category": "invalid"}, {"sourceName": "  "}, {"evidence": ""},
    {"sourceUrl": "javascript:alert(1)"}, {"sourceUrl": "http://127.0.0.1/service"},
    {"sourceUrl": "https://user:password@www.nowon.kr/service"},
    {"sourceUrl": "https://www.nowon.kr\\@evil.com/service"},
    {"checkedAt": "2026-02-30"}, {"checkedAt": "9999-01-01"},
    {"sourcePublishedAt": "2026-01-03"},
    {"availableUntil": "2026-02-30"},
    {"coverage": [coverage(scope="neighborhood", names=["월계1동"])]},
    {"coverage": [coverage(scope="district", names=["월계1동"], kind="administrative")]},
    {"focusAreas": [{"region": "서울", "district": "도봉구", "neighborhood": "창1동",
                     "neighborhoodType": "administrative"}]},
])
def test_catalog_rejects_bad_provenance_and_scope(tmp_path, overrides):
    write_catalog(tmp_path, [{**record(), **overrides}])
    with pytest.raises(public.CatalogError, match="Invalid local service catalog"):
        public.load_catalog(tmp_path)


def test_duplicate_across_files_and_catalog_changes_are_detected(tmp_path):
    write_catalog(tmp_path, [record()])
    assert len(public.load_catalog(tmp_path)) == 1
    write_catalog(tmp_path, [record()], "duplicate.json")
    with pytest.raises(public.CatalogError, match="Duplicate service ID"):
        public.load_catalog(tmp_path)
    (tmp_path / "duplicate.json").unlink()
    changed = record("changed-service")
    write_catalog(tmp_path, [changed])
    assert public.load_catalog(tmp_path)[0].id == "changed-service"


def test_duplicate_service_under_another_id_is_rejected(tmp_path):
    original = record()
    duplicate = copy.deepcopy(original)
    duplicate["id"] = "other-id"
    write_catalog(tmp_path, [original, duplicate])
    with pytest.raises(public.CatalogError, match="Duplicate service entry"):
        public.load_catalog(tmp_path)


def test_known_expiration_is_inclusive_and_removes_expired_coverage(tmp_path):
    write_catalog(tmp_path, [
        {**record("dated-service", areas=[coverage(region="경기", district="수원시")]),
         "availableUntil": "2026-12-31"},
        record("ongoing-service"),
    ])
    params = {"directory": tmp_path, "region": "전국", "district": ""}
    assert public.list_services(**params, as_of=date(2026, 12, 30))["total"] == 2
    assert public.list_services(**params, as_of=date(2026, 12, 31))["total"] == 2
    after = public.list_services(**params, as_of=date(2027, 1, 1))
    assert ids(after) == {"ongoing-service"}
    assert after["coverage"]["totalServices"] == 1
    assert after["coverage"]["regions"] == [{"region": "서울", "district": "노원구", "count": 1}]
    # Known end dates filter the public view but do not destroy reviewed records.
    assert len(public.load_catalog(tmp_path)) == 2


def test_all_expired_catalog_is_a_valid_empty_public_view(tmp_path):
    write_catalog(tmp_path, [{**record(), "availableUntil": "2026-01-03"}])
    result = public.list_services(directory=tmp_path, as_of=date(2026, 1, 4))
    assert result["items"] == []
    assert result["coverage"] == {"regions": [], "totalServices": 0, "totalDistricts": 0}
    assert result["checkedAt"] == "2026-01-02"


def test_cli_reports_verified_coverage(catalog, monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["local_services", "validate", "--directory", str(catalog)])
    assert main() == 0
    assert json.loads(capsys.readouterr().out)["totalServices"] == 12


def test_public_api_contract_without_account_or_database(catalog, monkeypatch, tmp_path):
    monkeypatch.setattr(public, "CATALOG_DIRECTORY", catalog)
    database = tmp_path / "unused.sqlite3"
    app = create_app(Settings(_env_file=None, app_env="test", db_enabled=False,
                              auth_sqlite_path=database))
    with TestClient(app) as client:
        response = client.get("/v1/local-services", params={"neighborhood": "월계1동"})
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert response.json()["total"] == 5
        assert app.state.auth_service is None
        assert not database.exists()
        invalid = client.get("/v1/local-services?category=nope")
        assert invalid.status_code == 422
        assert invalid.headers["Cache-Control"] == "no-store"
        assert client.get("/v1/local-services?district=노원구%20101호").status_code == 422
        # An unsupported but syntactically valid area returns only universal services.
        empty = client.get("/v1/local-services?region=제주&district=제주시&category=transport")
        assert empty.status_code == 200
        assert empty.json()["items"] == []
        (catalog / "services.json").write_text('{"broken":true}', encoding="utf-8")
        failed = client.get("/v1/local-services")
        assert failed.status_code == 503
        assert "services.json" not in failed.text
        assert str(catalog) not in failed.text
        assert failed.headers["Cache-Control"] == "no-store"


def test_empty_or_missing_catalog_is_an_error(tmp_path):
    with pytest.raises(public.CatalogError, match="no JSON files"):
        public.load_catalog(tmp_path / "missing")
    write_catalog(tmp_path, [])
    with pytest.raises(public.CatalogError, match="nonempty JSON array"):
        public.load_catalog(tmp_path)
