# 공식 지역코드

담당: 백엔드(개인 담당 미정). 런타임 네트워크·DB 호출 없음.

- `public.default_catalog() -> RegionCatalog`: Git 포함 스냅샷을 해시 검증 후 캐시.
- `catalog.resolve(name, system=None) -> Resolution`: resolved/ambiguous/abolished/not_found, 후보 목록. 유일한 현행 코드만 `.region` 반환.
- `catalog.contains(system, ancestor, descendant) -> bool | None`: 같은 체계의 지역 포함 검사. 미등록·폐지 코드는 None.
- `catalog.validate_code(system, code, version) -> Region`: 실제 코드·활성 상태·스냅샷 버전 검사. 오류 ValueError.
- `importer.import_snapshot(archive, destination, effective_date=..., source_url=..., download_url=...) -> dict`: 공식 KIKcd ZIP의 코드표만 읽어 CSV·manifest 생성. DB 적재 없음.

소스·갱신 명령·제약은 [사용법](../../../docs/condition-classification.md), 원본 메타데이터는 [스냅샷](../../../reference/regions/readme.md).
검증: backend에서 `python -m pytest tests/test_official_regions.py`.
