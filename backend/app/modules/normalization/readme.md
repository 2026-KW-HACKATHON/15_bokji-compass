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

## Rawdata 공통 입력

`raw.load_raw_policies(path) -> list[SourcePolicy]`: Gov24 응답 JSON, 복지로 상세 XML/JSON, 저장된 RawDocument JSON을 공통 입력으로 변환. `raw.normalize_record(row) -> SourcePolicy`: 단일 레코드 변환. 원천 ID·해시·주체별 해석용 원문 필드 보존.

기존 `policy.normalize_gov24_service`의 SQL 초안 매핑과 별도 진입점. 신규 조건 추출은 [파싱 파이프라인](../../../docs/raw-parsing.md) 사용.
