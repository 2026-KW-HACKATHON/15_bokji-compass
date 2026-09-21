# 작업 기록

## 2026-09-17 — MySQL 기반 백엔드 구현 전 계획

- 사용자 지정 DB를 MySQL로 반영하고 [구현 계획](implementation-plan.md)을 작성했다.
- 저장소의 빈 백엔드 구조, 적용 지침 유무, 개발 도구 버전과 Codex CLI 옵션을 점검했다.
- 의존성·설치 순서, 저장·검색·판정 구조, 마이그레이션, 테스트와 지속 관리 TODO를 정리했다.
- 구현·설치·DB 변경·실제 LLM 호출·기능 테스트는 수행하지 않았다. 소스와 설정 파일은 빈 상태를 유지한다.

## 2026-09-17 — Windows 직접 운영 기준으로 계획 수정

- 사용자의 Windows 운영 지정을 반영했다. 이전 Ubuntu·가상화 기반 계획은 폐기하고 Windows 직접 설치로 통일했다.
- MySQL x64 MSI/Configurator, Visual C++ 런타임, Python/uv, WinSW 서비스 등록과 자동 복구를 설치 계획에 반영했다.
- PowerShell 실행 예시, Windows Codex 실행 파일·계정 격리, 자식 프로세스 종료, NTFS·UTF-8·재부팅 검증을 추가했다.
- 문서만 변경했다. 패키지 설치·서비스 등록·DB 변경·기능 테스트는 수행하지 않았다.

## 2026-09-18 — Windows 개발환경 구성

- Python 3.13.5 프로젝트 가상환경과 uv 0.12.16을 준비했다. `requirements.in`/`requirements-dev.in` 및 실제 도구가 생성한 전체 버전·해시 고정 `.txt`를 추가했다. 기존 전역 Python은 변경하지 않았다.
- `server.py`, `app.main:app`, 환경설정·MySQL 풀, `/health`·`/health/ready`·Swagger를 구현했다. 준비 상태는 실제 DB 연결 실패나 미설정에 503을 반환한다.
- 팀원용 설치·시작·테스트·의존성 갱신 PowerShell 스크립트와 상세 사용법을 작성했다. 설치 재실행은 기존 `.env`를 보존한다.
- 사용자의 요청에 따라 기존 MySQL 실행 파일 8.0.44만 재사용하고, `data/mysql-dev/`·포트 3307에서 독립 인스턴스를 생성했다. `bokji_compass_dev`와 `bokji_compass_test`, 개발/테스트 계정을 분리했다. 기존 `MYSQL80`·`MySQL_80` 서비스는 중지 상태를 유지하며 기존 설정·데이터는 수정하지 않았다.
- 프로젝트 DB 비밀번호는 임의 생성하여 Git 제외 경로에만 기록하고 출력하지 않았다. DB 구성 재실행과 종료·재시작 후 자격 정보 유지 및 readiness를 확인했다.
- `scripts/test.ps1`: 10개 테스트 통과, Ruff 통과, `pip check` 충돌 없음. 테스트 임시 파일은 시스템 공용 임시 폴더 대신 프로젝트 캐시 아래에 분리했다. 상위 라이브러리의 TestClient/httpx 및 AnyIO 관련 deprecation 경고 2건은 남아 있다.
- 실제 `server.py`를 저장소 루트 작업 디렉터리에서 실행해 `/health`, `/health/ready`, `/docs`, `/openapi.json`의 HTTP 200을 확인했다. 점검용 API 프로세스는 종료했고 개발 DB는 실행 상태로 남겼다.
- CPU·RAM 등 하드웨어 권장 내용은 계획서와 관련 안내에서 삭제했다. 루트 트리와 현재 구현 상태를 갱신했다.
- 미구현: 정책 정제·조건 판정·정책 저장 테이블, Alembic 실제 마이그레이션, LLM 어댑터, CI 연결, 운영 Windows 서비스·HTTPS. MySQL 8.4 실제 연결은 아직 검증하지 않았다.
