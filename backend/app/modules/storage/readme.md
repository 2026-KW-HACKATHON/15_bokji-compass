# 공고 저장소

2026-10-06 공고 표시: `catalog.card(record)`는 원천 `purpose_summary`를 목록 설명(`summary`)에
우선 사용하고, 없거나 공백이면 표시 계층의 구형 공고 설명 또는 검증된 개요의 지원 내용으로 대체합니다. 상세 지원 내용(`benefit`)은
검증된 개요를 우선하여 금액·한도를 보존합니다. 원문·개요·인용 근거는 그대로이며 화면 응답만 문체를 정리합니다.
선택 필드 `paymentSchedule: str | null`은 명시된 지급 시기를 별도로 반환합니다.
신청 기간·캘린더 날짜와 구분하며 원문에 없는 날짜는 추정하지 않습니다.
[표시 함수·검증](../presentation/readme.md), [선택 복원한 seed](../../../database/seeds/readme.md).

2026-10-02 자동 승인 기본값: `PolicyRepository(engine, auto_publish=True)`는 검증된 새 needs_review 개정을 저장할 때 공개 상태와 감사 이력을 함께 커밋합니다. 파싱 원문/분석 JSON의 draft 표시는 보존하고 DB 공개 상태만 published로 전환합니다. `POLICY_AUTO_PUBLISH=true`가 기본이며 false는 수동 공개 방식입니다. 동일 결과 재사용으로 관리자가 비공개한 개정을 재공개하지 않습니다. 공고별 잠금으로 수동 변경·자동 저장을 직렬화하며 최신 개정만 자동 공개합니다.

`auto_publish_pending(repository) -> {published,skipped,enabled}`는 기존 공고별 최신 draft를 재검증해 공개하는 명시적 보완 작업입니다. reviewed/rejected와 이전 개정은 건너뜁니다. `python -m app.modules.storage auto-publish`로 실행하며 LLM·재수집 없이 원문을 유지합니다. 자동 승인 실패 시 새 개정 저장·항목 완료·감사 이력을 모두 롤백합니다. matching_enabled는 false를 유지합니다.

담당: 백엔드. 수집 원문 파일과 MySQL 공고·조건·개정·작업 기록을 관리한다.
처리 결과 기본 저장소는 MySQL이다. [실행·이관·오류·검증](../../../docs/policy-storage.md).

## 공개 진입점 (public.py)

- `list_publication_revisions(repository, limit=20, offset=0)` → 초안을 포함한 개정 목록·검증/누락 경고·total/nextCursor. 최고 관리자 API에서만 호출.
- `review_publication_revision(repository, revision_id)` → 카드 미리보기·수집 필드·최근 변경 이력, 없으면 None.
- `set_publication_status(repository, revision_id, action, expected_status, actor_id, note)` → 공개 상태. 검증된 needs_review 결과만 공개하며 AND/OR 미확정 항목은 검토 경고로 유지. 개정 원문·분석 JSON은 변경하지 않음.
- 같은 공고의 개정들을 행 잠금으로 보호. 다른 개정을 공개하면 이전 공개 개정은 reviewed로 전환. 비공개 후 과거 개정이 다시 노출되지 않음. 상태 충돌은 PublicationConflict, 없음은 LookupError.
- `006_policy_publication.sql`은 변경자·이전/이후 상태·메모·시각을 저장. 상태와 이력은 같은 트랜잭션. 공개가 matching_enabled를 활성화하지 않음. 요청 중 테이블 자동 생성 없음.

- initialize_policy_schema(engine) → 적용 SQL/지역 행 수. 명시적 초기화 전용.
- 마이그레이션 체크섬은 Git의 LF/CRLF 변환만 호환하며 기존 기록을 덮어쓰지 않는다. 새 기록은 LF 기준이고 SQL 내용·공백·주석 변경은 계속 거부한다.
- PolicyRepository(engine) → 기존 MySQL 스키마 조회. 자동 초기화하지 않는다.
- start_run(sources, processing) → run_id. 원문/pending 작업 커밋.
- save_result(run_id, draft) → policy_key/status/revision_id/reused/saved. 커밋 후 반환.
- finish_run(run_id, prepare_only=False) → run_id/storage/status/records.
- pending_items(run_id) → 재개할 pending/failed 원문·결과 목록.
- mark_failed(run_id, policy_key, error_code, draft=None) → 실패·체크포인트 저장.
- list_revisions(published_only=True, limit=20, offset=0, policy_key=None) → 개정 요약 목록.
- get_revision(revision_id, published_only=True) → 원문/전체 결과/검토 상태 또는 None.
- import_draft(payload), validate_draft(payload) → v1/v2 검증·명시적 v1 변환.
- backfill_legacy_policies(policy_keys=None) → 저장된 개정을 `policies`/`policy_requirements`에 반영.
- save_raw_document(document, storage_path), list_raw_documents(storage_path) → 기존 수집 원문 파일 저장/조회.

LLM 호출 없음. 검증 오류는 ValueError, DB 오류는 SQLAlchemyError 계열이다.
기본 조회는 공개 공고만 반환하고 로컬 검토에서만 published_only=False를 지정한다.
CLI: python -m app.modules.storage init|import-drafts|list|get (--help 참고).
MySQL 통합 테스트: BOKJI_TEST_MYSQL=1 python -m pytest tests/test_policy_database.py.
Windows 환경변수 지정법은 위 전체 안내를 따른다. 테스트 생성 데이터는 종료 시 정리한다.

## 공고 검색 필터 (2026-10-06)

`catalog.list_policies(repository, limit=20, offset=0, sort="recent", q="", category="", region="", audience="", tag="")`
는 `{items,total,nextCursor}`를 반환합니다. `catalog.list_calendar(repository, month=..., q="", category="", region="", audience="")`
도 같은 `filtered_catalog` SQL 조건을 사용합니다. 검색어·분야·지역·대상은 AND로 적용하고
필터링 후 건수·정렬·페이지를 계산합니다. LLM·외부 HTTP 호출이나 DB 변경은 없습니다.

- 지역 약칭은 정식 명칭과 이전 명칭을 함께 검색합니다. 예: 충북/충청북도,
  전북/전북특별자치도/전라북도. 짧은 이름은 단어 경계를 확인하며 광주 선택에
  경기도 광주시를 포함하지 않습니다. 강서구처럼 중복된 구 이름만으로 시도를 추정하지 않습니다.
- 지역은 명시된 `region_conditions`와 `unrestricted`만 사용합니다. 미확인 지역을
  전국으로 간주하지 않으며 전국 선택은 지역 필터를 생략합니다.
- 대상은 확인된 `age_conditions`와 근거가 있는 `other_conditions`에서 찾습니다.
  어르신은 노인·고령·시니어, 가족은 가구·부모·자녀·아동·영유아·신혼·한부모·양육·출산을 포함합니다.
  불명확한 나이 개요는 검색 근거로 사용하지 않습니다. 숫자 나이만으로 청년·어르신을 추정하지 않으며,
  전체 선택은 대상 필터를 생략합니다. 탐색용 문구 분류이며 신청 자격 판정이 아닙니다.

검증: `BOKJI_TEST_MYSQL=1 python -m pytest tests/test_policy_database.py`.
지역 17개·이전 명칭, 대상 표현, 조합 검색·건수·페이지·캘린더·공개 상태·지역 혼동을
격리된 MySQL에서 확인하고 테스트 생성 ID만 정리합니다.

run_processing(run_id)는 재개 시 원래 모델/추론 설정을 조회합니다. 규칙 버전이 바뀌면 새 실행이 필요합니다.
신규 `save_result`는 개정형 테이블과 001 호환 `policies`/`policy_requirements`를 같은
트랜잭션에서 저장합니다. `source_key` unique 키로 재실행 중복을 막고, 승인 상태는
원문이 바뀔 때만 draft로 되돌립니다. 기존 개정은 `backfill_legacy_policies`로 투영합니다.
MySQL의 순차 대입을 고려해 기존 원문과 새 원문을 바이트 기준으로 먼저 비교한 뒤 갱신합니다.
`010_legacy_policy_capacity.sql`은 기존 행을 보존하면서 제목·기관을 1000자로, 원문 JSON·URL·
조건 근거를 LONGTEXT로 확장합니다. 008의 적용 기록이나 SQL 바이트는 변경하지 않습니다.
기존 `storage.policy`는 001 테이블용 원문 어댑터로 유지합니다.

## 신청일 파싱 (2026-10-06 통합)

`application_dates.application_schedule(period)`는 `{applicationStart,applicationEnd,scheduleStatus}`를,
`application_date_columns(fields, extracted_period=None)`는 `(date | None, date | None)`를 반환합니다.
번호가 붙은 신청기간 줄, `9시`/`18시 30분`/`09:00`과 요일을 인식합니다.
한 기간에 연도가 명시된 날짜가 있으면 반대쪽의 생략된 연도에만 그 연도를 적용합니다.
예: `2026. 9. 28.(월) 09:00 ~ 10. 7.(수) 18:00` → 2026-09-28~2026-10-07.
연도가 양쪽 모두 없거나 날짜가 잘못됐거나 기간이 역전되면 unknown/NULL을 유지합니다.
현재 연도나 지급 시기로 신청일을 추정하지 않습니다. 읽기 전용이며 DB·외부 API에 접근하지 않습니다.

검증: `python -m pytest tests/test_policy_calendar.py app/modules/storage/tests/test_application_dates.py`.
