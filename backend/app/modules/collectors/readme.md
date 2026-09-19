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
