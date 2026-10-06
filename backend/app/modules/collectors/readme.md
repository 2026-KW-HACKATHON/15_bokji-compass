## 행정안전부 공공데이터포털 API

2026-10-06 광운대 수집 보완: `kwangwoon_notices.parse_kwangwoon_notice(html)`은
`board-view-box`가 있으면 그 영역의 제목·게시일·본문만 `(title,text,published_at)`으로 반환합니다.
이 영역이 없는 이전 HTML은 기존 전체 텍스트 방식으로 처리합니다. 메뉴·사이트 푸터와
숨겨진 스크립트는 공고 본문에 섞지 않습니다. 요약은 수집 후 표준 파이프라인의 개요 단계에서 생성합니다.
검증: `python -m pytest app/modules/collectors/tests/test_kwangwoon_notices.py`.

공공데이터포털에서 발급한 인증키를 `backend/.env`의 `DATA_GO_KR_API_KEY`에 입력합니다. 파일은 Git에서 제외됩니다. 수집기는 공통 설정 로더로 `.env`를 읽으며 프로세스 환경변수가 우선합니다. 함수의 `api_key` 인수로 명시한 값이 가장 우선합니다.

설치 후 저장소 루트의 PowerShell에서 아래 명령을 실행하면 실제 Gov24 API 첫 페이지를 최대 10건 조회합니다. 반환 순서를 유지하며 최신순 정렬은 보장하지 않습니다.

```powershell
Push-Location backend
try {
    .\.venv\Scripts\python.exe -c "from app.modules.collectors.gov24_services import fetch_recent_public_services; from app.modules.presentation.public import format_public_services; print(format_public_services(fetch_recent_public_services(limit=10)))"
} finally {
    Pop-Location
}
```

외부 API 경로·요청 인수는 [Gov24 명세](../../../docs/api/gov24_services_api.md)를 참고합니다. 기본 테스트는 실제 외부 API를 호출하지 않습니다.

## 제한된 서버 수집 계약 (2026-10-02)

서버 수집 worker는 목록 확인과 상세/모델 처리를 분리합니다. 아래 페이지 함수는 한 번의
HTTP 요청만 수행하며 재시도, 전체 페이지 순회, DB 저장, 모델 호출을 자동으로 하지 않습니다.
공급자별 일일 호출 예산과 페이지 체크포인트는 worker의 책임입니다.

- `pages.CollectionPage`: `rows`, `page`, `per_page`, `total_count`, `raw`를 반환합니다.
  `raw`는 비밀 요청 URL이 아닌 응답 원본 바이트입니다. 총 건수가 없는 응답은 `None`입니다.
- `gov24_services.fetch_gov24_page(*, page=1, per_page=10, endpoint="serviceList",
  api_key=None, timeout=15, max_response_bytes=2_000_000, deadline=None)`.
  endpoint는 `serviceList`, `serviceDetail`, `supportConditions` 중 하나입니다.
  각 endpoint를 독립적으로 페이지 조회하고 `서비스ID`로 연결해야 합니다.
  확인되지 않은 ID 필터나 최신순 정렬을 요청하지 않습니다.
- `bokjiro_services.fetch_bokjiro_page(*, page=1, per_page=10, ...)`는 기존 목록 필터와
  동일한 요청에 페이지 메타데이터를 보존합니다. 상세 함수에도 `timeout`,
  `max_response_bytes`, `deadline`을 지정할 수 있습니다.
  `fetch_bokjiro_detail_page(service_id, ...) -> CollectionPage`는 원본 상세 응답도 반환하며
  요청한 ID와 상세 ID의 일치를 검증합니다. 기존 `fetch_bokjiro_service_detail`은 `dict`를
  계속 반환합니다.
- `deadline`은 `time.monotonic()` 기준 절대 시각입니다. HTTP timeout과 응답 읽기에 적용하며,
  응답은 상한을 넘으면 즉시 거절합니다. 기본 socket timeout은 15초입니다.
  요청 인증키의 전달과 숨은 추가 호출을 막기 위해 HTTP redirect를 따라가지 않습니다.
- 전송 실패는 `CollectionTransportError`, 공급자 업무 오류는 `CollectionAPIError`입니다.
  두 오류는 `CollectionError(RuntimeError)`를 상속하고 안전한 `code`, `retryable`,
  `status_code`, `retry_after_seconds`를 제공합니다. 원문 URL, 키, 공급자 오류 본문은
  오류 메시지에 포함하지 않습니다. 잘못된 인수/응답/XML DTD는 `ValueError`입니다.
- 기존 `fetch_recent_public_services`와 `fetch_bokjiro_services`의 `list[dict]` 반환 계약을
  유지합니다. 기존 호출도 HTTP 응답 바이트 상한을 적용합니다.

API 원문의 신청방법·서류·접수기관·법령·연락처·서식은 `normalization.raw`에서
선택한 근거 필드로 보존합니다. 복지로 반복/중첩 항목은 JSON 문자열로 보존하며
첨부 파일 내용을 다운로드하거나 생성하지 않습니다. 기존 `source_hash`는 전체 레코드
JSON hash이며 내용 변경 감지를 위한 별도 hash와 구분합니다.

오프라인 검증: `python -m pytest app/modules/collectors/tests
app/modules/normalization/tests/test_raw.py tests/test_raw_parsing.py`.
실제 계정 쿼터·공급자 최신 동작·노트북에서의 부하 검증은 별도 서버 파일럿입니다.

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
- XML·JSON 응답 처리. API 결과 오류는 안전한 `CollectionAPIError(RuntimeError)`,
  잘못된 인수·응답은 `ValueError`, 전송 실패는 `CollectionTransportError(RuntimeError)`.
- [복지로 명세 초안](../../../docs/api/bokjiro_services_api.md)은 참고 자료입니다. 2026-09-21 소량 실제 XML 응답을 [조사](../../../docs/api-data-analysis.md)했고, 2026-09-22 반복·중첩 보존을 수정했습니다. 기본 회귀 테스트는 HTTP 대역이며 최신 공급자 상태·개별 필터 효과·전체 데이터 검증과 구분합니다.

# collectors

## 목적과 책임

공공기관 어댑터가 전달한 공고문 원문 텍스트와 출처 URL을 검증하고 저장합니다.
공고문을 해석하거나 사용자별 지원 자격을 판정하지 않습니다.

## 현재 상태

`implemented` 상태입니다. 담당자는 미정입니다.

## 공개 진입점과 호출 방법

`app.modules.collectors.public.collect_notice_text`와 `collect_notice_from_url`을 동기 호출합니다.

URL 수집은 HTTP(S)·공개 호스트만 허용하며 DNS 응답 전체의 공인 주소 여부를 확인하고
선택한 IP에 연결을 고정합니다. 환경 프록시와 리다이렉트를 사용하지 않습니다.
광운대·서울 API 어댑터는 각각 `www.kw.ac.kr`, `openapi.seoul.go.kr`로 제한합니다.
응답은 2MB·15초 이내로 읽고 압축 응답을 거부합니다. 기존 404 건너뛰기 계약은
유지하며 전송 오류에 원본 URL·API 키·공급자 오류 본문을 포함하지 않습니다.

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

## 광운대학교 공지

`app.modules.collectors.kwangwoon_notices.collect_kwangwoon_notice`는 광운대학교 공지 상세 URL에서 `[분류] 제목`, 작성일, 화면 텍스트를 추출해 `RawDocument`로 저장합니다. URL의 `srCategoryId`는 항상 `4`로 강제됩니다.

통과한 DUID의 원본 HTML이 필요하면 `fetch_kwangwoon_notice_html(duid)`를 사용합니다. 이 함수는 HTML을 정규화하지 않고 그대로 문자열로 반환합니다.

`collect_kwangwoon_notices(start_duid, end_duid)`는 먼저 `DUID`만 포함한 URL로 게시글 존재 여부를 확인한 뒤, 존재하는 게시글을 `srCategoryId=4` 조건으로 다시 요청합니다. 존재하지 않는 DUID의 HTTP 오류나 공지 형식이 아닌 페이지는 건너뛰고 다음 DUID를 처리합니다.

`app.modules.metrics.kwangwoon.count_kwangwoon_notices(start_duid)`는 전체 공지 목록에서 최신 DUID를 찾은 뒤, 수집기의 조회·파싱 기능을 사용해 `start_duid`부터 최신 DUID까지 순회하고 `srCategoryId=4` 공고의 개수만 반환합니다. `end_duid`를 직접 전달하면 해당 값까지만 검사합니다.

```python
from app.modules.collectors.kwangwoon_notices import collect_kwangwoon_notice

document = collect_kwangwoon_notice(source_url="https://www.kw.ac.kr/ko/life/notice.jsp?..." )
```

```python
from app.modules.collectors.kwangwoon_notices import collect_kwangwoon_notices

documents = collect_kwangwoon_notices(start_duid=53017, end_duid=53030)
```

```python
from app.modules.metrics.kwangwoon import count_kwangwoon_notices

count = count_kwangwoon_notices(start_duid=53017)
```

## 입력과 반환

`title`, `text`, `source_url`은 비어 있지 않은 문자열이어야 합니다. `published_at`은 선택 문자열이며, 미상일 때 `None`입니다. `storage_path`는 테스트나 저장 위치 변경을 위한 선택 경로입니다.

원문 텍스트는 수정하지 않고 저장합니다. 같은 URL을 다시 수집하면 같은 파일을 덮어씁니다. 변경 이력은 아직 지원하지 않습니다.

## 오류와 의존성

필수 입력이 비어 있으면 `ValueError`가 발생합니다. 파일 생성·쓰기 실패는 저장소의 파일 시스템 예외를 그대로 전달합니다. 저장은 `storage.public`의 공개 함수만 사용합니다.

## 범위 밖 작업

웹사이트별 특화 어댑터, PDF 파싱, 정책 추출, 사용자 프로필 조회와 지원 가능 여부 판단은 후속 모듈의 책임입니다.

## 테스트와 AI 후속 작업

2026-09-22: 복지로 XML 파서의 반복·중첩 목록 보존 반영. 수집 후 조건 추출은 [rawdata 파싱](../../../docs/raw-parsing.md)에서 수행하며 수집기 책임과 분리.

`backend` 디렉터리에서 `python -m pytest app/modules/collectors/tests`를 실행합니다. 원문 보존, 파일 생성, 필수값 검증을 확인합니다.

후속 작업자는 `backend/docs/data-contracts.md`, `storage/readme.md`, `app/modules/collectors/tests/test_public.py`를 함께 확인해야 합니다. `RawDocument`에 정책 판정 필드를 추가하거나 collector에서 LLM·DB·사용자 정보를 직접 호출하지 않습니다.
