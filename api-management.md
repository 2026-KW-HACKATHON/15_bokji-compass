# 백엔드 엔드포인트·연동 관리

최종 확인: 2026-09-22. 담당 영역: 백엔드(API·설정·응답 계약), 프론트엔드(웹·Android·iOS 호출자). 이 파일은 팀 공통 API 관리대장입니다. 실제 코드가 기준이며 변경 시 이 문서와 호출자를 함께 갱신합니다.

**현재 직접 구현한 HTTP 엔드포인트는 `GET /health`, `GET /health/ready` 두 개입니다.** 정책 목록·상세·검색·사용자 자격 판정·인증·프로필·관심 혜택·알림 API는 아직 없습니다. 웹의 정책 화면은 합성 예시로 동작합니다.

## 1. 접속 주소와 경로 규칙

| 구분 | 기본 주소 / 경로 | 관리 위치 |
|---|---|---|
| 로컬 백엔드 | `http://127.0.0.1:8000` | [server.py](backend/server.py), [설정 코드](backend/app/core/config.py), `backend/.env` |
| 웹 개발 서버 | `http://127.0.0.1:5173` | [Vite 설정](frontend/web/vite.config.js) |
| 웹에서 사용하는 API 기준 경로 | `/api` | `VITE_API_BASE_URL`, [HTTP 클라이언트](frontend/web/src/shared/api/client.js) |
| 개발 프록시 대상 | `http://127.0.0.1:8000` | `API_PROXY_TARGET`, [웹 설정 예시](frontend/web/.env.example) |
| 운영 API 주소 | 미정·배포 미구성 | 운영 호스트 확정 후 이 표와 클라이언트 설정 갱신 |
| Android/iOS API 주소 | 앱 미구현·설정 미정 | 같은 공개 HTTP 계약을 사용하되 플랫폼별 설정으로 공급 |

개발 요청 흐름:

```text
브라우저 GET http://127.0.0.1:5173/api/health
    → Vite가 /api 접두사를 제거
    → 백엔드 GET http://127.0.0.1:8000/health
```

`/api`는 현재 웹 프록시 접두사이며 백엔드 라우터의 접두사가 아닙니다. 백엔드에 직접 `/api/health`를 호출하면 해당 라우트가 없습니다. API 버전 접두사도 아직 없습니다. 운영 빌드와 `vite preview`에는 개발 프록시가 적용되지 않으므로 운영 reverse proxy 또는 공개 HTTPS API 주소/CORS를 별도로 구성해야 합니다.

휴대폰의 `127.0.0.1`은 휴대폰 자신입니다. 실제 기기 연동 시 접근 가능한 개발 서버 주소와 바인딩·네트워크 구성을 별도로 정합니다. 이 문서는 현재 로컬 서버를 외부에 공개하도록 설정하지 않습니다.

## 2. 구현된 엔드포인트

| ID | Method | 백엔드 경로 | 입력 | 인증 | 성공 / 실패 | 구현 / 호출자 |
|---|---|---|---|---|---|---|
| health | GET | `/health` | 경로·쿼리·본문 인수 없음 | 없음 | 200 / 연결 실패 시 HTTP 응답 자체가 없을 수 있음 | [liveness](backend/app/api/health.py), 웹 서비스 안내의 연결 확인 |
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

## 3. 자동 문서·스키마 경로

아래는 FastAPI가 생성하는 경로이며 현재 런타임에서 GET/HEAD를 제공합니다. 자체 업무 API 두 개와 구분합니다.

| 경로 | 용도 | 확인 사항 |
|---|---|---|
| `/docs` | Swagger UI | 현재 구현된 HTTP 계약 확인 |
| `/redoc` | ReDoc | 읽기용 API 문서 |
| `/openapi.json` | 생성된 OpenAPI | 현재 `paths`에는 `/health`, `/health/ready`만 포함 |
| `/docs/oauth2-redirect` | Swagger UI 보조 리다이렉트 | 경로 존재가 로그인/OAuth 구현을 의미하지 않음 |

[FastAPI 조립 코드](backend/app/main.py)가 실제 명세를 생성합니다. 별도의 수동 OpenAPI JSON을 만들어 미구현 경로를 노출하지 않습니다. 현재 앱에는 위 문서 경로의 환경별 비활성화나 인증 보호 설정이 없습니다. 운영 노출 정책은 배포 시 확정합니다.

## 4. 설정·CORS·클라이언트 책임

| 설정 | 위치 | 기본값 / 의미 |
|---|---|---|
| `SERVER_HOST` / `SERVER_PORT` | 백엔드 | `127.0.0.1` / `8000`; `server.py`의 Uvicorn 바인딩 |
| `APP_ENV` | 백엔드 | `development`; `production`에서는 `server.py --reload` 거부 |
| `APP_CONFIG_FILE` | 백엔드 프로세스 환경 | 미지정 시 `backend/.env`; 상대 경로는 backend 기준. 명시한 파일이 없으면 실패 |
| `CORS_ORIGINS` | 백엔드 | JSON 배열 `[]`; 현재 허용 메서드 GET, credentials=false, 요청 헤더 `*` |
| `DB_ENABLED` | 백엔드 | `false`; true이면 DB 필수 설정 검사 및 lifespan에서 풀 구성 |
| `DB_HOST/PORT/NAME/USER/PASSWORD`, `DB_SSL_CA` | 백엔드 | [비밀값 없는 설정 예시](backend/.env.example). MySQL 접속 전용 |
| `VITE_API_BASE_URL` | 웹 빌드/개발 환경 | `/api`; 브라우저에 공개되는 값 |
| `API_PROXY_TARGET` | 웹 개발 환경 | `http://127.0.0.1:8000`; 개발 프록시에만 사용 |

백엔드 설정 우선순위는 프로세스 환경변수 → 설정 파일 → 기본값입니다. 웹 Vite 설정 변경 후에는 개발 서버를 재시작하고, 운영의 `VITE_*` 변경은 다시 빌드해야 합니다.

현재 개발 프록시를 이용하면 브라우저는 동일 출처로 요청합니다. 브라우저가 다른 출처의 백엔드를 직접 호출할 경우 실제 origin을 `CORS_ORIGINS`에 등록해야 합니다. 예: `["http://127.0.0.1:5173","http://localhost:5173"]`. 두 origin은 다릅니다. CORS는 서버 인증/인가를 대신하지 않으며 네이티브 앱의 권한 체계도 아닙니다.

DB 암호·수집용 키·CLI 인증값은 서버에만 둡니다. 프론트 `VITE_*`, 모바일 번들, 이 관리대장에는 비밀정보를 넣지 않습니다. 현재 사용자 인증·세션·기기 간 동기화는 구현되어 있지 않습니다.

## 5. 외부 수집 API와 내부 기능의 경계

이 표의 URL은 **백엔드가 호출하는 외부 공급자 주소**입니다. 우리 서버가 제공하는 엔드포인트가 아니며 웹·모바일에서 직접 연결하지 않습니다. 현재 코드·기존 조사 기록을 정리한 것이고 이번 문서 점검에서 외부 API를 재호출하지 않았습니다.

| 공급자 / 내부 기능 | 실제 코드의 호출 범위 | 인증·연결 / 참고 |
|---|---|---|
| Gov24 | `https://api.odcloud.kr/api/gov24/v3/serviceList`, 첫 페이지 목록 | 서버의 `DATA_GO_KR_API_KEY`; [수집기](backend/app/modules/collectors/gov24_services.py) |
| 복지로 | `https://apis.data.go.kr/B554287/NationalWelfareInformationsV001` 아래 `/NationalWelfarelistV001`, `/NationalWelfaredetailedV001` | 서버의 `BokjiRO_API_KEY`; [수집기](backend/app/modules/collectors/bokjiro_services.py) |
| 일반 공고·광운대 공지 | 전달받은 공고 URL·`https://www.kw.ac.kr/ko/life/notice.jsp` | 내부 Python 수집 함수. 업로드/수집 HTTP API 없음 |
| 원문 파싱 | `backend/scripts/parse-raw.ps1` | 내부 CLI. 원문 → 조건 후보·검증 → 로컬 JSON 초안. HTTP 분석 API 없음 |
| MySQL | 서버 내부 연결 | health readiness 외 정책 저장·조회 HTTP/저장소 미구현 |

Gov24 상세·조건 경로의 기존 조사 이력은 [API 데이터 분석](backend/docs/api-data-analysis.md)에 있으나 현재 전용 수집 함수는 목록에 한정됩니다. 외부 API 초안과 실제 필드 차이는 [Gov24 참고](backend/docs/api/gov24_services_api.md), [복지로 참고](backend/docs/api/bokjiro_services_api.md)를 확인합니다.

## 6. 미구현 API 관리

| 기능 | 현재 상태 | 다음 계약에서 정할 사항 |
|---|---|---|
| 정책 목록·상세·검색 | 웹 예시만 있음. 서버 경로 미정 | ID, 공개 승인 상태, 필터·정렬·페이지, 응답 모델·원문 URL |
| 조건·자격 판정 | 미구현 | 입력 fact, 기준 시점, PASS/FAIL/UNKNOWN 의미와 근거 |
| 원문 업로드·분석 | CLI만 있음. HTTP 경로 미정 | 입력 제한, 작업 ID·상태, 오류·재시도·결과 접근 권한 |
| 로그인·프로필·관심 혜택 | 서버 미구현. 웹 설정은 localStorage | 인증·인가, 개인정보 범위, 동기화·삭제 |
| 알림·푸시 | 미구현 | 동의, Android/iOS 권한·토큰, 발송·해제 계약 |

계획용 URL을 구현된 경로로 기록하지 않습니다. 정책 DB 적재와 공개 승인도 별도 후속 작업이며, 파일 초안 `draft`/`matching_enabled=false`를 공개 정책 응답으로 사용하지 않습니다.

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
