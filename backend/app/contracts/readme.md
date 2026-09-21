# contracts

## 목적과 책임

모듈 사이에서 공유하는 입력·반환 데이터 모델을 관리합니다. 현재는 수집 원문을 표현하는 `RawDocument` 계약을 제공합니다.

## 현재 상태

`implemented` 상태이며 담당자는 미정입니다.

## 공개 계약

`app.contracts.public.RawDocument`는 `document_id`, `title`, `text`, `source_url`, `collected_at`, `published_at`을 가집니다. `text`는 수집된 원문이며 이 계약에서 사용자 자격을 판정하지 않습니다.

`RawDocument.to_dict()`는 JSON 저장을 위한 딕셔너리를 반환합니다. `utc_now_iso()`는 UTC ISO 8601 문자열을 반환합니다.

## 경계

collector, parser, normalization, storage가 이 계약을 사용할 수 있지만 특정 수집기, LLM 공급자, DB 구현에 의존하지 않습니다. 나이·출신·거주지역 조건 필드는 후속 정규화 계약에서 원문 근거와 함께 결정합니다.
