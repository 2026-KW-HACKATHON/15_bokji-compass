# contracts

2026-10-07: `categories.PolicyCategory`/`POLICY_CATEGORIES`는 8개 분야를,
`PolicyDisplayCategory`/`POLICY_DISPLAY_CATEGORIES`는 `기타`를 포함한 9개 값을 정의합니다.
농림축산·어업과 사업·창업을 추가했으며 파싱·관리자·추천 계약이 공유합니다.
`RecommendationProfile`과 `GuidanceProfile`은 9개 관심 분야를 모두 선택할 수 있습니다.
[분류 기준·기존 공고 반영·검증](../../docs/policy-categories.md).

## 목적과 책임

모듈 사이에서 공유하는 입력·반환 데이터 모델을 관리합니다. 수집 원문 `RawDocument`, 파싱 입력·조건·그룹·추출 계약, 소득·재산 계산과 저장 입력 계약을 제공합니다.

## 현재 상태

`implemented` 상태이며 담당자는 미정입니다.

## 공개 계약

`app.contracts.public.RawDocument`는 `document_id`, `title`, `text`, `source_url`, `collected_at`, `published_at`을 가집니다. `text`는 수집된 원문이며 이 계약에서 사용자 자격을 판정하지 않습니다.

`RawDocument.to_dict()`는 JSON 저장을 위한 딕셔너리를 반환합니다. `utc_now_iso()`는 UTC ISO 8601 문자열을 반환합니다.

`app.contracts.parsing`의 `SourcePolicy`, `ParsedCondition`, `ConditionGroup`, `PolicyExtraction`은 원문 입력·상태/값·주체·조건 그룹을 정의합니다. 숫자·범위·날짜·텍스트·불리언별 모델과 Pydantic 검증 사용. [전체 계약](../../docs/data-contracts.md).

같은 모듈의 `PolicyOverview`는 제목, 입력에서 복사한 `source_url`, 웹과 일치하는 8개 분야 또는 미분류 `null`, 지역·성별·나이·기타 조건, 혜택과 인용된 신청 기간·방법·URL·문의처·게시일·수정일을 표현하는 검토용 계약입니다. URL은 모델이 생성하지 않으며 원문 URL이 없으면 `null`입니다. 지역·성별·나이·혜택은 `specified`, `unrestricted`, `not_stated`, `unclear` 상태와 원문 인용을 가집니다. 출처 정보는 `specified`, `not_stated`, `unclear` 상태이며, 지정된 경우 원문 발췌를 인용해야 합니다. `SourceEvidence`의 실제 원문 일치와 제목·URL 일치는 validation 모듈에서 확인합니다. 자격 판정 계약이 아닙니다. 공지 원문의 application URL 후보는 HTTP(S) 링크 중 처음 20개, URL 최대 512자까지만 보조 필드로 전달합니다.

[`app.contracts.finance`](finance.py)의 `FinancialProfile`, `CalculationInput`, `SaveFinancialProfile`은 가구 구성·가구원 소득·재산·부채·차량과 계산·저장 요청을 정의합니다. 금액은 음수가 아닌 정수 원이며 미입력 `null`과 실제 금액 `0`을 구분합니다. 계약 외 필드는 거부하며 소유 계정 ID와 계산 결과는 클라이언트 입력으로 받지 않습니다. `PolicyFinancialCriteria`는 검토된 공고의 산정 방식·기준연도·가구 범위를 서버 계산에 연결하기 위한 내부 계약입니다. [금융 모듈 사용법](../modules/finance/readme.md).

## 경계

`app.contracts.conditions`는 v2 필드 사전·CanonicalCondition·CanonicalPolicy·LogicNode 제공. 숫자 Decimal 문자열, REGION 체계/코드/버전, all/any/not/unknown 지원. [생성 JSON Schema](../../schemas/welfare-conditions-v2.schema.json)와 런타임 모델 일치 테스트 포함.

특정 수집기·LLM 공급자·DB 구현에 의존하지 않습니다. 파싱·조건 계약은 현재 파일 초안용이며 정책 MySQL 저장·공고 전체의 사용자 자격 판정과 연결되지 않았습니다. 원문 인용 검증은 validation 모듈에서 추가 수행합니다. 금융 입력 계약은 실제 계산 API와 로그인 계정별 저장에 사용합니다.
