# 백엔드 엔드포인트·연동 관리

## 같은 사업의 단계별 공고 묶음 (2026-10-08)

공개 공고 목록·스마트 검색은 같은 기관/사업/연도/학기/회차의 단계별 원문을 묶은 뒤
전체 건수와 페이지를 계산한다. 원래 policy ID·원문·개정·첨부는 변경하지 않는다.
선택 메타데이터는 `noticeStage:application|followup|result` 및
`noticeGroup:{id,title,latestStage,noticeCount,notices:[{id,revisionId,title,stage,publishedDate,sourceUrl}]}`다.
원래 ID의 상세 API는 선택 원문을 유지하며 관련 공개 원문 목록을 추가한다. 기존 응답에
메타데이터가 없으면 기존 화면을 유지한다. 결과/기존 신청자 절차와 선발 종료된 묶음의
이전 신청 공지는 새 추천에서 제외한다. [판별 기준·검증](backend/docs/notice-series.md).

## AI 비서 대화 페이지·이용 횟수 제한 제거 (2026-10-08)

웹 `#assistant-chat`에서 같은 대화의 자유 질문 `{continuation,question}`을
`POST /v1/assistant/dialogue`로 보낸다. 시작 질문과 구조화 답변 계약은 유지한다.
이전 본인 확인 정보와 공개 공고 ID를 사용해 추천·신청 방법·기간·준비 서류를 이어서
확인한다. 마지막 입력 후 30분의 임시 상태이며 입력 성공 시 만료 시간이 갱신된다.

공고 질문·회원/비회원 챗봇·추천·지속 안내의 저장/갱신·추천 제외·서류 준비에
사용자/IP별 분당 횟수 제한을 적용하지 않는다. 외부 공고 AI 답변의 동시 실행 수 제한도
제거했다. 입력 검증·실행 시간·인증·동의·로그인 보안 제한은 유지한다.
[대화 계약·검증](backend/docs/assistant-dialogue.md).

## 신청 안내·계정별 서류 준비 (2026-10-08)

공개 공고 목록·상세·추천·대화 후보의 policy에 `applicationGuide`를 추가한다.
계약은 `{methodText, onlineUrl, phones:[{number,label,kind:application|inquiry}], visitText,
documents:[{id,label}], documentsStatus:listed|none|unknown, documentsNote}`다. 원문과
유효한 신청 문맥 인용으로 구성하며 공고/홈/문의 페이지는 신청 주소로 쓰지 않는다.
신청 전화와 문의 전화를 구분하고 팩스를 전화로 연결하지 않는다. 서류 ID는 원문 문장의
안정적 해시다. ‘신청서 해당없음’과 ‘구비서류 없음’을 구분한다.

`POST /v1/monitoring/candidates/preparation`은 로그인한 계정의 현재 후보만 수정한다.
웹은 기존 동일 출처·`X-Auth-Request: 1` 보호를 따르며 입력은
`{policy_id, need_id, revision_id, document_id, prepared:bool}`다. prepared는 엄격한 boolean,
계정 ID·문서 내용은 받지 않는다. 후보 소유권은 404, 비활성/제외·revision 불일치·
없는 문서는 409, 입력 오류는 422다. 사용자별 횟수 제한은 없다. 반환은 monitoring
snapshot이며 후보의 `application_preparation:{revision_id, prepared_document_ids}`
또는 null을 추가한다. 기존 JSON 저장을 사용해 테이블 변경은 없다. 공고 변경 시 체크가
초기화되고 안내 삭제·탈퇴 시 함께 삭제된다. 파일 제출·문서 심사·정부 신청은 수행하지 않는다.

## 계정별 추천 제외 이유 (2026-10-08)

`POST /v1/monitoring/candidates/feedback` (`/api` 프록시 아래 동일 경로)은 로그인,
동일 출처 및 `X-Auth-Request: 1`을 요구합니다. JSON은
`{policy_id, need_id, reason}`이며 `reason`은 필수이고 `not_eligible`, `not_interested`,
`null`만 허용합니다. null은 복원입니다. 계정 ID·제목·분야를 요청으로 받지 않습니다.
계정 내 실제 추천 후보가 없으면 404, 입력 오류는 422입니다. 사용자별 횟수 제한은 없습니다.

반환값은 기존 monitoring snapshot에 `recommendation_feedback:[{policy_id, need_id,
reason, title, category, tokens, updated_at}]`와 후보별 동일 필드 또는 null을 추가합니다.
비활성 후보가 화면에서 빠져도 제외 목록은 유지됩니다. 기존 후보 JSON에 저장해 별도
테이블 초기화·마이그레이션은 없습니다. 안내 삭제·탈퇴는 설정도 제거합니다.

홈 `/v1/recommendations`와 인증된 `/v1/assistant/dialogue`는 해당 계정의 설정을 읽어
결과 개수 제한 전에 제외·정렬합니다. 지원 대상 아님은 해당 공고만 제외하고, 관심 없음은
동일 분야와 제목 유사도에 따라 순위를 낮춥니다. 회원 사실·자격 비교·신청 상태는 유지합니다.

## 공개 공고 JSON 표시 정제 (2026-10-08)

공개 공고 상세 `GET /v1/policies/{id}`의 `sourceFields: dict[str,str]`은 법령·문의처·
신청 절차·첨부 파일·관련 링크의 JSON 배열/객체를 읽기 쉬운 줄별 문자열로 반환합니다.
원천 필드 키와 일반 문자열은 유지하고 공급자 코드/ID와 빈 항목을 제외합니다.
목록·상세·캘린더의 `contact`, `applicationMethod` 등 표시 문구도 같은 정제를 적용합니다.
저장 원문·인용·자격 모델·신청 날짜는 유지하며 번역 캐시는 정제된 표시 해시로 구분합니다.
엔드포인트·응답 타입·인증은 기존과 같습니다. [변환 계약·검증](backend/docs/notice-source-fields.md).

## 공통 전송 보안 (2026-10-08)

production의 `/v1/` 처리에는 HTTPS가 필요합니다. ASGI 서버가 신뢰하는 프록시에서
확인한 scheme을 사용하며, HTTP는 본문·인증·DB 처리 전에 403으로 거부합니다.
클라이언트가 직접 보낸 `X-Forwarded-Proto: https`만으로 허용하지 않습니다.
공개 Caddy도 HTTP `/api`와 하위 경로의 모든 메서드를 403으로 거부하며 전환하지 않습니다.
HTTP 화면의 GET·HEAD만 경로·쿼리를 보존해 HTTPS로 308 전환합니다.
개발·테스트 HTTP와 별도 health 경로는 유지합니다. 프록시는 루프백으로 제한하고,
전시 QR의 고정 로컬 관리자 권한 확인에는 별도의 신뢰 프록시 정보를 명시합니다.
[구현·검증·배포 반영](backend/docs/web-security.md). 이번 보완은 로컬에만 반영했습니다.

## 생활반경 지역 복지 (2026-10-08)

공개 `GET /v1/local-services?region=서울&district=노원구&neighborhood=월계1동`는
검토된 공식기관 서비스 요약을 반환합니다. `category=all|transport|health|care|culture`,
`scope=all|neighborhood`, `neighborhood_type=unknown|administrative|legal`을 지원합니다.
전국·시도·시군구 범위와 명시한 동네를 구분하며 행정동/법정동을 추정 변환하지 않습니다.
응답은 `items,total,coverage,focus,checkedAt`. DB/회원정보/네트워크 없이 버전 관리된 JSON을
검증해 읽으며 입력 오류 422, 카탈로그 오류 503, no-store를 적용합니다.
[전체 계약·확장·갱신 방법](backend/docs/local-services.md).

## 공개 공고 다국어 번역 (2026-10-07)

GET `/v1/policies/{policy_id}/translation?language=ko|en|zh|vi|ja`는 현재 공개된 공고의
표시 필드만 반환합니다. 응답은 `policy_id`, `revision_id`, `language`, `source_language:ko`,
`source_hash`, `translation`, `cached`입니다. `translation`은 title/summary/audience/
organization/benefit/applicationPeriod/paymentSchedule/content/gender/contact/
applicationMethod/otherConditions/sourceFields/budgetNotice이며, ID·링크·분야·지역·
필터 날짜는 원본을 유지합니다. 한국어 요청은 모델을 호출하지 않습니다.

다른 언어는 기존 서버 Codex CLI 설정을 사용하며 개정·원문 해시·언어·프롬프트 버전별로
DB에 저장합니다. 캐시 조회 전과 생성 후 공개 상태·원문 개정을 확인하고 숫자·날짜·URL·
이메일 및 JSON 구조를 검증합니다. 클라이언트의 임의 본문·개인정보는 입력으로 받지 않습니다.
추가/중복 쿼리나 요청 본문·미지원 언어는 422, 비공개/없는 공고 404, 생성 중/일일 한도 429
(`Retry-After`), 공급자·캐시·출력 검증 실패 503을 반환합니다.

`011_policy_translations.sql`은 명시적 저장 초기화에서 적용하며 HTTP 요청에서 DDL을
실행하지 않습니다. 서버 프로세스당 생성 1개·호출 최대 60초·DB 기록 UTC 하루 기본 100회
제한(실패도 포함)이며 캐시는 생성 한도와 무관합니다. 웹·앱은 다섯 언어 선택·저장, 번역
대기/실패 시 원문 유지·재시도, 상세 원문 전환을 제공합니다. AI 자유 답변은 한국어입니다.
[서버 모듈·설정·초기화](backend/app/modules/policy_translation/readme.md),
[웹·앱 동작](frontend/docs/internationalization.md).

## 생활 상황 상담 (2026-10-07)

POST `/v1/assistant/dialogue`: 시작 `{question, revision_id?}`, 구조화 답변
`{continuation, answer:{slot,value}}` 또는 자유 후속 질문 `{continuation,question}`.
부족한 정보·다음 질문·공고 비교·일상 대응을 반환하며
자격을 확정하지 않습니다. 본인/타인/가정 상황을 구분하고 질문 원문을 장기 저장하지 않습니다.
POST `/v1/assistant/dialogue/profile`: `{continuation, consent:true, confirmed:true}`로
서버가 확인한 본인 정보만 병합 저장합니다. 기존 추적 켜기/중지는 유지합니다.
웹/모바일 회원 인증·POST 가드·no-store 적용, 외부 AI 호출 없음.
[전체 계약과 운영 한계](backend/docs/assistant-dialogue.md).

## 사용자 상황 기반 지속 안내 (2026-10-07)

웹 쿠키와 모바일 Bearer 인증으로 본인의 생활·주거·재난 피해 정보를 관리합니다.
POST에는 `X-Auth-Request: 1`이 필요하며 모든 응답은 `Cache-Control: no-store`입니다.
계정 ID는 세션에서 결정하고 입력으로 받지 않습니다.

| 경로 | 동작·입력 |
| --- | --- |
| GET `/v1/monitoring` | 저장 프로필, enabled, version, updated_at, last_checked_at, 자동 탐색 분야, 후보, 최신 알림 100개·전체 미읽음 수 |
| POST `/v1/monitoring/profile` | `{profile, consent: true, enabled: boolean}`. 계정에 저장하고 켜져 있으면 즉시 공고 비교 |
| POST `/v1/monitoring/preferences` | `{enabled: boolean}`. 저장한 정보의 추적 켜기·중지 |
| POST `/v1/monitoring/refresh` | `{}`. 활성 계정의 공개 공고 재확인. 기본 5회/분 제한 |
| POST `/v1/monitoring/candidates/state` | `{policy_id, need_id, state}`. watching/preparing/applied/dismissed/completed |
| POST `/v1/monitoring/alerts/read` | `{ids: string[]}`. 본인 알림 최대 100개 읽음 처리, `{updated: true}` |
| POST `/v1/monitoring/delete` | `{}`. 생활 프로필·추적·진행 기록·앱 안 알림 삭제 |

읽음 처리를 제외한 변경은 현재 snapshot을 반환합니다. 공고 확인 실패 시 저장은 유지하며
`scan_status: unavailable`을 반환하고 이전 성공 결과를 비우지 않습니다. 첫 저장에는 명시적
동의가 필요하며 전체 추적은 기본 꺼짐입니다. 운영 초기화와 정기 확인은
`python -m app.modules.monitoring --init|--once|--watch`를 사용합니다.
현재는 수집된 공고 비교·앱 안 알림이며, 공식 재난 자동 피드·이메일·휴대폰 푸시는 미연결입니다.
[실행·함수 계약](backend/app/modules/monitoring/readme.md),
[구현·검증 범위](backend/docs/proactive-guidance.md).

## 자연어 공고 검색 (2026-10-07)

공개 `GET /v1/policies`와 `/v1/policies/calendar`는 기본 `search_mode=smart`,
`search_scope=all`에서 문장의 지원 목적·게시기관/대상 관계·제외 의도를 해석합니다.
`광운대에서 올린 장학금`은 학교가 게시한 공고를, `광운대생 받을 돈`은 학교 대상
안내와 학교 이름이 없는 전국 대학생 지원도 찾습니다. `알바 말고`, `갚기 싫어`는
근로·상환 조건을 구분하며, 학교명 오타는 공개 공고에서 확인된 기관명만 보정합니다.
공개 개정 전체의 기관 어휘를 사용하고, 명시적 분야·지역·대상 필터를 적용한 결과를
관련도 순으로 정렬한 뒤 전체 건수와 페이지를 계산합니다. 검색어가 없으면 인기순입니다.
목록 `sort`는 `relevance/popular/recent/name`이며 명시한 정렬을 우선합니다.
선택 `search_relation=publisher|related`는 자동 해석 결과의 게시기관/관련 대상 선택입니다.
이 선택은 같은 해석과 원문 근거를 유지하며 건수·페이지·캘린더 표시 전에 적용합니다.

선택 응답 `search`는 mode, summary, originalQuery, interpretedQuery, corrections,
alternatives, warnings를 제공합니다. 카드의 `searchMatch`는 관계, 찾은 이유와 원문
인용 근거입니다. 이 관계는 신청 자격 확정이 아닙니다. 학교를 확인할 수 없는
`우리학교`를 특정 학교로 추정하지 않으며 회원 프로필이나 외부 모델을 사용하지 않습니다.
`광운대생`처럼 학교 소속을 직접 적었지만 그 학교 공고가 없을 때에도 전국 대학생
안내를 찾습니다. 이 경우 학교 이름은 입력 그대로 유지하고 공고에서 확인되지 않았다는
안내를 표시하며 다른 학교 전용 지원을 해당 학교 지원으로 바꾸지 않습니다.

`search_mode=literal` 또는 `search_scope=organization/content`는 기존 키워드 검색을
유지합니다. `organization`은 게시기관, `content`는 제목·본문·지원 내용과 대상 등
주요 원문과 관리자 수정 내용입니다. 대학 이름의 약칭·정식 표기를 함께 찾고 공백으로
나눈 단어는 AND로 적용합니다. 잘못된 mode/scope/sort는 422입니다.
웹·모바일은 기본 자동 해석을 표시하고 범위는 추가 옵션으로 제공합니다.
원래 검색어를 유지하며 보정을 되돌리거나 검색 기준을 바꾸면 첫 페이지로 돌아갑니다.
[서버 검색 계약](backend/docs/policy-search.md), [웹 사용법](frontend/docs/policy-search.md),
[모바일 사용법](frontend/docs/policy-search-mobile.md).

## 회원 주소 입력 (2026-10-07)

회원 가입·`POST /v1/auth/profile`·회원 응답은 선택 `postal_code`(ASCII 숫자 5자리), `address`(검색한 기본 주소), `address_detail`(상세 주소)를 추가 지원합니다. 주소 문자열은 최대 200자이며 빈 값은 `null`입니다. 기존 `region`은 시·도 축약명으로 유지하고 웹 주소 검색 결과에서 자동 반영합니다. 비회원 추천 입력은 기존 시·도 선택을 유지합니다. SQLite는 초기 호출 때 선택 열을 준비하고 MySQL은 `python -m app.modules.auth init`으로 추가합니다. 개인정보 안내는 `2026-10-07.3`이며 주소가 외부 AI 문맥에 자동 첨부되지 않습니다. [입력 화면·호출 방법](frontend/docs/member-address.md), [회원 API](backend/app/modules/auth/readme.md).

## 공고 DB 편집 (2026-10-07)

최고 관리자 콘솔 전용 `bokji_server_admin` 인증을 사용합니다.

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| GET `/v1/server-admin/policies` | q, status, limit(1~100), cursor | 원문/분석 공고 목록, total, nextCursor |
| GET `/v1/server-admin/policies/{policy_key}` | URL 인코딩 공고 키 | version, 기본 정보, fields, display, analysis, canonical, 공개 상태, 최근 20개 개정 |
| PATCH `/v1/server-admin/policies/{policy_key}` | version, title, organization, source_url, fields, category, display, analysis(선택), published, note | 저장한 새 개정 및 새 version |

PATCH는 JSON·같은 출처·`X-Auth-Request: 1`을 요구하며 본문 1MiB 상한입니다.
인증/권한 401/403, 없음 404, 개정 충돌 409, 입력/코드/인용 검증 422, 본문 초과 413입니다.
원문 필드는 항목당 최대 200,000글자입니다. 공개 상태와 편집을 한 트랜잭션으로 저장하고
이전 개정·수집 원문을 보존합니다. 관리자 수정 이후 AI 자동 승인은 수동 내용을 덮어쓰지 않습니다.
공개 GET `/v1/policies/{id}`는 `content`, `sourceFields`, `gender`, `otherConditions`,
`applicationMethod`, `applicationUrl`, `contact`, `publishedDate`, `modifiedDate`를 추가 반환합니다.
웹 목록/캘린더/열린 상세는 화면 복귀·포커스 및 활성 상태 30초 간격으로 갱신합니다.

## 공고 DB 편집 (2026-10-07)

최고 관리자 콘솔 전용 `bokji_server_admin` 인증을 사용합니다.

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| GET `/v1/server-admin/policies` | q, status, limit(1~100), cursor | 원문/분석 공고 목록, total, nextCursor |
| GET `/v1/server-admin/policies/{policy_key}` | URL 인코딩 공고 키 | version, 기본 정보, fields, display, analysis, canonical, 공개 상태, 최근 20개 개정 |
| PATCH `/v1/server-admin/policies/{policy_key}` | version, title, organization, source_url, fields, category, display, analysis(선택), published, note | 저장한 새 개정 및 새 version |

PATCH는 JSON·같은 출처·`X-Auth-Request: 1`을 요구하며 본문 1MiB 상한입니다.
인증/권한 401/403, 없음 404, 개정 충돌 409, 입력/코드/인용 검증 422, 본문 초과 413입니다.
원문 필드는 항목당 최대 200,000글자입니다. 공개 상태와 편집을 한 트랜잭션으로 저장하고
이전 개정·수집 원문을 보존합니다. 관리자 수정 이후 AI 자동 승인은 수동 내용을 덮어쓰지 않습니다.
공개 GET `/v1/policies/{id}`는 `content`, `sourceFields`, `gender`, `otherConditions`,
`applicationMethod`, `applicationUrl`, `contact`, `publishedDate`, `modifiedDate`를 추가 반환합니다.
웹 목록/캘린더/열린 상세는 화면 복귀·포커스 및 활성 상태 30초 간격으로 갱신합니다.

## 백엔드 서버 관리자 화면·API (2026-10-02)

백엔드 `GET /`는 관리자 로그인·서버 관리 콘솔입니다. 일반 서버 8000과 공유 서버 8001은
각자의 기존 인증 저장소를 사용하며, 저장소에 최고 관리자 권한이 있는 계정으로 로그인합니다.
공유 사이트의 공개 `/` 프론트는 유지합니다. 콘솔은 기존 웹 세션과 별도 이름인
`bokji_server_admin` 쿠키(HttpOnly·SameSite=Strict·최대 7일, production은 Secure)를 사용하고
모든 상태·설정 요청에서 세션과 현재 `superadmin` 권한을 다시 확인합니다.

아래 경로의 접두사는 `/v1/server-admin`입니다. 일반 회원·QR 관리자는 거절합니다.

| Method | 경로 | 입력·응답·효과 |
| --- | --- | --- |
| POST | `/login` | `{username,password}` → `{user:{id,username,admin_role:"superadmin"}}`, 콘솔 쿠키 발급 |
| GET | `/session` | 콘솔 쿠키 → 현재 관리자 `{user}` |
| POST | `/logout` | 세션·쿠키 폐기 → `{status:"logged_out"}` |
| GET | `/overview` | `{server,database,collection,resources,configuration}`. 현재 엔진 SELECT·저장 기록·로컬 자원 조회 |
| GET | `/settings` | `{revision,values,secret_configured,fields,env_overrides,restart_fields}`. 키·비밀번호 값은 반환하지 않음 |
| PATCH | `/settings` | `{revision:64자리 SHA256,changes:{소문자 Settings 필드:값}}` → 설정 view와 changed_fields/restart_required/worker_reload_fields |
| GET | `/collection/status` | `limit=1~100`(기본 20) → 저장된 cursor·작업·호출 사용량·실패 기록 |
| GET | `/collection/changes` | 같은 limit → `{items:[변경 snapshot]}` |
| GET | `/collection/candidates` | 같은 limit → `{items:[미검증 검색 후보]}` |
| GET | `/operations` | `{operation,presets,profiles}`. 최근 작업·수집 프리셋·DB에 저장된 별도 AI 프로세스의 상태 |
| POST | `/operations` | `action=check/tick/seed/analyze-all/schedule-enable/schedule-remove`와 실행 입력 → 202 `{operation}`. 백그라운드 실행 |
| POST | `/operations/{operation_id}/stop` | UUID 분석 작업 ID → 202 상태. 해당 AI 작업의 진행 결과 저장 후 중지 요청 |
| GET | `/schedule` | Windows 작업의 등록·활성 상태·실행 결과 코드 조회. 등록/해제하지 않음 |
| GET | `/processes` | 개발/운영 모드, 백엔드·프론트, MySQL의 running/ready/controllable, 터널의 running/connected/controllable/url, 최근 제어 결과 조회 |
| POST | `/processes` | `{target:backend/frontend/mysql/tunnel/all,action:start/stop/restart}` → 202 `{operation}`. 고정 관리 스크립트를 별도 숨김 프로세스로 실행. all은 프로젝트 DB까지 포함 |
| GET | `/processes/{job_id}` | UUID 작업 ID → 재시작 후에도 남는 `{operation}`. 없으면 404 |

POST/PATCH는 같은 출처, JSON과 `X-Auth-Request: 1`이 필요하며 요청 본문은 64KB까지입니다.
프로세스 제어는 PID·명령·실행파일·경로 입력을 받지 않습니다. 동시 제어 또는 콘솔 수집 중
백엔드 제어는 409이며 Windows 외 환경·관리되지 않는 실행 방식은 503으로 거절합니다.
백엔드 종료 후 결과 조회는 다음 기동 시 가능합니다. MySQL·터널·예약 수집은 종료하지 않습니다.
페이지·API는 no-store·CSP·프레임 삽입 금지를 적용합니다. 비로그인/만료 401, 권한 부족/다른
출처/요청 헤더 누락 403, 존재하지 않는 조회 종류 404, 설정 파일 버전 충돌 409, 본문 상한
413, 입력/허용 목록/환경변수 관리 필드 오류 422, DB·설정 파일 장애 503이며 비밀 입력을
오류 응답에 포함하지 않습니다. 로그인 시도 제한은 기존 인증 서비스의 429를 따릅니다.

설정 허용 범위는 수집 허용·처리량·회차/일일 예산·재시도·자원·주기·검색, 모델·추론·timeout·
입력 길이, API 키, 자동 공개 방식, DB 연결입니다. 비밀 입력칸을 비우면 화면은 변경을 보내지
않아 기존 값을 유지합니다. 명시적 삭제는 빈 문자열이며 null은 거절합니다. 환경변수 우선
항목은 읽기 전용이고, 설정 파일 경로·HTTP 서버 포트·인증·CORS·실행파일·SQL·임의 명령은
허용하지 않습니다.

2026-10-07 **수집 실행** 메뉴: `tick`의 `mode=raw/analysis/custom/bootstrap/steady`와 `page_size=1~100`,
`max_pages=0~30`, `max_jobs=0~100`, `max_seconds=15~600`, `max_http_calls=0~100`,
`max_model_calls=0~100`, `max_tokens=0~1000000`을 받습니다. 숫자는 정수만 허용합니다.
원문 모드는 대기 작업·모델·검색을 강제로 끄고, 분석 모드도 외부 검색은 끕니다.
`seed`의 `limit=1~100`(기본 100)은 반복 묶음 크기이며 전체 기존 공고를 끝까지 인덱싱합니다.
이전 결과를 무조건 채택하지 않습니다. `analyze-all`은 `analysis_mode=standard/bulk`를 받으며
생략하면 standard입니다. bulk는 호출당 최대 16건·입력 100,000글자·개별 요청 최소 900초로
분석 대기열을 처리하고 완료 작업을 건너뜁니다. 실행 전용 설정으로 `.env`와 평상시 프리셋은
변경하지 않습니다. 두 AI 모드 모두 앱의 회차/일일 호출·토큰·총시간 한도를 적용하지 않으며
공공 API를 호출하지 않습니다. Codex 계정 제한·모델 요청 timeout·검증·DB lease는 유지합니다.
같은 API의 중복 실행과 DB 재시작 대기는 409입니다. 실제 worker의 DB lease와 일일 예산도
수집 회차에 적용합니다. 결과에는 처리 수·모드·묶음 크기와 호출 사용량만 표시하고
원문·예외·CLI stderr를 반환하지 않습니다.
자동 등록은 Windows·기본 .env·프로세스 환경변수 불일치 없음·회차 600초 이하를 요구합니다.
기존 예약 작업을 덮어쓰지 않으며 해제해도 진행 중인 회차를 강제 종료하지 않습니다.

파일 SHA 버전·프로세스 간 잠금·원자적 저장으로 충돌을 제어합니다. DB 설정은 저장하되 현재
API·인증 엔진에 적용하지 않고 재시작을 기다립니다. 수집/모델/API 키·공개 방식은 새 작업부터
적용하며 이미 진행 중인 worker를 종료하지 않습니다. 별도 worker는 실행 시 파일을 읽으므로
DB 설정도 다음 회차에 반영됩니다. `INGESTION_ENABLED=false`는 다음 실제 tick을 막습니다.
조회·저장으로 수집/모델/스케줄을 실행하거나 기존 공개 상태를 일괄 변경하지 않습니다.

구현: [라우터](backend/app/api/server_admin.py), [모듈 계약](backend/app/modules/server_admin/readme.md).
[접속·최초 계정·적용 순서](backend/docs/server-admin.md), [CLI·스케줄](backend/docs/server-ingestion.md).

## 자동 승인 기본값 (2026-10-02)

`POLICY_AUTO_PUBLISH=true`가 기본입니다. 검증된 새 공고 저장·공개·이력을 함께 커밋하며 같은 공고는 최신 한 개정만 노출합니다. 원문 누락 경고와 matching_enabled=false는 유지합니다. 관리자 목록 응답에 `autoPublish`를 추가해 현재 방식 표시, 수동 공개/비공개 API는 유지합니다. 동일 결과 재사용은 수동 비공개를 존중합니다. false는 기존 수동 승인으로 전환합니다. 기존 최신 draft 공개는 `python -m app.modules.storage auto-publish`로 실행합니다.

## 최고 관리자 공고 공개 API (2026-10-02)

| Method | 경로 | 접근 | 입력·응답 |
| --- | --- | --- | --- |
| GET | `/v1/admin/policies` | 최고 관리자 쿠키 | limit 1~100/cursor → items/total/nextCursor, 초안 포함 |
| GET | `/v1/admin/policies/{revision_id}` | 최고 관리자 쿠키 | 검증 경고·카드 미리보기·수집 필드·최근 공개 이력 |
| POST | `/v1/admin/policies/{revision_id}/publication` | 최고 관리자 쿠키 + X-Auth-Request: 1 | action publish/unpublish, expected_status, note → revisionId/reviewStatus/matchingEnabled=false |

비로그인 401, 일반/QR 관리자 403, 없는 개정 404, 다른 관리자의 상태 변경 409, 미검증 초안·추가 필드·입력 오류 422, DB 장애 503. 원문/분석은 그대로 유지하며 공개 상태와 감사 이력은 원자적으로 저장합니다. 같은 공고는 한 개정만 공개하며 비공개 후 과거 개정으로 되돌아가지 않습니다. 공개는 자격 판정 활성화가 아닙니다. 명시적 storage init으로 006 마이그레이션을 적용합니다. [관리자 사용법](backend/app/modules/admin/readme.md).

## 공유 사이트 공고 DB 연결 (2026-10-02)

프론트의 기존 `GET /api/v1/policies` 호출을 공유 Caddy → FastAPI 8001 → `.env`의 공고 MySQL로 연결합니다. 목록·상세·캘린더, 회원 FAQ·질문과 `/api/health/ready`를 프록시 허용 경로에 추가했습니다. 공개 공고 계약은 그대로이며 초안은 자동 승인하지 않습니다. 공유 API는 서버에 설정한 MySQL 회원·관리자·금융 저장소를 사용하고 개인정보는 암호화합니다. 이전 공유 SQLite 회원·권한은 명시적으로 이관해야 하며, SQLite 인증은 격리 테스트에만 허용합니다. `share.ps1 reload`로 기존 터널 주소를 유지하며 적용합니다. [설정·검증](frontend/web/deploy/readme.md).

## 관리자 권한 추가 (2026-10-02)

웹 쿠키 세션으로 인증합니다. `/v1/auth/login`, `/me`, `/profile`의 사용자 응답에 `is_admin`과 `admin_role`(`superadmin`, `qr_admin`, 일반 회원은 null)이 추가됩니다. 요청 입력으로 등급을 지정하거나 변경할 수 없습니다.

| Method | 경로 | 접근 | 입력·응답 |
| --- | --- | --- | --- |
| GET | `/v1/admin/session` | 최고·QR 관리자 | `{is_admin:true,admin_role}` |
| GET | `/v1/admin/accounts` | 최고 관리자 | `{items:[{username,role,created_at}]}` |
| POST | `/v1/admin/accounts` | 최고 관리자 | `{username,password,confirm_password}` → 201 `{username,admin_role:"qr_admin"}` |

POST에는 `X-Auth-Request: 1`이 필요합니다. 새 관리자 비밀번호는 영문·숫자 포함 12~128자, 아이디는 소문자/숫자/밑줄 4~20자입니다. 휴대전화 인증을 요구하지 않습니다. 비로그인 401, 권한 부족 403, 입력 오류 400/422, 동시 중복 409, DB 장애 503. 모든 응답은 no-store이며 비밀번호를 오류에 반영하지 않습니다. QR 화면 `/admin/exhibition/`의 자산·API·PNG도 매 요청 관리자 세션을 검사합니다. 하위 관리자 생성/목록과 임의 DB 관리 권한은 QR 관리자에게 없습니다. [초기 설정·권한 구조](backend/app/modules/admin/readme.md).

최종 확인: 2026-10-01. 담당 영역: 백엔드(API·설정·응답 계약), 프론트엔드(웹·Android·iOS 호출자). 이 파일은 팀 공통 API 관리대장입니다. 실제 코드가 기준이며 변경 시 이 문서와 호출자를 함께 갱신합니다.

**현재 HTTP API는 health/readiness, `/v1/auth` 웹 인증, `/v1/mobile/auth` 모바일 인증, `/v1/finance` 금융 계산·저장, `/v1/policies` 공고 조회, `/v1/assistant/questions` 회원 질문입니다.** 2026-10-02 전화번호 인증을 제거하고 웹 카카오 로그인 API를 추가했습니다. [설정과 흐름](backend/docs/kakao-login.md). 추천·공개 승인·사용자 자격 판정·추천 프로필·저장 공고·알림 서버 API는 후속입니다. 웹은 API 모드만 사용하며 더미 공고는 테스트 코드에만 있습니다.

## 1. 접속 주소와 경로 규칙

| 구분 | 기본 주소 / 경로 | 관리 위치 |
|---|---|---|
| 로컬 백엔드·서버 관리 로그인 | `http://127.0.0.1:8000/` | [server.py](backend/server.py), [설정 코드](backend/app/core/config.py), `backend/.env`, [관리 안내](backend/docs/server-admin.md) |
| 웹 개발 서버 | `http://127.0.0.1:5173` | [Vite 설정](frontend/web/vite.config.js) |
| 웹에서 사용하는 API 기준 경로 | `/api` | `VITE_API_BASE_URL`, [HTTP 클라이언트](frontend/web/src/shared/api/client.js) |
| 개발 프록시 대상 | `http://127.0.0.1:8000` | `API_PROXY_TARGET`, [웹 설정 예시](frontend/web/.env.example) |
| 운영 API 주소 | 미정·배포 미구성 | 운영 호스트 확정 후 이 표와 클라이언트 설정 갱신 |
| Android/iOS API 주소 | `EXPO_PUBLIC_API_BASE_URL`의 절대 서버 주소 | [모바일 앱](frontend/mobile/readme.md), 운영 주소는 배포 시 확정 |

개발 요청 흐름:

```text
브라우저 GET http://127.0.0.1:5173/api/health
    → Vite가 /api 접두사를 제거
    → 백엔드 GET http://127.0.0.1:8000/health
```

`/api`는 웹 프록시 접두사이며 백엔드 라우터의 접두사가 아닙니다. 백엔드에 직접 `/api/health`를 호출하면 해당 라우트가 없습니다. 인증 경로는 `/v1/auth`입니다. 정적 운영 빌드에는 proxy가 없으므로 운영 reverse proxy 또는 공개 HTTPS API 주소/CORS를 별도로 구성해야 합니다. `vite preview`는 로컬 점검 도구이며 운영 서버 구성과 구분합니다.

휴대폰의 `127.0.0.1`은 휴대폰 자신입니다. 실제 기기 연동 시 접근 가능한 개발 서버 주소와 바인딩·네트워크 구성을 별도로 정합니다. 이 문서는 현재 로컬 서버를 외부에 공개하도록 설정하지 않습니다.

## 2. 구현된 엔드포인트

| ID | Method | 백엔드 경로 | 입력 | 인증 | 성공 / 실패 | 구현 / 호출자 |
|---|---|---|---|---|---|---|
| health | GET | `/health` | 경로·쿼리·본문 인수 없음 | 없음 | 200 / 연결 실패 시 HTTP 응답 자체가 없을 수 있음 | [liveness](backend/app/api/health.py), 웹 checkHealth 함수 유지·현재 UI 미호출 |
| readiness | GET | `/health/ready` | 경로·쿼리·본문 인수 없음 | 없음 | 200 / 503 | [readiness](backend/app/api/health.py), 개발·운영 점검용. 웹 UI에서는 미호출 |

응답은 JSON입니다. `Accept: application/json`을 사용할 수 있으며 현재 Authorization·쿠키·사용자 식별자는 필요하지 않습니다. 두 경로 모두 상태를 변경하지 않습니다. readiness는 MySQL에 `SELECT 1`만 실행합니다.

### GET /health

HTTP 200:

```json
{"status":"ok","service":"bokji-compass-backend"}
```

API 프로세스가 응답한다는 의미입니다. DB 연결, 정책 데이터 존재, 업무 서비스 준비 상태를 보장하지 않습니다. 웹 `checkHealth()`는 5초 제한으로 호출하고 HTTP 실패·시간 초과·응답 형태 불일치를 오류로 처리합니다. 이 5초는 웹 호출자의 제한이며 서버의 공통 요청 제한이 아닙니다.

### GET /health/ready

| 조건 | HTTP | 응답 |
|---|---|---|
| DB 연결 및 `SELECT 1` 성공 | 200 | `{"status":"ready","database":"reachable"}` |
| `DB_ENABLED=false`로 DB 풀 없음 | 503 | `{"status":"not_ready","database":"disabled"}` |
| DB 연결/쿼리 중 SQLAlchemy 오류 | 503 | `{"status":"not_ready","database":"unavailable"}` |

드라이버 오류·접속 암호는 응답에 포함하지 않습니다. HTTP 200이어도 정책 테이블·마이그레이션·적재·검색은 준비되었다고 판단하지 않습니다. DB 활성화 상태에서 필수 설정이 빠졌다면 앱 시작 자체가 실패할 수 있으며, 모든 설정 오류가 503 응답으로 바뀌는 것은 아닙니다.

별도 공통 업무 오류 봉투, 페이지네이션, rate limit 계약은 아직 없습니다. 업무 API를 추가할 때 확정해야 합니다.

### 계정 인증

| Method | 백엔드 경로 | 성공 | 오류 |
|---|---|---|---|
| POST | `/v1/auth/username/check` | 소문자로 정규화한 username, available; IP당 분당 30회 | 422, 429 |
| POST | `/v1/auth/email/request` | 이메일 인증번호 발송, HttpOnly 인증 쿠키, expires_in·resend_after | 422, 429, 503 |
| POST | `/v1/auth/email/verify` | 같은 브라우저의 이메일·6자리 code 확인, 인증 증명 10분 | 400, 422, 429 |
| POST | `/v1/auth/signup` | 201, 가입 완료; 동일 이메일의 인증 증명을 한 번 소비 | 400, 401, 409, 422, 429 |
| POST | `/v1/auth/login` | user, HttpOnly 세션 쿠키 | 401, 422, 429 |
| GET | `/v1/auth/me` | 현재 user | 401 |
| POST | `/v1/auth/profile` | 로그인 회원의 name·age·gender·region 변경, user 반환 | 401, 422 |
| POST | `/v1/auth/logout` | 서버 세션 및 쿠키 폐기 | 503 |

모든 POST는 JSON과 `X-Auth-Request: 1` 헤더가 필요합니다(누락 403). 공통 저장소 장애/비활성은 503입니다. 가입 필드는 이름(name, 필수 1~50자)·아이디·비밀번호·비밀번호 확인·이메일·만 나이·성별·시도입니다. 일반 신규 가입은 같은 브라우저에서 이메일 인증을 먼저 완료해야 합니다. 로그인과 세션 조회의 user에는 name·email·email_verified가 포함되며 기존 이메일 없는 계정도 로그인할 수 있습니다. [정확한 입력·응답·제한·저장소·실행법](backend/app/modules/auth/readme.md), [호출자](frontend/web/src/features/auth/authApi.js), [생성 스키마](backend/app/api/auth.py)를 기준으로 합니다.

카카오 신규 가입은 직접 입력한 이메일을 요구하되 소유 인증은 하지 않습니다. 이메일은 계정 연결이나 로그인 식별자로 쓰지 않으며 프로필 수정 API에서 바꿀 수 없습니다. 실제 일반 가입에는 SMTP 설정과 MySQL 회원 스키마의 명시적 초기화가 필요합니다. [이메일 인증·SMTP 설정](backend/docs/email-signup.md).

카카오 추가 경로는 GET `/v1/auth/kakao/status`, POST `/start`, GET `/callback`, GET `/pending`, POST `/complete`입니다(동일 `/v1/auth/kakao` 접두사). 전화번호 요청·확인 경로는 제거되어 404입니다. `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `KAKAO_WEB_URL`을 서버에 설정해야 합니다. [상세 계약](backend/app/modules/auth/readme.md).

### 소득·재산 계산 및 계정별 저장

[금융 라우터](backend/app/api/finance.py), [입력 계약](backend/app/contracts/finance.py), [계정별 저장소](backend/app/modules/finance/storage.py)가 구현 기준입니다. [모듈 사용법·초기화](backend/app/modules/finance/readme.md), [공식 산정 규칙·계산 한계](backend/docs/financial-rules.md)를 함께 확인합니다. 웹 프록시에서는 아래 경로 앞에 `/api`를 붙입니다.

| Method | 백엔드 경로 | 입력 | 인증·성공 | 오류 |
|---|---|---|---|---|
| GET | `/v1/finance/rules` | 없음 | 비회원 가능, 산정 규칙 목록 객체 | 연결 실패 |
| POST | `/v1/finance/calculate` | `{profile, allow_approximation?}` | 비회원 가능. 기본은 공식 기준 계산, 명시적으로 true면 가정을 표시한 근사 참고값. DB 저장 없음 | 422 |
| GET | `/v1/finance/profile` | 세션 쿠키 | `{profile, calculation, updated_at}`. 미저장 시 셋 모두 null | 401, 503 |
| POST | `/v1/finance/profile` | `{profile, consent: true}` | 세션 쿠키, 저장 후 조회와 같은 응답 | 401, 403, 422, 503 |
| POST | `/v1/finance/profile/delete` | 빈 JSON `{}` | 세션 쿠키, `{deleted: true}`. 이미 없어도 동일 | 401, 403, 422, 503 |

회원 저장·삭제 POST는 `X-Auth-Request: 1` 헤더가 필수입니다. 공개 계산 POST는 이 헤더나 로그인 없이 사용할 수 있고 `AUTH_ENABLED=false`, `DB_ENABLED=false`에서도 계산합니다. 공개 계산·규칙 조회는 인증 서비스나 DB 테이블을 생성하지 않습니다. 회원 경로는 `credentials: include`로 세션 쿠키를 보내며 로그인 검증을 거친 계정 ID만 사용합니다. 본문의 account_id·owner_id·계산 결과 등 계약 외 필드는 422로 거부합니다.

`profile`에는 가구 구성, 가구원별 소득, 재산·부채·차량 원입력이 들어갑니다. 금액은 음수가 아닌 정수 원이며 미입력 null과 실제 금액 0을 구분합니다. 가구원 목록 길이는 `household_size`와 같아야 합니다. 정확한 선택값·범위·필수 항목은 생성 OpenAPI의 `FinancialProfile`을 따릅니다. 저장 동의는 JSON boolean `true`만 허용하며 숫자 1·문자열·동의 누락은 거부합니다.

소득 기준은 `members[].earned_income_basis`(`gross/net/unknown`)와 `business_income_basis`(`net_expenses/revenue/unknown`)에 기록합니다. 차량에는 `ownership`(`household_full/joint/leased/other/unknown`), `registration_use`(`non_commercial/commercial/unknown`), `value_basis`(`official/market/unknown`), `eco_subsidy`(`none/received/unknown`)가 있으며 실제 사용 목적 `use`와 구분합니다. 생략된 추가 필드는 `unknown`으로 읽어 기존 버전 1 JSON과 호환합니다. 양수 세후 급여·매출·금액 기준 미확인은 소득 비교를 중단하고, 불명확한 차량 특례는 추가 확인을 반환합니다. 원입력만으로 예외를 확정하지 않습니다. [정의·공고 근거](backend/docs/finance-input-evidence-2026.md).

서버에는 계정별 최신 원입력 한 건만 저장합니다. 조회·저장 응답의 `calculation`은 서버 규칙으로 다시 계산하고, `updated_at`은 마지막 저장 시각의 UTC ISO 8601 문자열입니다. 과거 입력·계산 결과의 이력은 보관하지 않으며 규칙 변경 후 조회 결과가 달라질 수 있습니다. 로그인 만료·로그아웃은 저장값을 삭제하지 않고 자동 보관기간 만료·계정 탈퇴는 미구현입니다. 계산 결과는 공고 전체의 신청 자격 확정을 의미하지 않습니다. 산정 방식·기준연도·가구 범위가 확인되지 않은 공고를 임의로 같은 계산법에 연결하지 않습니다.

금융 응답은 오류를 포함해 `Cache-Control: no-store`를 사용합니다. 422 응답은 `{ "detail": "금액과 필수 항목, 저장 동의 여부를 확인해 주세요." }`이며 원입력·인증정보를 반사하거나 앱 로그에 기록하지 않습니다. 로그인 만료·로그아웃 후에는 회원 금융정보에 접근할 수 없습니다. 금융정보 삭제는 로그인한 본인의 금융 입력만 삭제하며 계정·다른 회원 정보·공고는 변경하지 않습니다.

DB_ENABLED=false인 SQLite는 로그인된 회원이 금융정보 경로를 처음 사용할 때 `account_financial_profiles`를 추가합니다. 기존 인증 DB 파일을 사용하며 `users/user_profiles` 개발 초안과 연결하지 않습니다. MySQL은 HTTP 요청에서 테이블을 자동 생성하지 않습니다. `DB_ENABLED=true` 설정 후 backend 폴더에서 다음 명령을 명시적으로 실행합니다.

```text
# Windows
.venv/Scripts/python.exe -m app.modules.finance
# macOS / Linux
.venv/bin/python -m app.modules.finance
```

이 명령은 인증·금융 테이블 초기화 및 기존 암호화 데이터 복원을 수행하며 회원 ID·비밀번호 해시·카카오 연결을 유지합니다. [키 설정·이관·보안 저장](backend/docs/member-privacy.md). 금융 초기화는 `create_all` 기반이며 이미 존재하는 금융 테이블 구조 변경·저장 원입력 버전 이관을 지원하지 않습니다. [API 회귀 테스트](backend/tests/test_finance_api.py)는 격리 SQLite에서 계정 격리·저장 동의·세션·민감 오류·다시 계산·재시작 보존을 확인합니다. SQLite를 사용한 MySQL 모드의 자동 생성 차단 테스트는 실제 MySQL 저장 검증과 구분합니다.

## 3. 자동 문서·스키마 경로

아래는 FastAPI가 생성하는 문서 경로이며 자체 업무 API와 구분합니다.

| 경로 | 용도 | 확인 사항 |
|---|---|---|
| `/docs` | Swagger UI | 현재 구현된 HTTP 계약 확인 |
| `/redoc` | ReDoc | 읽기용 API 문서 |
| `/openapi.json` | 생성된 OpenAPI | health/readiness, 웹 인증 경로 8개, 금융 경로 4개 포함 |
| `/docs/oauth2-redirect` | Swagger UI 보조 리다이렉트 | 경로 존재가 로그인/OAuth 구현을 의미하지 않음 |

[FastAPI 조립 코드](backend/app/main.py)가 실제 명세를 생성합니다. 별도의 수동 OpenAPI JSON을 만들어 미구현 경로를 노출하지 않습니다. 현재 앱에는 위 문서 경로의 환경별 비활성화나 인증 보호 설정이 없습니다. 운영 노출 정책은 배포 시 확정합니다.

## 4. 설정·CORS·클라이언트 책임

| 설정 | 위치 | 기본값 / 의미 |
|---|---|---|
| `SERVER_HOST` / `SERVER_PORT` | 백엔드 | `127.0.0.1` / `8000`; `server.py`의 Uvicorn 바인딩 |
| `APP_ENV` | 백엔드 | `development`; `production`에서는 `server.py --reload` 거부 |
| `APP_CONFIG_FILE` | 백엔드 프로세스 환경 | 미지정 시 `backend/.env`; 상대 경로는 backend 기준. 명시한 파일이 없으면 실패 |
| `CORS_ORIGINS` | 백엔드 | JSON 배열 `[]`; GET/POST, credentials=true, Content-Type/X-Auth-Request 헤더 |
| `AUTH_ENABLED` | 백엔드 | 기본 true; false이면 인증 API 503 |
| `AUTH_ENCRYPTION_KEYS` | 기존 데이터 복원 전용 | 이전 암호화 DB를 복원할 때만 원래 키 사용; 새 로그인은 불필요 |
| `AUTH_ENCRYPTION_KEY_ID` | 과거 설정 | 현재 로그인에서 사용하지 않음 |
| `AUTH_LOOKUP_KEY` | 기존 데이터 복원 전용 | 이전 암호화 DB의 아이디 인덱스 검증용; 새 로그인은 불필요 |
| `AUTH_SQLITE_PATH` | 백엔드 | 기본 data/auth.sqlite3; DB_ENABLED=false일 때 회원·세션 저장소 |
| `DB_ENABLED` | 백엔드 | `false`; true이면 DB 필수 설정 검사 및 lifespan에서 풀 구성 |
| `DB_HOST/PORT/NAME/USER/PASSWORD`, `DB_SSL_CA` | 백엔드 | [비밀값 없는 설정 예시](backend/.env.example). MySQL 접속 전용 |
| `VITE_API_BASE_URL` | 웹 빌드/개발 환경 | `/api`; 브라우저에 공개되는 값 |
| `VITE_DATA_MODE` | 웹 빌드/개발 환경 | `auto`: 개발 demo / 운영 api. 명시적 api/demo 가능 |
| `window.__BOKJI_CONFIG__` | 웹 public/app-config.js | 명시된 dataMode/apiBaseUrl은 VITE 값보다 우선. 운영 산출물에서 수정 가능. 비밀값 금지 |
| `API_PROXY_TARGET` | 웹 개발 환경 | `http://127.0.0.1:8000`; 개발 프록시에만 사용 |

백엔드 설정 우선순위는 프로세스 환경변수 → 설정 파일 → 기본값입니다. 웹 Vite 설정 변경 후에는 개발 서버를 재시작하고, 운영의 `VITE_*` 변경은 다시 빌드해야 합니다.

현재 개발 프록시를 이용하면 브라우저는 동일 출처로 요청합니다. 브라우저가 다른 출처의 백엔드를 직접 호출할 경우 실제 origin을 `CORS_ORIGINS`에 등록해야 합니다. 예: `["http://127.0.0.1:5173","http://localhost:5173"]`. 두 origin은 다릅니다. CORS는 서버 인증/인가를 대신하지 않으며 네이티브 앱의 권한 체계도 아닙니다.

DB 암호·수집용 키·CLI 인증값은 서버에만 둡니다. 프론트 `VITE_*`, 모바일 번들, 이 관리대장에는 비밀정보를 넣지 않습니다. 계정 인증·세션·명시적으로 저장한 금융정보 조회는 구현했고 추천 프로필·저장 공고의 기기 간 동기화는 미구현입니다.

## 5. 외부 수집 API와 내부 기능의 경계

이 표의 URL은 **백엔드가 호출하는 외부 공급자 주소**입니다. 우리 서버가 제공하는 엔드포인트가 아니며 웹·모바일에서 직접 연결하지 않습니다. 현재 코드·기존 조사 기록을 정리한 것이고 이번 문서 점검에서 외부 API를 재호출하지 않았습니다.

| 공급자 / 내부 기능 | 실제 코드의 호출 범위 | 인증·연결 / 참고 |
|---|---|---|
| Gov24 | `https://api.odcloud.kr/api/gov24/v3/serviceList`, 첫 페이지 목록 | 서버의 `DATA_GO_KR_API_KEY`; [수집기](backend/app/modules/collectors/gov24_services.py) |
| 복지로 | `https://apis.data.go.kr/B554287/NationalWelfareInformationsV001` 아래 `/NationalWelfarelistV001`, `/NationalWelfaredetailedV001` | 서버의 `BokjiRO_API_KEY`; [수집기](backend/app/modules/collectors/bokjiro_services.py) |
| 일반 공고·광운대 공지 | 전달받은 공고 URL·`https://www.kw.ac.kr/ko/life/notice.jsp` | 광운대 등록/장학은 관리자/CLI 자동 수집에 연결. `INGESTION_KWANGWOON_ENABLED=true`, API 키 없이 외부 원문 예산 사용. 별도 업로드 HTTP API 없음. [설정·검증](backend/docs/kwangwoon-auto-collection.md) |
| 원문 파싱 | `backend/scripts/parse-raw.ps1` | 내부 CLI. 원문 → 조건 후보·검증 → MySQL 초안. HTTP 분석 API 없음 |
| MySQL | 서버 내부 연결 | 공고 저장·개정·재개, 공개 공고 조회 API 구현 |

Gov24 상세·조건 경로의 기존 조사 이력은 [API 데이터 분석](backend/docs/api-data-analysis.md)에 있으나 현재 전용 수집 함수는 목록에 한정됩니다. 외부 API 초안과 실제 필드 차이는 [Gov24 참고](backend/docs/api/gov24_services_api.md), [복지로 참고](backend/docs/api/bokjiro_services_api.md)를 확인합니다.

## 6. 미구현 API 관리

| 기능 | 현재 상태 | 다음 계약에서 정할 사항 |
|---|---|---|
| 정책 목록·상세·검색 | 서버·웹 연결 구현. 공개 최신 개정만 조회 | 공개 승인 워크플로 후속 |
| 공고별 개인 질문 | POST /v1/assistant/questions·웹 상세 질문 구현 | 대화 이력·작업 큐 후속 |
| 개인비서 LLM 설명 튜닝 | 조건 비교 추천 API 구현, LLM 설명 튜닝은 후속 | 회원 DB/선택 정보 → 원문 조건 비교 → 이유·확인사항. 신청 자격 확정 없음 |
| 조건·자격 판정 | 미구현 | 입력 fact, 기준 시점, PASS/FAIL/UNKNOWN 의미와 근거 |
| 원문 업로드·분석 | CLI만 있음. HTTP 경로 미정 | 입력 제한, 작업 ID·상태, 오류·재시도·결과 접근 권한 |
| 로그인·프로필·저장 공고 | 로그인/가입·계정별 금융 입력 저장 구현. 추천 프로필·저장 공고는 브라우저 기능 | 회원정보 수정·웹 카카오 가입 구현. 추천 프로필·저장 공고 동기화·탈퇴는 후속 |
| 알림·푸시 | 미구현 | 동의, Android/iOS 권한·토큰, 발송·해제 계약 |

정책 DB 적재는 구현했으며 공개 승인은 후속 작업입니다. `draft` 개정을 공개 정책 응답으로 사용하지 않습니다. [공고·회원 질문의 실제 계약](backend/docs/policy-storage.md).

### 프론트에서 사용하는 업무 경로

| Method / Path | 웹 요청 | 입력 / 응답 | 상태 |
|---|---|---|---|
| GET /v1/policies | /api/v1/policies | q, search_scope, tag, category, region, audience, sort, limit, cursor → items,total,nextCursor | 서버·웹 연결 구현 |
| GET /v1/policies/{policy_key} | /api/v1/policies/{policy_key} | 최신 공개 공고 카드 | 서버 구현 |
| POST /v1/assistant/questions | /api/v1/assistant/questions | revision_id,question → answer,citations,follow_up_questions | 회원 쿠키/Bearer·웹 질문 구현 |
| GET /v1/assistant/faqs | /api/v1/assistant/faqs | revision_id → items:[{id,question,response}] | 회원용 선택형 기본 질문 6개·LLM 호출 없음 |
| POST /v1/recommendations | /api/v1/recommendations | profile?,limit:3, 선택적 금융정보 → summary,items:[{policy,reason,matching}] | 서버 조건 비교 구현·웹 쿠키/앱 Bearer 지원 |

`financialProfile`은 사용자가 계산기에서 추천에 반영하기를 선택했을 때만 추가하는 금융 원입력입니다. 일반 추천 프로필·브라우저 저장소에 자동 합치지 않으며 계정 금융정보 저장과도 별개입니다. 서버의 `evaluate_policy()`와 승인된 공고 저장소·추천 API를 실제로 연결하는 작업은 아직 남아 있습니다.

세부 [제안 HTTP 계약](frontend/docs/service-contract.md), [연동 구현](frontend/docs/api-integration.md), [배포 설정](frontend/docs/deployment.md). 공고·인증 요청 제한 15초, 추천 30초. 웹은 키·LLM 직접 호출을 포함하지 않습니다. 오류에서 합성 자료로 fallback하지 않습니다. 인증은 같은 사이트 API 프록시를 사용하고 다른 출처가 필요하면 CORS Origin을 정확히 설정합니다.

## 7. 실행과 검증

저장소 루트의 PowerShell에서 백엔드 환경 설치 후 실행합니다. 상세 설치는 [개발환경 문서](backend/docs/development.md)를 따릅니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/start.ps1 -Reload
```

별도 터미널에서 확인합니다. readiness는 DB가 비활성/불가하면 503이 정상적인 결과입니다. 아래는 기본 포트 기준입니다.

```powershell
curl.exe -i http://127.0.0.1:8000/health
curl.exe -i http://127.0.0.1:8000/health/ready
curl.exe -i http://127.0.0.1:8000/openapi.json
# 웹 개발 서버도 실행 중일 때만 프록시 확인
curl.exe -i http://127.0.0.1:5173/api/health
```

DB·외부 API를 호출하지 않는 계약 회귀 검증은 backend 폴더에서:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_bootstrap.py -q
```

2026-09-22 문서 점검에서 이 테스트 7개 통과, 기존 라이브러리 deprecation 경고 2개를 확인했습니다. TestClient로 `/health` 200, DB 비활성 readiness 503, 생성된 OpenAPI의 두 경로를 대조했습니다. 실제 실행 서버·MySQL·외부 공급자·모바일 기기 연결을 이번 점검에서 검증한 것은 아닙니다.

## 8. 엔드포인트 변경 시 갱신할 곳

| 관리 항목 | 파일 / 담당 |
|---|---|
| 라우터와 앱 등록 | `backend/app/api/`, [app/main.py](backend/app/main.py) / 백엔드 |
| API 계약과 이 관리대장 | [backend/docs/api/readme.md](backend/docs/api/readme.md), 이 파일 / 백엔드 |
| 입력·반환 데이터와 실제 구현 상태 | [데이터 계약](backend/docs/data-contracts.md), [구현 상태](backend/docs/implementation-status.md) / 백엔드 |
| 호출 주소·오류·인증·응답 변환 | [프론트 연동 문서](frontend/docs/api-integration.md), 웹/Android/iOS 어댑터 / 프론트엔드 |
| 환경변수 | 영역별 `.env.example`, [개발환경](backend/docs/development.md) / 변경 담당 |
| 회귀 검증 | [백엔드 HTTP 테스트](backend/tests/test_bootstrap.py), [웹 E2E](frontend/web/tests/e2e/app.spec.js) / 변경 담당 |
| 변경 이력·문서 탐색 | 양쪽 `docs/worklog.md`, [루트 README](readme.md) / 변경 담당 |

추가·수정·폐기할 때 Method/Path, 입력 필수값·타입, 성공/실패 상태 코드와 예시, 인증/인가, 페이지·정렬 규칙, 시간 제한·재시도, 호환성/클라이언트 이관 여부를 같은 변경에서 명시합니다. 코드에 등록하고 검증한 뒤에만 상태를 구현으로 바꿉니다. 현재 URL 접두사·응답 형식은 실제 코드와 일치하도록 유지합니다.

## 9. 관리 이력

| 날짜 | 변경 | 근거 |
|---|---|---|
| 2026-09-22 | 루트 통합 관리대장 신설. health/readiness, 자동 문서, 웹 proxy/CORS, 외부 수집·미구현 범위 구분 | 실제 라우터·설정·OpenAPI·HTTP 테스트 대조. [전체 문서 점검](backend/docs/documentation-audit.md) |
| 2026-09-22 | 개인비서 UI·쉬운 화면·인증 폼 및 목록/추천 호출자·배포 설정 추가. 서버 제안 경로와 구현 경로 구분 | [프론트 작업 기록](frontend/docs/worklog.md), [제안 계약](frontend/docs/service-contract.md) |
| 2026-09-25 | 비회원 소득·재산 계산, 회원 금융 원입력 저장·조회·삭제 API 및 명시적인 MySQL 초기화 경로 추가 | [라우터](backend/app/api/finance.py), [입력 계약](backend/app/contracts/finance.py), [API 회귀 테스트](backend/tests/test_finance_api.py) |


## 모바일 인증 — 2026-10-01 추가

[라우터](backend/app/api/mobile_auth.py), [회귀 테스트](backend/tests/test_mobile_auth.py), [앱 실행 안내](frontend/mobile/readme.md).

| Method | 경로 | 입력 | 성공 응답 |
|---|---|---|---|
| POST | `/v1/mobile/auth/login` | `{username,password}`, `X-Auth-Request: 1` | `{access_token,token_type:"Bearer",expires_in:604800,user}` |
| GET | `/v1/mobile/auth/me` | `Authorization: Bearer <token>` | `{user}` |
| POST | `/v1/mobile/auth/logout` | 같은 Bearer, `X-Auth-Request: 1`, `{}` | `{message}` |

모바일 라우트는 웹 쿠키를 읽거나 설정하지 않습니다. 서버가 생성한 43자 opaque 토큰을 앱 보안 저장소에 보관하며 서버 DB에는 `SHA-256("mobile:" + token)`만 저장합니다. 기존 쿠키는 기존 해시를 유지하므로 서로 인증 수단으로 사용할 수 없습니다. 기존 계정/세션 테이블을 사용하고 추가 DB 마이그레이션은 필요하지 않습니다. 모바일 자동 토큰 갱신은 없고 7일 만료 후 재로그인합니다. 로그인 시 기존 웹 세션은 폐기하지 않으며 모바일 로그아웃은 해당 모바일 토큰만 폐기합니다.

로그인 입력 검증·비밀번호 해시·IP/아이디별 시도 제한은 웹과 동일한 서비스를 사용합니다. 401 인증 실패/만료, 403 POST 헤더 누락, 422 입력 오류, 429 시도 제한, 503 인증 비활성/DB 오류를 처리합니다. 응답과 오류는 `Cache-Control: no-store`이며 422 응답에 비밀번호를 반사하지 않습니다. 로그아웃은 형식이 유효한 이미 폐기/만료된 토큰에도 성공합니다.

회원 금융 경로는 기존 쿠키 또는 모바일 Bearer를 지원합니다. Authorization 헤더가 있으면 모바일 토큰만 검증하며 잘못된 값을 웹 쿠키로 대체하지 않습니다. CORS 허용 헤더에 Authorization을 추가하되 허용 Origin·GET/POST·기존 CSRF 헤더는 유지합니다. 네이티브 HTTP에는 브라우저 CORS가 적용되지 않지만 브라우저 미리보기는 설정된 Origin이 필요합니다. 운영 API는 HTTPS로 배포합니다. 스토어 배포/자동 갱신/계정 탈퇴는 이 변경에 포함되지 않습니다.

2026-10-02 회원 저장 보안 갱신: 개발·운영 회원 저장은 MySQL이며 아이디·프로필·가입 대기 닉네임·동의한 금융 원입력은 AES-256-GCM 암호화합니다. 아이디 검색/중복 확인은 HMAC 인덱스를 사용합니다. 키 누락·키 불일치·변조·미이관 평문은 안전한 503으로 거부합니다. 일반/카카오/모바일 HTTP 응답 계약은 유지합니다. 별도 MySQL 테스트 DB에서 실제 가입·로그인·금융 암호화를 검증했습니다. [설정·명령·운영](backend/docs/member-privacy.md).
## 모바일 알림 설정 — 2026-10-02

모바일 Bearer 전용이며 POST는 `X-Auth-Request: 1`, 모든 응답은 `no-store`입니다. 회원 ID는 서버 세션에서 결정합니다.

| 메서드 | 경로 | 입력 | 응답 |
| --- | --- | --- | --- |
| GET | `/v1/mobile/notifications/preferences` | Bearer | `{enabled, policy_changes, similar_policies, eligible_policies, application_results}` boolean |
| POST | `/v1/mobile/notifications/preferences` | 같은 다섯 boolean | 저장된 설정 |
| POST | `/v1/mobile/notifications/devices` | `{push_token, platform}` | `{registered: true}` |
| POST | `/v1/mobile/notifications/devices/disable` | `{}` | `{disabled: true}` |

전체 수신 기본값은 OFF입니다. 로그아웃/세션 만료 기기는 발송 대상에서 제외합니다. MySQL 추가 테이블 초기화는 `python -m app.modules.notifications`. 권한창·설정 UI·기기 등록·수신 필터 payload까지 구현했으며 실제 자동 이벤트와 발송 worker는 아직 없습니다. [서버 계약](backend/app/modules/notifications/readme.md), [모바일 사용·푸시 구성](frontend/mobile/src/features/notifications/readme.md).


## 전체공고 인기순·분야 확장 (2026-10-07)

`GET /v1/policies`의 `sort`는 `relevance`, `popular`, `recent`, `name`을 받습니다.
생략 시 자연어 검색어가 있으면 관련도순, 빈 검색·단어 검색이면 인기순입니다.
확인된 정부24 `조회수`·복지로 `inqNum`의 누적 조회수를 내림차순으로 정렬한 뒤
limit/offset 페이지를 적용합니다. 조회수가 없는 공고는 뒤에, 동률은 최근 등록일·공고 ID
순서로 표시합니다. 웹 전체공고 기본값과 조건 초기화도 인기순이며 정렬 변경 시 cursor를
초기화합니다. 기존 최근 등록순·이름순 요청은 호환됩니다. 인증·오류·페이지 응답 형태는 유지합니다.
목록·상세의 선택 `popularity`는 기존 추천과 동일한 `{views,source,basis,asOf} | null`입니다.

분야는 생활·금융, 주거, 일자리, 교육, 건강·돌봄, 문화, 농림축산·어업, 사업·창업, 기타입니다.
기존 공고는 저장 원문과 개정을 보존하며 지원 내용에 따라 표시 분류를 보완합니다.
관리자 수동 분류를 우선하며 목록·상세·캘린더·추천·분야/태그 필터에 같은 기준을 사용합니다.
신규 분석과 관리자 편집도 추가 분야를 허용합니다.
[분류 기준·검증](backend/docs/policy-categories.md),
[조회수 기준](backend/docs/policy-popularity.md),
[웹 호출 계약](frontend/docs/service-contract.md).

## 공고 검색 필터 보완 (2026-10-06)

2026-10-06 공고 표시 응답에 선택 `paymentSchedule: string | null`을 추가했습니다.
명시된 지급 시기를 목록·상세·캘린더 카드에 전달하며 신청 일정 필드는 기존 의미를 유지합니다.
요약·혜택은 검증된 개요를 우선하여 명사형 공고체로 표시합니다. 원문·인용은 변경하지 않습니다.

`GET /v1/policies`와 `/v1/policies/calendar`는 검색어·분야·지역·대상을 AND로 적용합니다.
지역은 약칭·정식/이전 명칭을 함께 검색하며 광주광역시와 경기도 광주시를 구분합니다.
대상은 확인된 나이 개요와 기타 조건을 함께 검색해 가족·양육 조건과 노인·고령·시니어
표현을 반영합니다. 숫자 나이만으로 대상명을 추정하지 않습니다. 입력·응답 형식은 그대로입니다.
[호출·필터 범위·검증](backend/app/modules/storage/readme.md).

## 공고 캘린더 (2026-10-02)

| Method | 백엔드 경로 | 인증 | 입력 |
| --- | --- | --- | --- |
| GET | `/v1/policies/calendar` | 비회원 가능 | 필수 `month=YYYY-MM`(2000~2099), 선택 `q`, `search_scope`, `category`, `region`, `audience` |

웹에서는 `/api/v1/policies/calendar`로 조회합니다. 공고별 최신 **공개** 개정만 사용하며 필터 의미는 기존 목록 API와 같습니다. 월 형식/필터 길이 오류는 422, DB 미설정·장애는 503입니다. DB 수정·초안 공개·LLM 호출은 수행하지 않습니다.

응답은 `{month,items,total,truncated,undatedItems,undatedTotal}`입니다. `items`는 접수 기간이 월과 겹치거나 해당 월에 시작/마감하는 공고(최대 500개), `total`은 조건에 맞는 전체 건수입니다. 초과 시 `truncated=true`로 표시합니다. 날짜를 확정할 수 없는 공고는 `undatedItems`(최대 25개)와 `undatedTotal`로 따로 제공합니다.

목록·상세·캘린더 공고 카드에 `applicationStart`, `applicationEnd`(YYYY-MM-DD 또는 null), `scheduleStatus`(`dated`/`ongoing`/`unknown`)가 추가됩니다. 명시된 연·월·일은 그대로 사용하고, 월 단위 신청 기간은 시작 월 1일·마지막 월의 마지막 날로 변환합니다. 시작일/마감일만 확인되면 다른 날짜는 null입니다. 상시 신청, 누락, 해석할 수 없는 기간은 날짜를 만들지 않습니다. 시간 정보는 달력 날짜로 요약하므로 실제 접수 시간은 공식 공고를 확인합니다.

2026-10-08 사용자 정정 반영: `3~4월`은 3월 1일 접수 시작·4월 30일 접수 마감으로
변환하여 일반 날짜 공고와 같은 `dated` 일정으로 표시합니다. 2월 말일은 윤년을
반영하며, 월 범위 원문은 `applicationPrecision="month"`로 구분합니다.
해당 월 공고의 `items/total`에 포함하고 미확인 일정 목록에서는 제외합니다.
명시된 연도가 우선이고 연도 미기재 자료는 캘린더 조회 연도(일반 목록·상세는 한국 시간
현재 연도)를 사용합니다. 별도 월별 참고 목록 없이 시작일·마감일·기간 내 날짜에 표시합니다.
정확한 날짜의 마감 공고도 원래 연도·월 조회에서 제외하지 않습니다.
기존 공개 카드의 지원 대상은 연령 조건 외 원문 대상·검증된 조건을 함께 사용하며,
`sourceUrl`은 원문/공급자 목록 URL을 우선합니다. 누락된 정부24·복지로 주소만
공식 서비스 ID로 보완하며 신청 주소(`applicationUrl`)와 구분합니다.
# 2026-10-06 사용자 DB와 공고 매칭 갱신

`POST /v1/recommendations` 구현: 웹 쿠키/앱 Bearer 회원 DB 프로필 또는 비회원 요청 프로필을
최신 공개 공고 조건과 비교합니다. `X-Auth-Request:1`, `Cache-Control:no-store`.
요청 `{profile?,limit?:1..3,financialProfile?,use_saved_financial_profile?:false}`.
저장 금융정보는 명시적인 선택 때에만 본인 계정으로 조회합니다. 직접 금융정보와 동시 선택은 422.
응답 `{items:[{policy,reason,matching}],summary,profile_source,financial_source,
eligibility_decided:false,truncated}`. 로그인 정보 오류 401, DB 준비/조회 오류 503,
저장 금융정보 없음 409, 형식 오류 422, 회원 요청 제한 429(분당 20회).
비활성 매칭/부분 조건은 needs_review이며 자격 확정을 하지 않습니다. OpenAPI는 코드에서 생성됩니다.
[DB 확인·저장·대응표](backend/docs/member-policy-matching.md),
[공개 함수](backend/app/modules/matching/readme.md).

## 추천 정보 충분성·인기 공고 (2026-10-07)

`POST /v1/recommendations`는 비회원의 빈 `{}` 요청도 지원합니다. 기존 인증 세션이
잘못되었을 때는 401로 응답합니다. `mode`는 `personalized`/`popular`/`general`/
`profile_required`이며, `profile_sufficient:boolean`, `guidance:string`,
`missing_fields:string[]`가 추가됩니다. 웹은 `personalized`와 정보 충분성 확인이
함께 있는 경우에만 맞춤 추천으로 안내합니다. 특수 자격이 확인되지 않은 공고나
조건 검토가 미완료인 공고를 메인 추천에 채우지 않습니다.

추천 정책의 선택 `popularity`는 `{views,source,basis:"provider_cumulative_views",asOf}`이며
정부24·복지로의 실제 누적 조회수를 나타냅니다. 수집 목록에서 갱신되며, 최근 증가량·
사이트 회원 관심 수로 해석하지 않습니다. 기존 수집 테이블을 읽어 추가 마이그레이션은
없습니다. 관측 시각을 확인할 수 없으면 `asOf:null`입니다.

선택 `budget`은 `{usedPercent,sourceUrl,asOf,evidence}`이며 공고 원문의 명시적
예산 소진율만 전달합니다. 일반 공공 API에서 수치를 제공하지 않으면 생략합니다.
선택 `budgetNotice`는 원문에 예산 소진 시 마감 안내가 있을 때만 전달합니다.
100% 소진이 명시된 공고는 메인 추천에서 제외합니다.
[조건·정보 기준](backend/docs/recommendation-safety.md),
[출처 조회수·갱신 방식](backend/docs/policy-popularity.md).

### 자유 대화 모드 (2026-10-08)

회원/비회원 dialogue API는 선택 입력 mode:conversation을 지원합니다. 전용 AI 비서 화면은 이 모드를 사용하며 follow_up:null, missing_fields:[], can_save_profile:false로 메시지를 이어갑니다. 기존 mode 생략 상담은 유지합니다. [자유 대화 계약](backend/docs/free-conversation.md).
