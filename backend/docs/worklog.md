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

## 2026-09-18 — MySQL 개발용 SQL 초안

- backend/database/에 001_schema.sql, 002_seed.sql, 003_queries.sql, readme.md 추가.
- 지역·사용자·선택 프로필·정책·조건 원문 테이블과 가상 데이터 작성.
- 루트 README에 진입점과 Node.js/Python 계획 차이 명시. 기존 Python 코드는 유지.
- 생성 파일 재읽기, 테이블·외래키 참조 및 시드/조회 대응 확인. MySQL 문법은 공식 문서 참고.
- PowerShell 실행 환경 오류로 CLI 검사·MySQL 실행·git diff를 수행하지 못함. DB 설치 여부 미확인. DB 및 기능 테스트 통과를 의미하지 않음.
- Node.js 연결, 인증·인가, 조건 정규화·자동 매칭 및 운영 마이그레이션은 후속 작업.

## 2026-09-19 — 공고문 원문 수집·저장 기능

- `RawDocument` 계약과 파일 기반 `storage` 공개 API를 추가했다.
- `collect_notice_text`가 제목·원문·출처 URL을 검증하고 URL 기반 식별자로 UTF-8 JSON에 저장하도록 구현했다.
- 기본 저장 위치는 Git에서 제외된 `backend/data/raw_documents/`이며, 사용자 조건 해석·자격 판정·정책 승인은 포함하지 않았다.
- collector 테스트에서 원문 보존, 파일 생성·조회, 필수 입력 오류를 검증했다. `python -m pytest app/modules/collectors/tests` 결과 4 passed.
- 실제 공공기관별 HTTP 수집 어댑터, HTML/PDF 파싱, 사용자 프로필 매칭은 후속 작업이다.
- `collect_notice_from_url`로 단순 HTML 공고의 HTTP 수집·본문 추출까지 지원하고, PDF·로그인·자바스크립트 페이지는 후속 작업으로 남겼다.

## 2026-09-20 — Gov24 공공서비스 API 연동·정책 정규화

- 공공데이터포털 공통 요청기 `app/modules/collectors/data_go_kr.py`를 추가하고, `.env`의 `DATA_GO_KR_API_KEY`를 사용하도록 구성했다. 실제 키는 Git에서 제외하고 `.env.example`에는 빈 변수명만 기록했다.
- 행정안전부 대한민국 공공서비스(혜택) API 명세를 `backend/docs/api/readme.md`에 기록했다.
- `app/modules/collectors/gov24_services.py`에 Gov24 `serviceList` 조회 기능을 추가했다. 첫 페이지에서 기본 10건을 JSON으로 가져오고 서비스 ID·서비스명을 출력할 수 있다.
- 실제 API를 호출해 `친환경 에너지절감장비 보급`을 포함한 공공서비스 목록 10건을 확인하고, `serviceDetail` 및 `supportConditions` 응답 구조를 점검했다.
- `app/modules/normalization/policy.py`에 Gov24 응답을 `policies`와 `policy_requirements` 저장 행으로 변환하는 로직을 추가했다.
	- `서비스명`, `소관기관명`, 원문 JSON, 검토 상태, 실제 데이터 여부를 정책 행으로 변환한다.
	- `지원대상`, `선정기준`을 조건 원문으로 보존한다.
	- 실제 API 데이터는 `is_synthetic = FALSE`, 초기 검토 상태는 `draft`로 기록한다.
- 최상위 `readme.md`의 폴더 트리에 Gov24 collector, API 명세, normalization 파일과 `backend/database`의 스키마·시드·조회 SQL을 반영했다.
- 후속 작업: `storage` 계층에서 정규화 결과를 `policies`와 `policy_requirements`에 트랜잭션으로 저장하고, 정책 상세·지원조건 코드의 의미를 데이터 계약으로 확정한다.

## 2026-09-21 — 팀원 Git 변경과 Windows 개발환경 통합

- origin/main `e59c3e9`의 팀원 커밋 5개를 가져오고 로컬 개발환경을 `e4b713c`로 먼저 보존했다. 기존 커밋 이력을 유지하는 merge로 통합한다.
- 충돌한 `.env.example`·API 문서·작업 기록을 보존하여 통합했다. Gov24 외부 API 명세는 `api/gov24.md`로 이동했다.
- Gov24 인증키를 공통 설정 로더에 연결했다. 모듈 테스트를 기본 검증에 포함하고 Windows 사용법·현재 구현 상태·폴더 트리를 갱신했다.
- pytest 23개, Ruff, pip check 통과. 기존 라이브러리 deprecation 경고 2건은 남아 있다.
- MySQL 8.0.44 별도 테스트 스키마에서 팀 SQL 세 파일의 스키마·합성 시드·조회를 확인하고 빈 상태로 복원했다. 개발 업무 테이블은 자동 생성하지 않았다.
- 실제 서버 health/readiness/docs/openapi가 모두 200이다. 점검용 API는 종료했다. 이번 통합에서 외부 Gov24 API는 호출하지 않았다.
- 푸시는 사용자 승인 후 수행한다. 상세 범위와 한계는 [Git 통합 검토](git-sync.md)를 따른다.
