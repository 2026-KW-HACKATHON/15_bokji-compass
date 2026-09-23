## API 정책 정규화

`app.modules.normalization.public.normalize_api_services`는 Gov24 또는 복지로 API의
서비스 목록을 MySQL `policies` 행과 `policy_requirements` 행으로 변환합니다.

```python
from app.modules.collectors.gov24_services import fetch_recent_public_services
from app.modules.normalization.public import normalize_api_services

services = fetch_recent_public_services(limit=10, api_key="...")
normalized = normalize_api_services("gov24", services)
for item in normalized:
	policy_row = item.policy
	requirement_rows = [requirement.to_dict() for requirement in item.requirements]
```

복지로는 상세 응답을 같은 방식으로 전달합니다.

```python
from app.modules.collectors.bokjiro_services import fetch_bokjiro_service_detail

service = fetch_bokjiro_service_detail("WLF-1", api_key="...")
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

`raw.load_raw_policies(path) -> list[SourcePolicy]`: Gov24 응답 JSON, 복지로 상세 XML/JSON, 저장된 RawDocument JSON을 공통 입력으로 변환. `raw.normalize_record(row) -> SourcePolicy`: 단일 레코드 변환. 원천 ID·해시·주체별 해석용 원문 필드 보존.

`normalize_gov24_service`와 `normalize_bokjiro_service`는 각각 한 건 변환이 필요할 때 사용하는 하위 진입점입니다. API 원문은 `source_text`에 JSON으로 보존하고, 지원 대상과 선정 기준은 자동 판정하지 않고 원문 조건으로 저장합니다. 신규 조건 추출은 [파싱 파이프라인](../../../docs/raw-parsing.md)을 사용합니다.
