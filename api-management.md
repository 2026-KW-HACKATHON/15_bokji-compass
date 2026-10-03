# 백엔드 엔드포인트·연동 관리

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

POST/PATCH는 같은 출처, JSON과 `X-Auth-Request: 1`이 필요하며 요청 본문은 64KB까지입니다.
페이지·API는 no-store·CSP·프레임 삽입 금지를 적용합니다. 비로그인/만료 401, 권한 부족/다른
출처/요청 헤더 누락 403, 존재하지 않는 조회 종류 404, 설정 파일 버전 충돌 409, 본문 상한
413, 입력/허용 목록/환경변수 관리 필드 오류 422, DB·설정 파일 장애 503이며 비밀 입력을
오류 응답에 포함하지 않습니다. 로그인 시도 제한은 기존 인증 서비스의 429를 따릅니다.

설정 허용 범위는 수집 허용·처리량·회차/일일 예산·재시도·자원·주기·검색, 모델·추론·timeout·
입력 길이, API 키, 자동 공개 방식, DB 연결입니다. 비밀 입력칸을 비우면 화면은 변경을 보내지
않아 기존 값을 유지합니다. 명시적 삭제는 빈 문자열이며 null은 거절합니다. 환경변수 우선
항목은 읽기 전용이고, 설정 파일 경로·HTTP 서버 포트·인증·CORS·실행파일·SQL·프로세스 제어는
허용하지 않습니다.

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
| POST | `/v1/auth/signup` | 201, 가입 완료 | 400, 409, 422, 429 |
| POST | `/v1/auth/login` | user, HttpOnly 세션 쿠키 | 401, 422, 429 |
| GET | `/v1/auth/me` | 현재 user | 401 |
| POST | `/v1/auth/profile` | 로그인 회원의 name·age·gender·region 변경, user 반환 | 401, 422 |
| POST | `/v1/auth/logout` | 서버 세션 및 쿠키 폐기 | 503 |

모든 POST는 JSON과 `X-Auth-Request: 1` 헤더가 필요합니다(누락 403). 공통 저장소 장애/비활성은 503입니다. 가입 필드는 이름(name, 필수 1~50자)·아이디·비밀번호·비밀번호 확인·만 나이·성별·시도입니다. 로그인과 세션 조회의 user에 name을 포함하며 기존 이름 없는 계정은 null입니다. [정확한 입력·응답·제한·저장소·실행법](backend/app/modules/auth/readme.md), [호출자](frontend/web/src/features/auth/authApi.js), [생성 스키마](backend/app/api/auth.py)를 기준으로 합니다.

카카오 추가 경로는 GET `/v1/auth/kakao/status`, POST `/start`, GET `/callback`, GET `/pending`, POST `/complete`입니다(동일 `/v1/auth/kakao` 접두사). 전화번호 요청·확인 경로는 제거되어 404입니다. `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `KAKAO_WEB_URL`을 서버에 설정해야 합니다. [상세 계약](backend/app/modules/auth/readme.md).

### 소득·재산 계산 및 계정별 저장

[금융 라우터](backend/app/api/finance.py), [입력 계약](backend/app/contracts/finance.py), [계정별 저장소](backend/app/modules/finance/storage.py)가 구현 기준입니다. [모듈 사용법·초기화](backend/app/modules/finance/readme.md), [공식 산정 규칙·계산 한계](backend/docs/financial-rules.md)를 함께 확인합니다. 웹 프록시에서는 아래 경로 앞에 `/api`를 붙입니다.

| Method | 백엔드 경로 | 입력 | 인증·성공 | 오류 |
|---|---|---|---|---|
| GET | `/v1/finance/rules` | 없음 | 비회원 가능, 산정 규칙 목록 객체 | 연결 실패 |
| POST | `/v1/finance/calculate` | `{profile}` | 비회원 가능, 계산 결과 객체. DB 저장 없음 | 422 |
| GET | `/v1/finance/profile` | 세션 쿠키 | `{profile, calculation, updated_at}`. 미저장 시 셋 모두 null | 401, 503 |
| POST | `/v1/finance/profile` | `{profile, consent: true}` | 세션 쿠키, 저장 후 조회와 같은 응답 | 401, 403, 422, 503 |
| POST | `/v1/finance/profile/delete` | 빈 JSON `{}` | 세션 쿠키, `{deleted: true}`. 이미 없어도 동일 | 401, 403, 422, 503 |

회원 저장·삭제 POST는 `X-Auth-Request: 1` 헤더가 필수입니다. 공개 계산 POST는 이 헤더나 로그인 없이 사용할 수 있고 `AUTH_ENABLED=false`, `DB_ENABLED=false`에서도 계산합니다. 공개 계산·규칙 조회는 인증 서비스나 DB 테이블을 생성하지 않습니다. 회원 경로는 `credentials: include`로 세션 쿠키를 보내며 로그인 검증을 거친 계정 ID만 사용합니다. 본문의 account_id·owner_id·계산 결과 등 계약 외 필드는 422로 거부합니다.

`profile`에는 가구 구성, 가구원별 소득, 재산·부채·차량 원입력이 들어갑니다. 금액은 음수가 아닌 정수 원이며 미입력 null과 실제 금액 0을 구분합니다. 가구원 목록 길이는 `household_size`와 같아야 합니다. 정확한 선택값·범위·필수 항목은 생성 OpenAPI의 `FinancialProfile`을 따릅니다. 저장 동의는 JSON boolean `true`만 허용하며 숫자 1·문자열·동의 누락은 거부합니다.

소득 기준은 `members[].earned_income_basis`(`gross/net/unknown`)와 `business_income_basis`(`net_expenses/revenue/unknown`)에 기록합니다. 차량에는 `ownership`(`household_full/joint/leased/other/unknown`), `registration_use`(`non_commercial/commercial/unknown`), `value_basis`(`official/market/unknown`), `eco_subsidy`(`none/received/unknown`)가 있으며 실제 사용 목적 `use`와 구분합니다. 생략된 추가 필드는 `unknown`으로 읽어 기존 버전 1 JSON과 호환합니다. 양수 세후 급여·매출·금액 기준 미확인은 소득 비교를 중단하고, 불명확한 차량 특례는 추가 확인을 반환합니다. 원입력만으로 예외를 확정하지 않습니다. [정의·공고 근거](backend/docs/finance-input-evidence-2026.md).

서버에는 계정별 최신 원입력 한 건만 저장합니다. 조회·저장 응답의 `calculation`은 서버 규칙으로 다시 계산하고, `updated_at`은 마지막 저장 시각의 UTC ISO 8601 문자열입니다. 과거 입력·계산 결과의 이력은 보관하지 않으며 규칙 변경 후 조회 결과가 달라질 수 있습니다. 로그인 만료·로그아웃은 저장값을 삭제하지 않고 자동 보관기간 만료·계정 탈퇴는 미구현입니다. 계산 결과는 공고 전체의 신청 자격 확정을 의미하지 않습니다. 산정 방식·기준연도·가구 범위가 확인되지 않은 공고를 임의로 같은 계산법에 연결하지 않습니다.

금융 응답은 오류를 포함해 `Cache-Control: no-store`를 사용합니다. 422 응답은 `{ "detail": "금액과 필수 항목, 저장 동의 여부를 확인해 주세요." }`이며 원입력·인증정보를 반사하거나 앱 로그에 기록하지 않습니다. 로그인 만료·로그아웃 후에는 회원 금융정보에 접근할 수 없습니다. 금융정보 삭제는 로그인한 본인의 금융 입력만 삭제하며 계정·다른 회원 정보·공고는 변경하지 않습니다.

APP_ENV=test의 격리 SQLite는 로그인된 회원이 금융정보 경로를 처음 사용할 때 `account_financial_profiles`를 추가합니다. 기존 인증 DB 파일을 사용하며 `users/user_profiles` 개발 초안과 연결하지 않습니다. MySQL은 HTTP 요청에서 테이블을 자동 생성하지 않습니다. `DB_ENABLED=true` 설정 후 backend 폴더에서 다음 명령을 명시적으로 실행합니다.

```text
# Windows
.venv/Scripts/python.exe -m app.modules.finance
# macOS / Linux
.venv/bin/python -m app.modules.finance
```

이 명령은 인증·금융 테이블 초기화 및 기존 회원/금융 개인정보 암호화를 수행하며 회원 ID·비밀번호 해시·카카오 연결을 유지합니다. [키 설정·이관·보안 저장](backend/docs/member-privacy.md). 금융 초기화는 `create_all` 기반이며 이미 존재하는 금융 테이블 구조 변경·저장 원입력 버전 이관을 지원하지 않습니다. [API 회귀 테스트](backend/tests/test_finance_api.py)는 격리 SQLite에서 계정 격리·저장 동의·세션·민감 오류·다시 계산·재시작 보존을 확인합니다. SQLite를 사용한 MySQL 모드의 자동 생성 차단 테스트는 실제 MySQL 저장 검증과 구분합니다.

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
| `AUTH_ENCRYPTION_KEYS` | 백엔드 | 키ID→32바이트 Base64 암호키의 JSON; 서버 비밀 설정 |
| `AUTH_ENCRYPTION_KEY_ID` | 백엔드 | 신규 암호화에 사용할 키ID, 기본 primary |
| `AUTH_LOOKUP_KEY` | 백엔드 | 암호키와 분리한 32바이트 HMAC 키; 로그인 인덱스 확인 |
| `AUTH_SQLITE_PATH` | 백엔드 | 기본 data/auth.sqlite3; APP_ENV=test, DB_ENABLED=false인 격리 테스트 전용 |
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
| 일반 공고·광운대 공지 | 전달받은 공고 URL·`https://www.kw.ac.kr/ko/life/notice.jsp` | 내부 Python 수집 함수. 업로드/수집 HTTP API 없음 |
| 원문 파싱 | `backend/scripts/parse-raw.ps1` | 내부 CLI. 원문 → 조건 후보·검증 → MySQL 초안. HTTP 분석 API 없음 |
| MySQL | 서버 내부 연결 | 공고 저장·개정·재개, 공개 공고 조회 API 구현 |

Gov24 상세·조건 경로의 기존 조사 이력은 [API 데이터 분석](backend/docs/api-data-analysis.md)에 있으나 현재 전용 수집 함수는 목록에 한정됩니다. 외부 API 초안과 실제 필드 차이는 [Gov24 참고](backend/docs/api/gov24_services_api.md), [복지로 참고](backend/docs/api/bokjiro_services_api.md)를 확인합니다.

## 6. 미구현 API 관리

| 기능 | 현재 상태 | 다음 계약에서 정할 사항 |
|---|---|---|
| 정책 목록·상세·검색 | 서버·웹 연결 구현. 공개 최신 개정만 조회 | 공개 승인 워크플로 후속 |
| 공고별 개인 질문 | POST /v1/assistant/questions·웹 상세 질문 구현 | 대화 이력·작업 큐 후속 |
| 개인비서 LLM 추천 | 서버 미구현. 웹 POST /v1/recommendations 호출자 있음 | 사용자 정보 → 서버 LLM → 추천 이유·공고. 인증/비용·보관 정책 확정 |
| 조건·자격 판정 | 미구현 | 입력 fact, 기준 시점, PASS/FAIL/UNKNOWN 의미와 근거 |
| 원문 업로드·분석 | CLI만 있음. HTTP 경로 미정 | 입력 제한, 작업 ID·상태, 오류·재시도·결과 접근 권한 |
| 로그인·프로필·저장 공고 | 로그인/가입·계정별 금융 입력 저장 구현. 추천 프로필·저장 공고는 브라우저 기능 | 회원정보 수정·웹 카카오 가입 구현. 추천 프로필·저장 공고 동기화·탈퇴는 후속 |
| 알림·푸시 | 미구현 | 동의, Android/iOS 권한·토큰, 발송·해제 계약 |

정책 DB 적재는 구현했으며 공개 승인은 후속 작업입니다. `draft` 개정을 공개 정책 응답으로 사용하지 않습니다. [공고·회원 질문의 실제 계약](backend/docs/policy-storage.md).

### 프론트에서 사용하는 업무 경로

| Method / Path | 웹 요청 | 입력 / 응답 | 상태 |
|---|---|---|---|
| GET /v1/policies | /api/v1/policies | q, tag, category, region, audience, sort, limit, cursor → items,total,nextCursor | 서버·웹 연결 구현 |
| GET /v1/policies/{policy_key} | /api/v1/policies/{policy_key} | 최신 공개 공고 카드 | 서버 구현 |
| POST /v1/assistant/questions | /api/v1/assistant/questions | revision_id,question → answer,citations,follow_up_questions | 회원 쿠키/Bearer·웹 질문 구현 |
| GET /v1/assistant/faqs | /api/v1/assistant/faqs | revision_id → items:[{id,question,response}] | 회원용 선택형 기본 질문 6개·LLM 호출 없음 |
| POST /v1/recommendations | /api/v1/recommendations | profile,limit:3, 선택적 financialProfile → summary,items:[{policy,reason}] | 호출자 구현·서버 LLM 미구현 |

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


## 공고 캘린더 (2026-10-02)

| Method | 백엔드 경로 | 인증 | 입력 |
| --- | --- | --- | --- |
| GET | `/v1/policies/calendar` | 비회원 가능 | 필수 `month=YYYY-MM`(2000~2099), 선택 `q`, `category`, `region`, `audience` |

웹에서는 `/api/v1/policies/calendar`로 조회합니다. 공고별 최신 **공개** 개정만 사용하며 필터 의미는 기존 목록 API와 같습니다. 월 형식/필터 길이 오류는 422, DB 미설정·장애는 503입니다. DB 수정·초안 공개·LLM 호출은 수행하지 않습니다.

응답은 `{month,items,total,truncated,undatedItems,undatedTotal}`입니다. `items`는 접수 기간이 월과 겹치거나 해당 월에 시작/마감하는 공고(최대 500개), `total`은 조건에 맞는 전체 건수입니다. 초과 시 `truncated=true`로 표시합니다. 날짜를 확정할 수 없는 공고는 `undatedItems`(최대 25개)와 `undatedTotal`로 따로 제공합니다.

목록·상세·캘린더 공고 카드에 `applicationStart`, `applicationEnd`(YYYY-MM-DD 또는 null), `scheduleStatus`(`dated`/`ongoing`/`unknown`)가 추가됩니다. 원문 신청 기간 또는 한 개의 명시적인 신청/접수 기간 문장에서 연·월·일이 명확한 날짜만 추출합니다. 시작일/마감일만 확인되면 다른 날짜는 null입니다. 상시 신청, 누락, 모호한 기간은 임의 날짜를 만들지 않습니다. 시간 정보는 달력 날짜로 요약하므로 실제 접수 시간은 공식 공고를 확인합니다.
