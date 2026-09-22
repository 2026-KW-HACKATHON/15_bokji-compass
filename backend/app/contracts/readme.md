# contracts

## 목적과 책임

모듈 사이에서 공유하는 입력·반환 데이터 모델을 관리합니다. 수집 원문 `RawDocument`와 파싱 입력·조건·그룹·추출 계약을 제공합니다.

## 현재 상태

`implemented` 상태이며 담당자는 미정입니다.

## 공개 계약

`app.contracts.public.RawDocument`는 `document_id`, `title`, `text`, `source_url`, `collected_at`, `published_at`을 가집니다. `text`는 수집된 원문이며 이 계약에서 사용자 자격을 판정하지 않습니다.

`RawDocument.to_dict()`는 JSON 저장을 위한 딕셔너리를 반환합니다. `utc_now_iso()`는 UTC ISO 8601 문자열을 반환합니다.

`app.contracts.parsing`의 `SourcePolicy`, `ParsedCondition`, `ConditionGroup`, `PolicyExtraction`은 원문 입력·상태/값·주체·조건 그룹을 정의합니다. 숫자·범위·날짜·텍스트·불리언별 모델과 Pydantic 검증 사용. [전체 계약](../../docs/data-contracts.md).

## 경계

특정 수집기·LLM 공급자·DB 구현에 의존하지 않습니다. 현재 계약은 파일 초안용이며 MySQL 테이블·저장 매핑·사용자 판정과 연결되지 않았습니다. 원문 인용 검증은 validation 모듈에서 추가 수행합니다.
