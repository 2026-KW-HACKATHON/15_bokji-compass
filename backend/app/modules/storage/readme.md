# 공고 저장소

2026-10-09 동시 조회 개선: `PolicyRepository(engine)`는 인스턴스마다
`catalog_cache.PublicCatalogCache`를 생성합니다. 기존 `catalog.list_policies`,
`list_calendar`, `get_policy`, `explorer_options`의 입력·반환 계약은 유지합니다.
공개 목록/검색/상세/필터 옵션/캘린더 응답은 30초 재사용하며 결과마다 JSON 복사본을
반환합니다. 최대 256개·응답 JSON 합계 16MiB의 LRU와 공개 원문 스냅샷 1개를 보관합니다.
동일 키의 동시 미스는 Future로 한 번만 계산합니다. 회원이나 `eligible_only=True`가
전달된 결과는 공용 응답 캐시에 넣지 않습니다.

매 요청에서 실제 DB의 공개 revision ID·원문 해시·분석 fingerprint·공급자 listing JSON
SHA-256을 확인합니다. 철회·새 승인·수동 수정으로 생긴 새 개정·조회수 변경은 즉시
캐시를 무효화하고, DB 확인 실패 시 기존 응답을 반환하지 않고 원래 DB 오류를 전파합니다.
기존 저장 계약대로 원문·draft는 불변 개정이며, 직접 SQL로 기존 JSON만 덮어쓰는 행위는
지원하지 않습니다. 날짜 기준 응답 키는 한국 시간 날짜도 포함합니다.

`_shared_snapshot(repository, connection, catalog)`는 전체 공개 원문·기관 어휘·공고 묶음
판정을 한 번 읽어 재사용합니다. `_notice_snapshot(..., repository)`의 후속 필터 쿼리는
동일한 SQL 조건·정렬로 개정 ID와 필요한 자격 열만 읽습니다. 목록은 DB 연결을 반납한 뒤
Python 필터·순위·페이지·카드를 만듭니다. 검색 전체 건수·최신 공개 개정·묶음·근거는 유지합니다.
가상 저장소에 캐시가 없으면 기존 조회 경로를 사용합니다. DB 쓰기나 새 의존성은 없습니다.

검증: `tests/test_catalog_cache.py`는 결과 동등성, 철회·개정·조회수 즉시 갱신, DB 장애,
회원 결과 분리, 원문 재사용, DB 연결 반납, 동시 미스, 반환값 독립성, TTL/LRU를 검사합니다.
공개 서버 부하 도구는 `scripts/load-test.py`이며 측정 결과는 저장소 `output/load-test-20261009/`입니다.
[최소 50명 개선·측정 기록](../../../docs/catalog-capacity-2026-10-09.txt):
50명 3분 동안 3,914건 모두 성공, 구간별 p95 0.64~0.78초. 목록·검색·상세 기준입니다.

2026-10-08 단계별 공고: `notice_series.py`는 같은 기관·사업·명시된 연도/기간/차수를
읽기 모델에서 묶는다. `annotate_records`는 원본 ID마다 전체 묶음 메타데이터를 붙이고
`group_records`/`group_matches`는 대표 원문을 선택한다. 공개 목록은 묶음 이후 건수와
페이지를 계산하며 상세는 원래 제목·본문·첨부와 관련 공개 원문을 제공한다. 원문 저장·
개정·공개 상태는 변경하지 않는다. [계약·한계·검증](../../../docs/notice-series.md).

2026-10-08 필수 지역·학교 데이터: 명시적 `python -m app.modules.storage init`은
스키마 초기화 뒤 공식 광운대 공고 190건과 검증된 지역 서비스 20건의 누락을 보충한다.
기존 DB는 `ensure-focus-data`, 읽기 전용 검사는 `ensure-focus-data --check`를 사용한다.
`public.ensure_focus_data(repository)`는 `{added,skipped,coverage}`,
`public.focus_coverage(repository)`는 `{ready,checks}`를 반환한다. 기존 정책 키·공식
광운대 DUID가 있으면 공개 상태와 관계없이 보존하며 자격 자동 판정은 비활성이다.
조회·서버 시작·외부 HTTP·LLM 호출에는 쓰기가 없다.
[입력·반환·오류·실제 적재와 검증](../../../docs/focus-search-data.md).

2026-10-08: 공고 지역 필터는 `전남광주통합특별시`와 원문 약칭 `전남광주`를
함께 인식합니다. 새 회원 주소에서 도출된 통합 지역명을 그대로 사용할 수 있습니다.

2026-10-08 신청 준비: `catalog.card(record, full=False)`는 목록·상세·추천에서 원문 기반
`applicationGuide`를 반환합니다. 신청 방법, 별도 실제 신청 URL, 신청/문의 전화 구분,
방문 안내, 조건·대체 표현을 보존한 서류 목록과 `listed/none/unknown` 상태를 포함합니다.
목록에서도 원문 기반 안내를 제공하므로 신청 동작 때문에 상세 원문 전체를 추가 조회하지
않습니다. 안내의 서류 ID는 원문별로 안정적이며 `신청서 해당없음`을 전체 서류 없음으로
오인하지 않습니다. 기존 `applicationMethod/applicationUrl/contact/sourceFields`는 유지합니다.
저장된 원문·번역·개요·조건·DB를 바꾸지 않고 외부 호출도 없습니다.
[신청 경로·서류 추출 계약과 검증](../presentation/readme.md).

2026-10-08 조회 성능·상태 보완: `catalog.list_policies(repository, ...)`는 자연어
순위 계산이 없는 상세 필터 조회에서 전체 건수를 끝까지 계산하되 요청한 페이지의 행만
보관합니다. 반환값 `{items,total,nextCursor,search?}`와 정렬은 유지합니다.
`explorer_filters.filter_records(records, ..., today=None)`는 나이 조건을 먼저 확인하고
상태 필터에 필요한 일정만 계산하는 iterator입니다. `notice_status(policy,record,today)`는
실제 신청 회차별로 판단하며, 다음 회차를 기다리는 공백은 upcoming을 반환합니다.
DB 쓰기·외부 호출은 없습니다. [측정·검증 기록](../../../docs/catalog-performance.md).

2026-10-08 일정 보완: `application_schedule(value,reference_year=None,reference_month=None)`는
매년/매월 월말·연도 없는 월일·분기/반기·복수 회차를 계산합니다. `applicationWindows`는
회차 사이 공백을 유지합니다. `schedule_rules.build_calendar_rule(period,expression,fields)`는
검증된 `{expression,period}` 또는 None, `resolve_calendar_schedule(fields,overview,rule=None,
reference_year=None,reference_month=None)`는 원문 우선 달력 응답을 반환합니다.
검증된 CLI 표준 표현은 원문과 별도로 저장·조회하고 날짜 숫자·인용·상대 기준을 재검증합니다.
`catalog.list_calendar(repository, month=...)`는 시작일이 있는 예산 소진형 상시 공고도
시작 이후의 모든 조회 월 `items`에 포함하며 마감일을 생성하지 않습니다.
[날짜 계약·공식 검색 보강·검증](../../../docs/application-schedules.md).

2026-10-08: `catalog.card(record, full=False)`의 `audience`는 연령만이 아니라 원천
지원 대상 전체를 표시합니다. 원문 대상이 없으면 확인된 개요/요건 근거로 보완하고
관리자 표시 수정은 우선합니다. 빈 기타 조건 개요는 원문 대상·선정 기준 또는 확인된
other 요건으로 보완합니다. `audience.audience_text(fields,overview,editorial=None)`는
문자열, `audience.other_conditions(fields,overview)`는 문자열 목록을 반환합니다.
사업주 대상의 업무용 보조공학기기·장비 지원은 SQL 필터와 카드에서 사업·창업으로
일치하게 표시합니다. 읽기 전용이며 기존 원문·조건·DB를 수정하지 않습니다.
[대상 표시·분야 보완 규칙과 검증](../../../docs/policy-audience.md).

2026-10-07: 명시적 초기화는 011의 표시용 `policy_translations`와 UTC 일일 예산
`policy_translation_usage`를 추가한다. 조회/파싱 요청에서는 생성하지 않으며 원문·조건·
회원 행을 바꾸지 않는다. [공고 번역 모듈](../policy_translation/readme.md).

2026-10-07 관리자 편집: `editor.list_editable_policies`, `read_policy_edit`,
`save_policy_edit`는 수집 기록과 분석 개정의 통합 검색·전체 편집·저장을 제공합니다.
새 개정의 processing_json에 변경자·사유·부모 개정을 기록하고 version 확인과 공개 전환을
같은 공고 잠금/트랜잭션으로 처리합니다. 기존 개정과 수집 원본은 보존합니다.
수동 개정이 있는 공고는 이후 AI 자동 저장·자동 승인이 공개 개정이나 호환 공고를 덮어쓰지
않습니다. 명시적 관리자 공개는 가능합니다. 새 스키마 마이그레이션·LLM 호출은 필요 없습니다.
공개 상세는 본문·원문 항목과 신청 방법·문의처·성별·기타 조건·게시/수정일을 반환합니다.
2026-10-08 `catalog.card(record, full=False)`는 표시 계층의 `format_source_fields`를 사용해
법령·문의처·신청 방법·첨부 파일·관련 링크의 JSON 객체/배열을 줄별 안내로 반환합니다.
`full=True`의 `sourceFields`도 정제된 `dict[str,str]`이며 원문 필드 키는 유지합니다.
검증된 개요에 JSON 문자열이 남아 있으면 같은 처리를 적용합니다. 저장된 원문·개요·인용과
신청 캘린더/지급일 해석은 보존합니다. [변환 계약·검증](../../../docs/notice-source-fields.md).
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

`application_dates.application_schedule(period, reference_year=None, reference_month=None)`는
`{applicationStart,applicationEnd,scheduleStatus}`를,
`application_date_columns(fields, extracted_period=None)`는 `(date | None, date | None)`를 반환합니다.
번호가 붙은 신청기간 줄, `9시`/`18시 30분`/`09:00`과 요일을 인식합니다.
한 기간에 연도가 명시된 날짜가 있으면 반대쪽의 생략된 연도에만 그 연도를 적용합니다.
예: `2026. 9. 28.(월) 09:00 ~ 10. 7.(수) 18:00` → 2026-09-28~2026-10-07.
일 단위 기간의 연도가 양쪽 모두 없거나 날짜가 잘못됐거나 기간이 역전되면 unknown/NULL을 유지합니다.
일 단위 기간의 연도나 지급 시기로 신청일을 추정하지 않습니다. 날짜 파서는 DB·외부 API에 접근하지 않습니다.

2026-10-08: `3~4월`, `3월 ~ 4월`, `매년 3월부터 4월까지`, `2026년 3~4월`,
`2월`처럼 월만 확인되는 기간은 첫 월의 1일을 접수 시작, 마지막 월의 말일을 접수 마감으로
확장하여 `scheduleStatus="dated"`를 반환합니다. 예: `3~4월` → 3월 1일~4월 30일.
`applicationPrecision="month"`, `applicationMonths=[3,4]`, `applicationYear=2026|null`을
함께 반환하여 원문의 월 단위 정밀도를 보존합니다. 연도 미기재면 `applicationYear`는 null이고,
목록·상세는 한국 시간의 올해, 캘린더는 선택한 연도를 사용합니다. 연도 명시 기간은 원문 연도를
우선하며 `applicationYear`는 기간 시작 연도입니다. 월 범위 공고는 일반 접수 시작·마감
마커와 날짜별 공고에 표시하고 날짜 미확인 목록/건수에서 제외합니다. 별도 월별 참고 목록은 없습니다.
`11~2월`은 11월 1일~다음 해 2월 말일입니다. 연도 미기재 기간을 1~2월에 조회하면
이전 해 11월부터 조회 연도 2월까지로 연결합니다. 2월 말일은 윤년에 29일, 평년에 28일입니다.
새 결과를 저장할 때 `application_date_columns`도 같은 월초·월말 날짜를 투영하며,
기존 DB를 조회 중에 갱신하지 않습니다. 다음 해 실제 접수 일정은 새 공고 확인이 필요합니다.
마감된 공고도 원래 기간과 겹치는 월에서 조회할 수 있으며 현재 날짜를 기준으로 제외하지 않습니다.

검증: `python -m pytest -p no:cacheprovider tests/test_policy_calendar.py app/modules/storage/tests/test_application_dates.py app/modules/storage/tests/test_calendar_months.py app/modules/storage/tests/test_catalog_published.py`.
월초·월말 확장과 원문 정밀도, 한국 시간 연도 경계, 윤년·연도를 넘는 기간, 과거/내년 조회, 지난 마감 공고,
인용 개요·목록·상세·캘린더의 같은 기간과 미공개 제외를 외부 DB 없이 확인합니다.
