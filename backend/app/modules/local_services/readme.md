# 지역 생활 복지 카탈로그

공식기관에서 확인한 생활 서비스 요약을 지역별로 조회하는 독립 읽기 모듈입니다.
DB·회원정보·외부 네트워크·LLM에 의존하지 않습니다. 외부 모듈은 `public.py`만 사용합니다.

`public.load_catalog(directory=None)`는 모든 JSON 파일을 검증해 서비스 튜플을 반환합니다.
`public.list_services(...)`는 지역, 동 유형, 분야, 범위에 따라 필터링한 공개 응답을 만듭니다.
`public.catalog_coverage(services)`는 실제 수집 데이터의 지역별 건수를 반환합니다.
파일 누락·손상·중복은 `CatalogError`이며 HTTP 경계에서 안전한 503으로 변환합니다.

```powershell
# backend 디렉터리에서 실행. DB나 네트워크를 사용하지 않습니다.
.\.venv\Scripts\python.exe -m app.modules.local_services validate
.\.venv\Scripts\python.exe -m pytest -q tests/test_local_services.py
```

계약과 갱신 절차는 [운영 문서](../../../docs/local-services.md),
버전 관리되는 검증 요약은 [데이터 디렉터리](../../../reference/local_services/readme.md)를
참조하세요. HTTP 요청마다 소규모 파일을 검증하여 수정·삭제한 자료가 즉시 반영됩니다.
