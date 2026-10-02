# 서버 관리자 콘솔

담당: 백엔드 서버 관리. 백엔드 `/`에서 로그인 화면을 제공하고 기존 인증 저장소의
`superadmin` 계정을 인증합니다. `static/`은 백엔드가 제공하는 독립 콘솔이며 일반 프론트
배포와 분리합니다. 전용 HttpOnly 쿠키를 사용하고 매 상태·설정 요청에서 세션·등급을 확인합니다.
일반 회원·QR 관리자에게 접근을 허용하지 않습니다.

## 공개 함수

`public.py`는 앱 상태를 받으며 HTTP 인증은 `app/api/server_admin.py`에서 먼저 수행합니다.
`state`에는 `settings`, `server_config_path`, `server_config_lock`, `database_engine`,
`server_started_at`이 있어야 합니다.

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
HTTP 서버 주소·포트·인증·CORS·실행파일·설정 파일 경로·SQL·프로세스 제어는 허용하지 않습니다.

파일의 기존 항목·주석을 보존하고 수정한 중복 키만 정리합니다. 타입·범위·전체 Settings
계약을 검증한 뒤 파일 SHA 버전을 비교합니다. Windows/POSIX 파일 잠금, 같은 디렉터리의
임시 파일 fsync와 원자적 교체를 사용합니다. 파일 경로는 서버가 결정하며 브라우저 입력으로
받지 않습니다. 새 값의 줄바꿈·제어 문자·dotenv 보간 문법과 허용되지 않은 도메인은 거절합니다.

## HTTP와 실행

페이지 `GET /`, 정적 `GET /server-admin-assets/console.css`·`console.js`를 제공합니다.
`/v1/server-admin` 아래 login/logout/session/overview/settings와 collection 조회가 있습니다.
설정/상태는 최고 관리자 전용이며 POST/PATCH는 같은 출처와 `X-Auth-Request: 1`을 요구합니다.
64KB 본문 상한·안전한 검증 오류·no-store·CSP를 적용합니다. 쿠키는 `bokji_server_admin`,
HttpOnly·SameSite=Strict·최대 7일이며 production은 Secure입니다.

[접속·계정 생성·설정 적용](../../../docs/server-admin.md),
[HTTP 관리대장](../../../../api-management.md), [수집·스케줄 안내](../../../docs/server-ingestion.md).
상태 새로고침·설정 저장은 수집·모델·검색·Windows 작업을 실행하지 않습니다.

## 검증

backend에서 다음 명령을 실행합니다.

```powershell
python -m pytest -p no:cacheprovider tests/test_server_admin.py tests/test_server_settings.py
```

임시 인증 SQLite·합성 설정 파일·DB 대역으로
최고/QR/일반/비로그인·세션 만료/권한 회수, 출처 검사, 비밀 비노출, 입력·버전 충돌·동시 저장,
원자적 저장 실패 복구·DB 적용 대기를 확인합니다. 실제 `.env`, 계정 생성, MySQL, 공급자,
모델·검색·스케줄은 자동 실행하지 않습니다.
