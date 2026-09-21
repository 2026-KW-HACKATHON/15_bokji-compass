## 행정안전부 공공데이터포털 API

공공데이터포털에서 발급한 인증키를 `backend/.env`의 `DATA_GO_KR_API_KEY`에 입력합니다. 파일은 Git에서 제외됩니다. 수집기는 공통 설정 로더로 `.env`를 읽으며 프로세스 환경변수가 우선합니다. 함수의 `api_key` 인수로 명시한 값이 가장 우선합니다.

설치 후 저장소 루트의 PowerShell에서 아래 명령을 실행하면 실제 Gov24 API 첫 페이지를 최대 10건 조회합니다. 반환 순서를 유지하며 최신순 정렬은 보장하지 않습니다.

```powershell
Push-Location backend
try {
    .\.venv\Scripts\python.exe -c "from app.modules.collectors.gov24_services import fetch_recent_public_services, format_public_services; print(format_public_services(fetch_recent_public_services(limit=10)))"
} finally {
    Pop-Location
}
```

외부 API 경로·요청 인수는 [Gov24 명세](../../../docs/api/gov24_services_api.md)를 참고합니다. 기본 테스트는 실제 외부 API를 호출하지 않습니다.

## 복지로 중앙부처 복지서비스 API

인증키: `backend/.env`의 `BokjiRO_API_KEY`. 공통 설정 로더에서 자동 로드, 프로세스 환경변수 우선. 함수에 명시한 `api_key`가 최우선.

설치 후 저장소 루트의 PowerShell에서 실행. 아래 명령은 실제 외부 API 호출.

```powershell
Push-Location backend
try {
    .\.venv\Scripts\python.exe -c "from app.modules.collectors.bokjiro_services import fetch_bokjiro_services; print(fetch_bokjiro_services(num_of_rows=10))"
} finally {
    Pop-Location
}
```

- 목록: `fetch_bokjiro_services(...) -> list[dict]`.
- 필터: `search_keyword`(검색어), `life_array`(생애주기), `household_situation`(가구상황), `desire`(관심 주제).
- 상세: `fetch_bokjiro_service_detail(service_id) -> dict`. 목록의 `servId` 사용.
- XML·JSON 응답 처리. API 결과 오류는 `RuntimeError`, 잘못된 인수·응답은 `ValueError` 또는 파서 예외, 전송 실패는 HTTP 계층 예외 전달.
- [복지로 명세 초안](../../../docs/api/bokjiro_services_api.md) 참고. 이번 통합은 HTTP 대역 테스트만 수행, 실제 API 응답 검증 미실시.

# collectors

## 목적과 책임

공공기관 어댑터가 전달한 공고문 원문 텍스트와 출처 URL을 검증하고 저장합니다.
공고문을 해석하거나 사용자별 지원 자격을 판정하지 않습니다.

## 현재 상태

`implemented` 상태입니다. 담당자는 미정입니다.

## 공개 진입점과 호출 방법

`app.modules.collectors.public.collect_notice_text`와 `collect_notice_from_url`을 동기 호출합니다.

```python
from app.modules.collectors.public import collect_notice_text

document = collect_notice_text(
	title="공고 제목",
	text="공고문 원문",
	source_url="https://example.gov/notice/1",
)
```

반환값은 `RawDocument`이며, `document_id`는 URL 기반 식별자입니다.

`collect_notice_from_url(source_url)`은 HTML 공고문을 HTTP로 가져와 `<title>`과 화면 텍스트를 추출한 뒤 같은 저장 경로를 사용합니다. PDF나 로그인·자바스크립트 렌더링 페이지는 아직 지원하지 않습니다.

## 입력과 반환

`title`, `text`, `source_url`은 비어 있지 않은 문자열이어야 합니다. `published_at`은 선택 문자열이며, 미상일 때 `None`입니다. `storage_path`는 테스트나 저장 위치 변경을 위한 선택 경로입니다.

원문 텍스트는 수정하지 않고 저장합니다. 같은 URL을 다시 수집하면 같은 파일을 덮어씁니다. 변경 이력은 아직 지원하지 않습니다.

## 오류와 의존성

필수 입력이 비어 있으면 `ValueError`가 발생합니다. 파일 생성·쓰기 실패는 저장소의 파일 시스템 예외를 그대로 전달합니다. 저장은 `storage.public`의 공개 함수만 사용합니다.

## 범위 밖 작업

웹사이트별 특화 어댑터, PDF 파싱, 정책 추출, 사용자 프로필 조회와 지원 가능 여부 판단은 후속 모듈의 책임입니다.

## 테스트와 AI 후속 작업

`backend` 디렉터리에서 `python -m pytest app/modules/collectors/tests`를 실행합니다. 원문 보존, 파일 생성, 필수값 검증을 확인합니다.

후속 작업자는 `backend/docs/data-contracts.md`, `storage/readme.md`, `app/modules/collectors/tests/test_public.py`를 함께 확인해야 합니다. `RawDocument`에 정책 판정 필드를 추가하거나 collector에서 LLM·DB·사용자 정보를 직접 호출하지 않습니다.
