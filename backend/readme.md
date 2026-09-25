# 복지나침반 백엔드

엔드포인트·응답·설정·웹/모바일 연동의 공통 기준은 루트 [API 관리대장](../api-management.md)입니다. [전체 문서 점검](docs/documentation-audit.md)에서 갱신 범위를 확인할 수 있습니다.

Windows에서 직접 실행하는 Python 3.13 + FastAPI 서버입니다. 서버 진입점·설정·MySQL 연결 점검을 구현했으며, 공고 원문 수집·파일 저장, Gov24 조회와 정책/조건 원문 행 변환, MySQL SQL 초안도 포함합니다. 정규화 결과의 MySQL 저장과 자격 판정·추천은 후속 구현 대상입니다.

**DB 접속 설정은 구현, 파싱 결과의 DB 저장은 미구현입니다.** 현재 `parse-raw.ps1`의 결과는 `data/parsed_policies/`에 파일 초안으로 저장됩니다. [현재 구현 상태·DB 연결 범위](docs/implementation-status.md)를 기준으로 확인하세요.

## 처음 시작하기

macOS 팀원은 [Mac 개발환경 안내](docs/macos-development.md)에 따라 `bash backend/scripts/setup.sh`, `bash backend/scripts/start.sh --reload` 사용. Codex CLI 파싱도 지원하며 운영 서버의 Windows 구성은 유지. 아래 명령은 Windows용.

저장소 루트의 PowerShell에서 실행합니다. 최초 준비에는 Python 3.10 이상과 인터넷 연결이 필요합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/setup-mysql.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/start.ps1 -Reload
```

설치 스크립트가 프로젝트 내부에 uv와 Python 3.13 가상환경을 준비하고 `requirements-dev.txt`의 고정된 의존성을 설치합니다. 이미 있는 `.env`는 보존합니다. 전역 Python과 다른 프로젝트 패키지는 변경하지 않습니다.

MySQL 실행 파일이 있어야 두 번째 명령을 실행할 수 있습니다. 실행 파일만 재사용하여 **새 데이터 폴더·포트 3307·개발/테스트 DB·계정**을 만듭니다. 기존 서비스와 데이터는 변경하지 않습니다. 경로는 `-MySqlExecutable 'C:\설치경로\bin\mysqld.exe'`, 초기 포트는 `-Port 3308`처럼 지정할 수 있습니다.

DB 없이 API 개발만 시작한다면 두 번째 명령은 생략 가능합니다. DB 미설정 상태를 정상 DB 연결로 보고하지 않습니다.

| 주소 | 의미 |
| --- | --- |
| `http://127.0.0.1:8000/docs` | Swagger API 문서 |
| `http://127.0.0.1:8000/health` | 서버 실행 확인, 200 |
| `http://127.0.0.1:8000/health/ready` | MySQL 연결 시 200, 미설정·실패 시 503 |

`Ctrl+C`로 API를 종료합니다. DB는 별도 프로세스이며 재부팅 후 아래 `start` 명령으로 다시 시작합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/mysql.ps1 start
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/mysql.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/mysql.ps1 stop
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test.ps1
```

## 서버와 의존성 진입점

- ASGI: `app.main:app`. 앱 생성: `app.main.create_app(settings=None) -> FastAPI`.
- 서버: `server.py` 또는 `scripts/start.ps1`. `.env`의 `SERVER_HOST`, `SERVER_PORT` 사용.
- 직접 설치: Python 3.13 가상환경에서 `python -m pip install --require-hashes -r requirements.txt`.
- 테스트 포함 설치: `python -m pip install --require-hashes -r requirements-dev.txt`.
- `.in`은 직접 의존성 원본, `.txt`는 도구가 생성한 전체 버전·해시 고정 결과입니다.
- 의존성 변경: `.in` 수정 → `scripts/lock.ps1` → `scripts/setup.ps1` → `scripts/test.ps1`. `.in`과 `.txt`를 함께 공유합니다.
- `pyproject.toml`은 pytest·Ruff 설정입니다. 별도 `uv.lock`은 사용하지 않습니다.

자세한 환경변수·DB·오류 대응은 [개발환경 사용법](docs/development.md), 후속 업무 구현은 [구현 계획](docs/implementation-plan.md)을 참고합니다.

## 원문 파싱

프로젝트 루트에서 `backend/scripts/parse-raw.ps1 -InputPath 'data/raw_documents/파일.json'` 실행. 코드 우선 분류 후 미해결 조건이 있는 정책은 전체 원문을 `.env`의 `CODEX_MODEL`로 CLI 분석. 기본 Luna, 검증 실패 시 설정된 Terra로 한 번 재시도. 표준 조건 v2·공식 지역코드 정규화와 초안 저장 포함. [입력 형식·모델 설정](docs/raw-parsing.md), [코드·조건·지역 사용법](docs/condition-classification.md).
