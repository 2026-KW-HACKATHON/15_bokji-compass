# 공고 저장소

2026-10-07 관리자 편집: `editor.list_editable_policies`, `read_policy_edit`,
`save_policy_edit`는 수집 기록과 분석 개정의 통합 검색·전체 편집·저장을 제공합니다.
새 개정의 processing_json에 변경자·사유·부모 개정을 기록하고 version 확인과 공개 전환을
같은 공고 잠금/트랜잭션으로 처리합니다. 기존 개정과 수집 원본은 보존합니다.
수동 개정이 있는 공고는 이후 AI 자동 저장·자동 승인이 공개 개정이나 호환 공고를 덮어쓰지
않습니다. 명시적 관리자 공개는 가능합니다. 새 스키마 마이그레이션·LLM 호출은 필요 없습니다.
공개 상세는 본문·원문 항목과 신청 방법·문의처·성별·기타 조건·게시/수정일을 반환합니다.
목록·캘린더에는 긴 원문을 포함하지 않습니다. 관리자 요약은 표시 문체 변환보다 우선합니다.

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

`catalog.list_policies(repository, limit=20, offset=0, sort=None, q="", search_scope="all", search_mode="smart", search_relation=None, category="", region="", audience="", tag="")`
는 `{items,total,nextCursor}`를 반환합니다. `catalog.list_calendar(repository, month=..., q="", search_scope="all", search_mode="smart", search_relation=None, category="", region="", audience="")`
도 같은 `filtered_catalog` SQL 분야·지역·대상 조건을 사용합니다. 기본 자연어 검색은 전체 공개
후보의 원문 관계·지원 목적을 확인한 다음 건수·관련성·페이지를 계산합니다.
빈 검색과 명시적 단어 검색은 SQL 조회를 유지합니다. LLM·외부 HTTP 호출이나 DB 변경은 없습니다.

2026-10-07 자연어 검색: `search_mode="smart"`, `search_scope="all"` 기본은
`광운대에서 올린 장학 공고`와 `광운대생 받을 돈`을 서로 다른 요청으로 해석합니다.
게시 기관·학교 대상·본교/우리대학/학교 문맥·전국 대학생 대상·단순 언급을 구분하고
지원 목적의 관련 표현과 근로/상환 제외 요청을 처리합니다. `search`는 해석·정정·해석별 건수를,
카드 `searchMatch`는 관계·이유·원문 인용을 반환합니다. 원문·검증된 개요 인용만 사용하며
신청 자격이나 회원 프로필을 추정하지 않습니다. 정렬 생략 시 자연어 검색은 `relevance`,
빈 검색·단어 검색은 `popular`입니다. 명시한 `popular/recent/name`은 유지합니다.
새 스키마·외부 모델·검색어 영속 저장은 없습니다.
`search_relation="publisher"/"related"`는 원래 문장 해석을 유지하며 해석별 관계 결과만 좁힙니다.
해석 선택 건수는 목록의 전체 검색 결과, 캘린더의 선택 월 날짜가 있는 공고에 맞춥니다.
미확인 날짜 공고는 별도 `undatedTotal`로 셉니다. 단어 검색에서는 관계 인자를 적용하지 않습니다.

명시적 단어 검색: `search_mode="literal"`의 `search_scope="all"`은 게시 기관 또는 공고 내용을 검색하고,
`organization`은 `source_json.organization`의 게시 기관만, `content`는 제목·원문 주요 항목과
관리자 수정 내용만 검색합니다. 공고 내용은 `text/purpose_summary/eligibility/selection/benefits`와
`draft_json.editorial`의 `summary/benefits/region/age/gender/other` 값입니다.
기관 메타데이터·문의처·URL·첨부 목록·JSON 항목 이름은 내용 검색 근거로 사용하지 않습니다.
원문 본문 안의 기관 이름이나 게시 문구는 일반 단어로 남습니다. 의미·신청 자격을 추정하지 않습니다.
검색어별 AND와 범위 내 OR, 영문 대소문자·공백 정리, `%/_` 문자 이스케이프를 적용합니다.
`광운대`와 `광운대학교`를 함께 찾고, 두 음절 이상 이름의 `X대학교` 검색은 `X대`도 찾습니다.
일반적인 `임대/세대/확대`와 `대학교` 자체에서 학교 이름을 추측하지 않습니다.
`search.search_terms(q)`는 단어별 별칭 튜플 목록을,
`search.search_predicates(catalog,q,scope="all")`는 SQL AND 조건 목록을 반환합니다.
범위가 잘못되면 Python 조회는 `ValueError`, HTTP 조회는 422를 반환합니다.
[검색 계약·예시·검증](../../../docs/policy-search.md).

2026-10-07: 전체 공고의 기본 정렬은 `popular`입니다. Gov24의 `조회수`와 복지로의
`inqNum`을 현재 수집 목록에서 읽어 유효한 누적 조회수 내림차순으로 정렬한 뒤 페이지를
나눕니다. 같은 조회수는 공개 개정 생성일 내림차순·정책 ID 오름차순으로 정렬합니다.
확인된 0회는 조회수 미확인 공고보다 앞에 표시하며 미확인 공고는 최신순으로 이어집니다.
`recent`는 최신순, `name`은 제목순을 유지합니다. 수집 테이블 없는 기존 저장소는 최신순으로
동작하며 요청 중 스키마를 생성하지 않습니다.

목록·상세·캘린더 카드의 `popularity`는 `{views,source,basis,asOf}` 또는 `null`입니다.
출처 사이트 누적 조회수이며 현재 접속자나 신청자 수가 아닙니다.
[조회수 검증·관측 시각·정렬 계약](../../../docs/policy-popularity.md).
카테고리·태그 필터와 카드 표시는 `storage.categories`의 같은 분류 규칙을 사용하며
기존 생활·금융 공고 중 농림축산·어업 및 사업·창업 분야를 다시 표시합니다.

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

인기순 검증: `python -m pytest -p no:cacheprovider tests/test_catalog_popularity.py tests/test_policy_popularity.py`.
격리 SQLite에서 전체 정렬 후 페이지·동점·0/미확인·필터·최신 공개 개정·수집 목록 갱신·
기존 스키마·HTTP 기본값을 검사하고, MySQL 정렬 SQL 컴파일을 별도로 확인합니다.

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
