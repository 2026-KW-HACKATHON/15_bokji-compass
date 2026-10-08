## API 정책 정규화

신규 조건 정규화는 `public.normalize_conditions(extraction, logic=None, catalog=None) -> CanonicalPolicy` 사용. 필드 레지스트리·Decimal 문자열·공식 REGION·미확정 사유 생성. 네트워크·DB 호출 없음. [v2 계약](../../../docs/condition-classification.md). 아래 정책 행 변환과 별도 진입점.

`app.modules.normalization.public.normalize_api_services`는 Gov24 또는 복지로 API의
서비스 목록을 MySQL `policies` 행과 `policy_requirements` 행으로 변환합니다.

`normalize_api_service(provider, service) -> NormalizedPolicy`는 한 건,
`normalize_api_services(provider, services) -> tuple[NormalizedPolicy, ...]`는 목록 입력.
공급자는 `gov24`·`bokjiro`만 허용. 각 원문의 문자열 서비스 ID 필수이며 URL과 별도로 ID 중복 검사.
같은 ID·다른 URL은 중복으로 거부하고, 다른 ID·같은 URL은 별개 정책으로 유지.
빈 목록은 빈 튜플 반환. 잘못된 공급자·입력 형식·ID·역전된 신청기간은 `ValueError`.
API의 상세조회 URL 우선 보존, 없으면 공급자별 식별 URI 사용.

```python
from app.modules.collectors.gov24_services import fetch_recent_public_services
from app.modules.normalization.public import normalize_api_services

services = fetch_recent_public_services(limit=10)  # backend/.env의 인증키 사용
normalized = normalize_api_services("gov24", services)
for item in normalized:
    policy_row = item.policy
    requirement_rows = [requirement.to_dict() for requirement in item.requirements]
```

복지로는 상세 응답을 같은 방식으로 전달합니다.

```python
from app.modules.collectors.bokjiro_services import fetch_bokjiro_service_detail

service = fetch_bokjiro_service_detail("WLF00000026")  # 실제 서비스 ID 사용
normalized = normalize_api_services("bokjiro", [service])[0]
```

이 함수는 행 데이터를 **반환만 하며 실제 INSERT/UPDATE를 실행하지 않습니다.** 아래 저장 순서는 후속 저장소 구현을 위한 설명입니다. 현재 정책 MySQL 저장소는 미구현이며 [구현 상태](../../../docs/implementation-status.md)를 따릅니다.

```python
from app.modules.normalization.policy import normalize_gov24_service

normalized = normalize_gov24_service(service_from_data_go_kr)
policy_row = normalized.policy
requirement_rows = [
    requirement.to_dict(policy_id=created_policy_id)
    for requirement in normalized.requirements
]
```

저장 순서는 `policy_row`를 먼저 insert한 뒤 생성된 `policies.id`를
`policy_id`로 사용해 `requirement_rows`를 insert하는 방식입니다. API 원문은
`source_text`에 JSON으로 보존하고, 최초 상태는 `draft`, 실제 API 데이터는
`is_synthetic = FALSE`로 기록합니다. 지원 대상과 선정 기준은 자동 판정하지
않고 원문 조건으로 저장합니다.

## Rawdata 공통 입력

`raw.load_raw_policies(path) -> list[SourcePolicy]`: Gov24 응답 JSON, 복지로 상세 XML/JSON, 저장된 RawDocument JSON을 공통 입력으로 변환. `raw.normalize_record(row) -> SourcePolicy`: 단일 레코드 변환. 원천 ID·해시·주체별 해석용 원문 필드를 보존하며, Gov24는 요약용 `purpose_summary`와 참고용 `provider_category`도 전달합니다.

2026-10-08 원문 링크 보완: `source_urls.policy_source_url(policy_key, source_url=None,
listing=None) -> str | None`은 원문 HTTP(S) URL, 공급자 목록의 상세 URL 순서로
선택합니다. 누락된 정부24·복지로 주소는 서비스 ID로 공식 상세 페이지 주소를 구성합니다.
일반 공고의 주소는 추측하지 않습니다. `normalize_record`와 공개 catalog가 함께 사용하므로
기존에 URL 없이 저장된 공개 공고도 DB 수정 없이 링크를 제공합니다. 자격 판정이나
신청 URL을 생성하지 않으며 외부 요청은 없습니다. 회귀 검증:
`python -m pytest app/modules/normalization/tests/test_source_urls.py app/modules/normalization/tests/test_raw.py`.

`normalize_gov24_service`와 `normalize_bokjiro_service`는 각각 한 건 변환이 필요할 때 사용하는 하위 진입점입니다. API 원문은 `source_text`에 JSON으로 보존하고, 지원 대상과 선정 기준은 자동 판정하지 않고 원문 조건으로 저장합니다. 신규 조건 추출은 [파싱 파이프라인](../../../docs/raw-parsing.md)을 사용합니다.

위 행 변환은 기존 개발 SQL 계약이며 신규 `state_code=0/1/9` 조건 추출과 구분.
정규식 `condition_type`은 원문 분류 힌트로만 사용. `information_state=specified`는 원문 존재를 뜻하며 자격 확정이 아님.
기존 `normalize_gov24_service` 직접 호출의 ID 누락 허용 동작은 호환성상 유지하므로 신규 수집 연결은 ID를 검사하는 public 진입점 사용.
