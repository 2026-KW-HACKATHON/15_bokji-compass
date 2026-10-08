# 서버 관리자 콘솔

2026-10-07: 서버 설정에 광운대학교 등록/장학 목록 자동 수집 여부를 추가했습니다.
수집 실행·자동 스케줄은 전용 목록/상세 어댑터를 사용합니다. 원문 전용 모드는 목록과
상세 대기 작업을 저장하고, 상세는 다음 일반 회차에서 처리합니다.
[동작·운영 확인](../../../docs/kwangwoon-auto-collection.md).

담당: 백엔드 서버 관리. 백엔드 `/`에서 로그인 화면을 제공하고 기존 인증 저장소의
`superadmin` 계정을 인증합니다. `static/`은 백엔드가 제공하는 독립 콘솔이며 일반 프론트
배포와 분리합니다. 전용 HttpOnly 쿠키를 사용하고 매 상태·설정 요청에서 세션·등급을 확인합니다.
일반 회원·QR 관리자에게 접근을 허용하지 않습니다.

## 공개 함수

`public.py`는 앱 상태를 받으며 HTTP 인증은 `app/api/server_admin.py`에서 먼저 수행합니다.
`state`에는 `settings`, `server_config_path`, `server_config_lock`, `database_engine`,
`server_started_at`이 있어야 합니다.
`operations.py`의 `Operations`는 앱별 백그라운드 작업을 관리하며 앱 상태의
`server_operations`에 보관합니다. 서버 종료 시 진행 중인 수동 작업을 기다립니다.

`runtime.py`의 `ControlInput`은 `target=backend/frontend/mysql/tunnel/all`, `action=start/stop/restart`만 받습니다.
`status()`는 고정 PowerShell 스크립트로 프로젝트 소유 프로세스를 조회합니다.
`start(state, data)`는 수집 상태와 파일 잠금을 확인해 `{operation}`을 접수하고 별도 숨김
프로세스로 명령을 처리합니다. `read_job(UUID)`는 허용된 작업 메타데이터만 반환합니다.
`latest_job()`는 최근 저장 결과를 조회하며 임의 파일·PID·명령을 받지 않습니다.
`refresh_pending(state)`는 완료된 백엔드 제어의 수집 시작 제한을 해제합니다.
수집 시작과 제어 접수는 같은 `server_config_lock` 아래 검사하므로 서로의 실행을 가로채지 않습니다.
작업과 제어 잠금은 `backend/data/server-control/`에 보관하며 API 재시작으로 지워지지 않습니다.
전체 제어는 프로젝트 MySQL까지 포함합니다. 운영 전체 중지는 터널 → 웹·QR → API → DB,
시작은 DB → API → 웹·QR → 터널 순서입니다. 개별 DB 제어는 현재 설정의 로컬 주소·포트가
프로젝트 인스턴스와 일치할 때만 허용합니다. 터널 개별 제어는 고정 도메인 운영 모드를 지원합니다.
`tunnel.ps1 status`는 소유 프로세스의 loopback `/ready` 응답으로 실제 연결 상태도 확인합니다.
DB 중지 후에는 관리자 인증도 중단되므로 서버 PC의 `start-server-prod.bat mysql start`로 복구합니다.
백엔드 관리 페이지의 **서비스 관리**는 10초마다 읽기 전용 상태를 갱신하며 제어 전 영향을 안내합니다.

| 호출 | 반환·효과 |
| --- | --- |
| `configuration_path() -> Path` | 기본 `backend/.env` 또는 `APP_CONFIG_FILE`. 상대 경로는 backend 기준 |
| `read_settings(state) -> dict` | 허용된 저장 설정·메타데이터·파일 버전·비밀 설정 여부·재시작 대기 항목. 프로세스 내 잠금 사용 |
| `update_settings(state, revision, changes) -> dict` | 유효성·버전 확인 후 파일 저장. DB 항목을 제외한 앱 설정 갱신. DB 엔진·인증 저장소 유지 |
| `get_overview(state) -> dict` | `server`, `database`, `collection`, `resources`, `configuration`. 로컬 조회와 DB SELECT만 수행 |
| `read_collection(state, kind, limit=20) -> dict` | `status`는 저장소 상태, `changes`·`candidates`는 `{items:[...]}`. HTTP limit은 1~100 |
| `collection_repository(state) -> IngestionRepository` | 현재 앱 DB 엔진에 연결된 저장소. DB 비활성은 RuntimeError |

설정용 내부 함수는 `settings.py`에 둡니다.

- `get_view(config_path, baseline)`은 `revision`(파일 bytes SHA256), `values`(비밀 제외),
  `secret_configured`(필드별 bool), `fields`(이름·환경변수명·한국어 label·group·kind·범위·선택값·
  재시작 여부), `env_overrides`, `restart_fields`를 반환합니다.
- `save_changes(config_path, baseline, revision, changes)`는 소문자 Settings 필드명을 받습니다.
  위 view에 `changed_fields`, `restart_required`(bool), `worker_reload_fields`를 추가합니다.
  비밀값도 입력은 문자열이며 빈 문자열은 명시적 삭제입니다. 반환값에 키·비밀번호를 넣지 않습니다.
- `configured_settings(config_path, baseline) -> Settings`는 내부 적용용 전체 검증 설정입니다.
  이 결과를 API로 직렬화하지 않습니다.
- `SettingsInputError`, `SettingsConflict`, `SettingsWriteError`의 `code`, `fields`에는 안전한
  코드·필드명만 포함합니다. HTTP는 각각 422, 409, 503의 일반 안내로 변환합니다.

## 설정과 적용 경계

허용 목록은 `EDITABLE_FIELDS`입니다. 수집 허용·회차/하루 예산·처리량·재시도·자원·검색,
모델·추론·timeout·최대 입력 글자 수, API 키, `policy_auto_publish`, DB 연결 설정을 포함합니다.
DB 필드는 `RESTART_FIELDS`로 분리해 저장만 하고 현재 API·인증 엔진에 적용하지 않습니다.
별도 CLI worker는 다음 실행 시 `.env`를 다시 읽으므로 저장한 DB 설정도 다음 worker에 적용됩니다.

수집/모델/API 키는 이후 작업부터 적용하고 진행 중인 worker를 종료하지 않습니다.
`ingestion_enabled=false`는 다음 수집 회차를 막습니다. 자동 공개 설정은 앞으로 저장할 개정에
적용하며 기존 공개 상태를 일괄 변경하지 않습니다. 환경변수로 지정한 필드는 읽기 전용입니다.
HTTP 서버 주소·포트·인증·CORS·실행파일·설정 파일 경로·SQL 입력은 허용하지 않습니다.
작업 API는 `check/tick/seed/analyze-all/schedule-enable/schedule-remove`만 허용하고 임의 명령이나
실행 파일을 받지 않습니다. `tick`은 기존 제한 worker와 DB lease를 사용합니다.

파일의 기존 항목·주석을 보존하고 수정한 중복 키만 정리합니다. 타입·범위·전체 Settings
계약을 검증한 뒤 파일 SHA 버전을 비교합니다. Windows/POSIX 파일 잠금, 같은 디렉터리의
임시 파일 fsync와 원자적 교체를 사용합니다. 파일 경로는 서버가 결정하며 브라우저 입력으로
받지 않습니다. 새 값의 줄바꿈·제어 문자·dotenv 보간 문법과 허용되지 않은 도메인은 거절합니다.

## HTTP와 실행

페이지 `GET /`, 정적 `GET /server-admin-assets/console.css`·`console.js`를 제공합니다.
`/v1/server-admin` 아래 login/logout/session/overview/settings와 collection 조회가 있습니다.
설정/상태는 최고 관리자 전용이며 POST/PATCH는 같은 출처와 `X-Auth-Request: 1`을 요구합니다.
`GET /operations`는 앱별 최근 작업과 시작용 프리셋을 조회합니다. `POST /operations`는
`RunInput`의 정수 범위와 저장 설정을 검증한 뒤 202로 백그라운드 작업을 접수합니다.
`analyze-all`의 `analysis_mode=standard/bulk`는 기본/최초 일괄 모드입니다. bulk는
16건·입력 100,000글자·요청 최소 900초의 실행 전용 설정이며 저장 설정을 변경하지 않습니다.
두 모드 모두 공공 API 없이 분석 대기열만 앱 예산 한도 없이 처리합니다. 별도 CLI 상태도
DB에서 읽으며 `POST /operations/{UUID}/stop`은 해당 분석 작업만 중지합니다.
진행 중인 앱 작업·DB 재시작 대기는 409이며 원문 모드는 모델/검색/대기 작업을 강제로 끕니다.
`GET /schedule`은 기존 Windows 작업의 상태만 조회합니다. 등록/해제는 고정 경로의 기존
`ingestion-schedule.ps1 -Json`을 인수 배열로 호출하며 셸 명령이나 사용자 경로를 받지 않습니다.
설정 불일치·600초 초과·기존 작업은 자동 등록을 거절합니다. 원문/CLI stderr/예외 원문은
작업 결과 API에 반환하지 않습니다. DB 초기화·실패 작업 재시도·후보 등록은 기존 CLI를 사용합니다.
일반 요청 64KB·공고 편집 PATCH 1MiB 본문 상한, 안전한 검증 오류·no-store·CSP를 적용합니다. 쿠키는 `bokji_server_admin`,
HttpOnly·SameSite=Strict·최대 7일이며 production은 Secure입니다.

[접속·계정 생성·설정 적용](../../../docs/server-admin.md),
[HTTP 관리대장](../../../../api-management.md), [수집·스케줄 안내](../../../docs/server-ingestion.md).
상태 새로고침·설정 저장은 수집·모델·검색·Windows 작업을 실행하지 않습니다.

서버 개요는 화면이 보이는 동안 5초 간격으로 조회하며 요청이 겹치지 않습니다. 가동 시간은
서버 응답과 브라우저의 단조 증가 시간을 기준으로 매초 표시합니다. 메뉴 전환·로그아웃·창
숨김 시 타이머를 해제하고 복귀 시 즉시 조회합니다. 연결 실패 시 마지막 상태를 표시하고
시계 증가를 멈춘 뒤 재시도하며 새 서버 응답으로 가동 시간을 다시 맞춥니다.

## 공고 DB 편집 (2026-10-07)

콘솔의 `공고 DB 편집` 메뉴에서 원문 수집 기록과 분석 개정을 검색하고 제목·기관·링크·분류,
표시 요약·지원 내용·대상·신청 안내와 모든 원문 필드를 수정합니다. 조건 JSON을 선택적으로
편집할 수 있으며 상태 코드와 근거 인용을 검증하고 표준 지역 코드를 재계산합니다.
상세 원문이 없는 목록 기록은 편집할 수 없습니다.

GET `/policies`, GET/PATCH `/policies/{policy_key}`는 최고 관리자 전용입니다.
PATCH는 현재 version, 수정 사유와 공개 여부를 요구합니다. 오래된 version은 409이며
화면의 입력을 보존합니다. 이전 원문을 보존하는 새 개정과 공개 상태를 함께 커밋합니다.
관리자 수정 이후 AI 결과는 초안으로 남아 수동 내용을 자동으로 덮어쓰지 않습니다.
수집·모델 호출 없이 저장하며 공개 목록·상세·캘린더가 같은 DB 개정을 조회합니다.

## 검증

backend에서 다음 명령을 실행합니다.

```powershell
python -m pytest -p no:cacheprovider tests/test_server_admin.py tests/test_server_settings.py
```

임시 인증 SQLite·합성 설정 파일·DB 대역으로
최고/QR/일반/비로그인·세션 만료/권한 회수, 출처 검사, 비밀 비노출, 입력·버전 충돌·동시 저장,
원자적 저장 실패 복구·DB 적용 대기를 확인합니다. 실제 `.env`, 계정 생성, MySQL, 공급자,
모델·검색·스케줄은 자동 실행하지 않습니다.
## 공고 분야 확장 (2026-10-07)

공고 편집의 `categories`는 농림축산·어업·사업·창업·기타를 포함한 9개 선택 값을
반환하며 `policies.js`가 이를 선택 항목으로 표시합니다. 편집·공개 검수 목록과 상세는
공개 카탈로그와 같은 재분류 규칙을 사용합니다. 수동 선택은 이후 자동 재분류보다
우선합니다. [기준·입력/반환·검증](../../../docs/policy-categories.md).
