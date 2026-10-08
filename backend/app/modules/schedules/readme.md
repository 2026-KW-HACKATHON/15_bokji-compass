# 신청 일정 보강

담당: 백엔드. 기존 원문 전체 → 전용 Codex CLI 기간 추출 → 공식 원문 수집/검색 → 인용 대조로
일정을 보완합니다. 기존 조건/원천 항목을 유지하며 공개 조회에서는 네트워크나 모델을 호출하지 않습니다.

- `audit_schedules(repository)` → 공개 공고의 ID·원문 기간·계산 일정·record 목록. 읽기 전용.
- `extract_period(source, settings, output, reference=None)` → `(PeriodExtraction, metadata)`.
  기존 설정 모델로 신청 일정만 추출하며 반환된 모든 인용을 실제 입력 본문과 대조합니다.
- `build_repair(record, extraction, reference=None)` → 검증된 draft 또는 None.
  원문은 그대로 두고 `calendar_expression`의 근거를 검사해 `application_calendar`에 저장합니다.
  교체 전 기간의 표현은 제거하며 공식 추가 근거의 접수연도가 원문 연도와 맞는지 검사합니다.
- `prepare_repair(record, settings, output, domains=(), urls=(), search=False)` →
  `{status, draft, attempts, schedule?}`. 원문 전체에서 먼저 찾고, 필요한 경우 공식 원문을 수집합니다.
  search는 허용 기관 도메인을 명시해야 하며 기존 discovery의 실제 웹 검색 CLI를 사용합니다.
  검색 요약은 날짜 근거로 저장하지 않고, 수집한 본문과 대상 기관/지역/사업 일치를 확인합니다.
- `save_repair(repository, record, draft)` → 새 개정 ID/reused. 전체 초안 검증과 부모 개정 확인,
  공고별 잠금, 공개 이력을 하나의 트랜잭션으로 처리합니다. 기존 개정은 보존합니다.
  관리자 수정이 있거나 조회 후 공고가 바뀌면 충돌로 중단합니다.
  기존 draft와 같은 결과이면 reused=true로 반환하고 새 개정을 만들지 않습니다.

공식 URL 후보는 최대 3개, HTTP 요청은 redirect 포함 6회/45초/응답 2MB로 제한합니다.
모델 호출은 원문 1회 + 후보당 1회이며 도구가 없는 읽기 전용 격리 실행입니다.
개인 사건 기준 기한이나 기관별로 다른 일정에 임의의 공통 마감일을 만들지 않습니다.

CLI 및 실제 검증은 [일정 보완 기록](../../../docs/application-schedules.md)을 참고합니다.
