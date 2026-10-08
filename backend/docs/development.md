# 개발환경 사용법

운영 서버는 Windows 유지. macOS 팀원은 [macOS 설치·Codex CLI·실행 안내](macos-development.md)를 사용. 아래 PowerShell·독립 MySQL 구성 절차는 Windows용.

## 설치

서버 실행·의존성 재현·환경설정·개발 DB 구성의 사용법입니다. 원문 파싱은 별도 CLI로 제공하며 [현재 구현 상태·DB 연결 범위](implementation-status.md)를 먼저 확인합니다. Python 3.10 이상과 인터넷 연결로 설치를 시작합니다. 저장소 루트에서:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/setup.ps1
```

Python이 PATH에 없다면 `-PythonExecutable 'C:\Python경로\python.exe'`를 덧붙입니다. 스크립트는 `.bootstrap`에 고정 버전 uv를 설치하고 Python 3.13을 찾아 `.venv`를 만듭니다. 필요한 Python이 없으면 uv가 Astral 배포판을 `.python`에 내려받습니다. 전역 환경을 덮어쓰지 않습니다. [uv Python 관리](https://docs.astral.sh/uv/guides/install-python/)

기본은 테스트 도구 포함 설치이며 `-RuntimeOnly`로 실행 패키지만 설치할 수 있습니다. 기존 `.venv`가 3.13이 아니면 자동 삭제하지 않고 중단합니다. 네트워크·인증서 오류는 실제 실패로 보고하며 해결 후 같은 명령으로 재시도합니다. `-ExecutionPolicy Bypass`는 현재 PowerShell 프로세스에만 적용합니다.

Python 3.13이 준비된 경우 backend 폴더에서 수동 설치도 가능합니다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --require-hashes -r requirements-dev.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe server.py --reload
```

## 다른 프로젝트와 분리된 MySQL

저장소 루트에서 `powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/setup-mysql.ps1`을 실행합니다. 설치된 MySQL 8.4 또는 8.0의 `mysqld.exe`를 찾고, 없으면 `-MySqlExecutable`로 지정하도록 안내합니다. MySQL 바이너리가 전혀 없다면 먼저 [공식 Windows 배포판](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html)을 설치합니다. 다른 프로젝트의 관리자 비밀번호는 필요하지 않습니다.

이번 PC에서는 Python 3.13.5와 MySQL 8.0.44 실행 파일을 확인했습니다. 실행 파일만 재사용하며 기존 서비스 두 개와 기존 데이터는 수정하지 않습니다. 신규 설치 기준은 8.4 LTS이고 실제 검증한 버전은 작업 기록에 남깁니다. [Windows 다중 인스턴스](https://dev.mysql.com/doc/refman/8.0/en/multiple-windows-servers.html)

| 항목 | 내용 |
| --- | --- |
| 접속 | `127.0.0.1:3307`. 처음 구성할 때 `-Port`로 변경 가능. |
| 데이터·설정 | `backend/data/mysql-dev/data/`, `my.ini` |
| 개발 DB·계정 | `bokji_compass_dev` / `bokji_dev` |
| 테스트 DB·계정 | `bokji_compass_test` / `bokji_test` |
| 비밀 설정 | `backend/.env`, `backend/data/mysql-dev/credentials.json` — Git 제외 |
| 로그 | `data/mysql-dev/initialize.log`, `server.log`, `process.log` |

개발·테스트 계정은 각자 해당 스키마에만 권한을 갖습니다. 별도 로컬 관리 계정은 종료에 사용합니다. 생성된 비밀번호는 출력하지 않으며 설정·데이터 디렉터리를 공유하지 않습니다. 설치 스크립트는 업무 테이블을 자동 생성하지 않습니다. 빈 개발 스키마에 팀 SQL 초안을 적용하는 방법은 [DB 사용법](../database/readme.md)을 따릅니다.

개발 DB는 숨김 백그라운드 프로세스입니다. **Windows 서비스가 아니므로 재부팅 후 `scripts/mysql.ps1 start`로 다시 시작합니다.** API 실행은 DB를 자동 시작하지 않습니다. `mysql.ps1 status`로 확인하고 `mysql.ps1 stop`으로 정상 종료합니다. 종료 전에 실제 `@@datadir`가 프로젝트 경로인지 확인합니다.

재실행은 프로젝트 DB·암호를 재사용합니다. 다른 프로세스가 포트를 사용하거나 기존 데이터의 소유 정보를 확인할 수 없으면 중단합니다. 초기화 실패 시 데이터를 보존합니다. 실행 중인 구성 작업이 없는데 `operation.lock`만 남아 있다면 로그를 확인한 뒤 잠금 파일만 정리합니다. 데이터 폴더를 임의 삭제하거나 재초기화하지 않습니다.

팀 공용 DB를 쓸 때는 전용 DB 구성 스크립트 대신 `.env`를 편집합니다. 이미 활성화된 설정이 다른 DB를 가리키면 스크립트가 덮어쓰지 않습니다. 생성 이후 포트 변경·DB 업그레이드는 자동으로 수행하지 않습니다. 프로젝트 폴더를 이동하면 가상환경과 DB 절대 경로를 함께 점검합니다.

## 설정과 진입점

설정 우선순위는 프로세스 환경변수 → 설정 파일 → 기본값입니다. 기본 파일은 작업 디렉터리와 무관한 `backend/.env`입니다. `APP_CONFIG_FILE`로 별도 파일을 지정할 수 있으며 상대 경로는 backend 기준입니다. 명시한 파일이 없으면 실패합니다.

| 설정 | 용도 |
| --- | --- |
| `APP_ENV` | development / test / production |
| `SERVER_HOST`, `SERVER_PORT` | `server.py` 바인딩 주소·포트 |
| `CORS_ORIGINS` | JSON 배열, 예: `["http://localhost:5173"]`. 기본 빈 배열. |
| `DB_ENABLED` | true이면 MySQL readiness 점검. 필수 설정 누락 시 시작 오류. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL 연결 |
| `DATA_GO_KR_API_KEY` | Gov24 수집용 인증키. 직접 수집 함수를 호출할 때 필요. |
| `BokjiRO_API_KEY` | 복지로 수집용 인증키. 직접 수집 함수를 호출할 때 필요. |
| `DB_SSL_CA` | 원격 DB의 CA 파일 경로. 지정 시 호스트 인증서 검증. |
| `CODEX_EXECUTABLE`, `CODEX_MODEL`, `CODEX_REASONING_EFFORT` | 원문 파싱용 native CLI 경로·모델·추론 수준. 기본 Luna medium. |
| `CODEX_FALLBACK_MODEL`, `CODEX_TIMEOUT_SECONDS` | 검증 실패 시 1회 재시도 모델·호출별 제한시간. 기본 Terra·300초. |
| `PARSING_MAX_INPUT_CHARS` | 프롬프트를 포함한 정책별 입력 문자 상한. 기본 60,000. |
| `POLICY_TRANSLATION_ENABLED`, `POLICY_TRANSLATION_DAILY_CALLS` | 공개 공고 번역 활성화·UTC 일일 생성 시도 한도. 기본 true·100. 캐시 조회는 차감 없음. |
| `POLICY_TRANSLATION_MAX_INPUT_CHARS` | 공고 번역용 전체 표시 데이터 문자 한도. 기본 120,000, 절단 없음. [본문 번역·초기화](policy-translation.md). |

`app.main.create_app(settings=None) -> FastAPI`는 동기 앱 생성 함수이며 `app.main:app`이 ASGI 진입점입니다. import 시 외부 접속·DB 쓰기를 하지 않습니다. lifespan에서 풀을 만들고 종료 시 해제합니다. `server.py`는 Uvicorn을 Windows용 `asyncio`/`h11`로 실행하며 production 환경에서 `--reload`를 거부합니다.

서비스 등록 시에는 `.venv\Scripts\python.exe`와 `server.py`를 절대 경로로 지정할 수 있습니다. 직접 ASGI 실행 시 backend에서 `python -m uvicorn app.main:app --loop asyncio --http h11`을 사용하고 호스트·포트는 Uvicorn 옵션으로 명시합니다. 운영 서비스·HTTPS는 아직 구성하지 않았습니다.

## 검증과 의존성 관리

`/health`의 200은 서버 응답만 뜻합니다. `/health/ready`는 실제 `SELECT 1` 성공 시 200, 미설정·실패 시 503입니다. 업무 테이블 준비 검사는 아닙니다. `/docs`, `/redoc`, `/openapi.json`은 실제 코드에서 생성됩니다.

`scripts/test.ps1`은 실제 DB·AI 호출 없이 설정·CORS·오류 응답·비밀정보 비노출·풀 종료·다른 데이터 보호를 검증합니다. 팀원 모듈 테스트도 함께 실행하며 HTTP 요청은 대역으로 검증합니다. 실제 MySQL 확인은 별도로 `/health/ready`에서 수행하고 작업 기록에 남깁니다.

의존성은 `.in` 수정 → `scripts/lock.ps1` → `scripts/setup.ps1` → `scripts/test.ps1`로 갱신합니다. 두 `.txt`는 도구가 생성하며 개발 목록은 런타임 고정 버전을 제약으로 사용합니다. [requirements 생성](https://docs.astral.sh/uv/pip/compile/)

Gov24·복지로·공고 수집과 rawdata 파싱·Codex CLI 추출·검증·파일 초안 저장은 구현되어 있습니다. [파싱 사용법](raw-parsing.md)의 `parse-raw.ps1`로 실행하며 HTTP 서버와 별도입니다. DB 접속 설정이나 readiness 통과만으로 정책 저장은 활성화되지 않습니다. 신규 MySQL 스키마·저장소·Alembic 마이그레이션·사용자 판정·업무 API·운영 서비스는 후속 범위입니다.
