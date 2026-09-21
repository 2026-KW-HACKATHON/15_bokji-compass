## Gov24 정책 정규화

`app.modules.normalization.policy.normalize_gov24_service`는 Gov24의 한 개
서비스 응답을 MySQL `policies` 행과 `policy_requirements` 행으로 변환합니다.

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
