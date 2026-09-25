import hashlib
import json
from zipfile import ZipFile

import pytest

from app.modules.regions.importer import import_snapshot
from app.modules.regions.public import RegionCatalog, default_catalog


def test_official_snapshot_integrity_counts_and_provenance():
    catalog = default_catalog()
    assert len(catalog.rows) == 63000
    assert catalog.metadata["includes_abolished"] is True
    assert catalog.metadata["source_url"].startswith("https://www.mois.go.kr/")
    assert len(catalog.metadata["source_anomalies"]) == 3
    assert sum(r.active(catalog.as_of) for r in catalog.rows if r.system == "ADMIN") == 3924
    assert sum(r.active(catalog.as_of) for r in catalog.rows if r.system == "LEGAL") == 20570


def test_real_codes_ambiguous_names_and_abolished_codes():
    catalog = default_catalog()
    assert catalog.resolve("서울특별시").region.code == "1100000000"
    assert catalog.resolve("강원특별자치도").region.code == "5100000000"
    assert catalog.resolve("강원도").status == "abolished"
    assert catalog.resolve("중구").status == "ambiguous"
    assert catalog.resolve("고성군").status == "ambiguous"
    assert catalog.resolve("가상지역").status == "not_found"
    assert catalog.resolve("서울").status == "not_found"  # no unaudited abbreviation aliases


def test_admin_and_legal_dong_are_distinct_and_not_crosswalk_guessed():
    catalog = default_catalog()
    legal = catalog.resolve("서울특별시 종로구 청운동").region
    admin = catalog.resolve("서울특별시 종로구 청운효자동").region
    assert (legal.system, legal.code) == ("LEGAL", "1111010100")
    assert (admin.system, admin.code) == ("ADMIN", "1111051500")
    assert catalog.resolve("청운효자동", system="LEGAL").status == "not_found"
    assert catalog.contains("ADMIN", admin.code, legal.code) is None


def test_parent_hierarchy_uses_complete_official_names():
    catalog = default_catalog()
    assert catalog.contains("ADMIN", "4100000000", "4111100000") is True
    assert catalog.contains("ADMIN", "4111000000", "4111100000") is True
    assert catalog.contains("ADMIN", "1100000000", "4111100000") is False
    assert catalog.contains("ADMIN", "4200000000", "4111100000") is None
    with pytest.raises(ValueError):
        catalog.validate_code("ADMIN", "9", catalog.version)
    with pytest.raises(ValueError):
        catalog.validate_code("ADMIN", "1100000000", "old-snapshot")


def fixed_row(code, parts, start="19880423", end=""):
    return (code.encode() + b" " + b"".join(p.encode("cp949").ljust(31) for p in parts)
            + start.encode() + b" " + end.encode().ljust(8) + b"\n")


def test_offline_import_fixed_width_unicode_dates_and_tamper_detection(tmp_path):
    archive = tmp_path / "official-fixture.zip"
    with ZipFile(archive, "w") as bundle:
        for system, header, parts in [
            ("H", "행정동코드", ["경기도", "수원시 장안구", ""]),
            ("B", "법정동코드", ["경기도", "수원시 장안구", "", ""]),
        ]:
            bundle.writestr(f"KIKcd_{system}.20260720",
                            header.encode("cp949") + b"\n" + fixed_row("4111100000", parts))
    output = tmp_path / "out"
    meta = import_snapshot(archive, output, effective_date="2026-07-20",
                           source_url="https://www.mois.go.kr/test",
                           download_url="https://www.mois.go.kr/test.zip")
    assert meta["archive_sha256"] == hashlib.sha256(archive.read_bytes()).hexdigest()
    catalog = RegionCatalog(output)
    assert catalog.resolve("경기도 수원시 장안구").region.code == "4111100000"
    with (output / "regions.csv").open("a", encoding="utf-8") as stream:
        stream.write("tamper\n")
    with pytest.raises(ValueError, match="checksum"):
        RegionCatalog(output)
    assert json.loads((output / "manifest.json").read_text())["row_count"] == 2


def test_import_rejects_missing_system_and_archive_paths(tmp_path):
    archive = tmp_path / "invalid.zip"
    with ZipFile(archive, "w") as bundle:
        bundle.writestr("../KIKcd_H.20260720", b"invalid")
    with pytest.raises(ValueError):
        import_snapshot(archive, tmp_path / "out", effective_date="2026-07-20",
                        source_url="https://www.mois.go.kr/test",
                        download_url="https://www.mois.go.kr/test.zip")
    assert not (tmp_path / "out").exists()
