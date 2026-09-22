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

- origin/main `e59c3e9`의 팀원 커밋 5개 반영, 로컬 개발환경 `e4b713c` 보존. 병합 커밋 `7871602` 생성, 기존 이력 유지.
- `.env.example`·API 문서·작업 기록 충돌 해결, 양쪽 내용 보존. Gov24 외부 API 명세를 `api/gov24.md`로 이동.
- Gov24 인증키와 공통 설정 로더 연결. 기본 검증에 모듈 테스트 포함, Windows 사용법·구현 상태·폴더 트리 갱신.
- pytest 23개·Ruff·pip check 통과. 기존 라이브러리 deprecation 경고 2건 잔존.
- MySQL 8.0.44 별도 테스트 스키마에서 팀 SQL 세 파일 검증, 빈 상태 복원. 개발 업무 테이블 자동 생성 제외.
- 실제 서버 health/readiness/docs/openapi HTTP 200 확인, 점검용 API 종료. 이번 통합의 외부 Gov24 API 호출 미실시.
- 사용자 요청에 따라 통합 문서·이번 작업 기록을 간결한 문체로 수정. 푸시 승인 확인.
- 상세 범위와 한계: [Git 통합 검토](git-sync.md).

## 2026-09-21 — 푸시 전 복지로 신규 변경 통합

- 원격 직접 조회에서 `bonggyu`의 `14c9507` 신규 커밋 발견, 추가 통합.
- 복지로 목록·상세 수집기와 XML/JSON 처리·테스트·API 문서 반영.
- 설정 예시·수집기 사용법·API 문서·루트 트리 충돌 4개 해결. Windows 실행환경 유지.
- `BokjiRO_API_KEY` 공통 설정 로더 연결, `.env` 자동 로드 회귀 테스트 추가.
- Gov24 원천 명세 파일명 통합, 복지로 명세 초안과 구현 간 요청 인수 차이 명시.
- 실제 외부 API 호출 미실시. 기존 로컬 `.env`·DB 자격 정보 보존.
- 최종 pytest 28개·Ruff·pip check 통과. 기존 deprecation 경고 2건 잔존.

## 2026-09-21 — 복지로·행안부 실제 데이터 조사

- 입력된 키로 두 API 인증 성공 확인. 키 앞뒤 공백·줄바꿈은 기존 요청기와 동일하게 제거 후 사용.
- Gov24 목록·상세·지원조건 각 5건, 복지로 목록 5건·상세 1건 정상 조회. 응답 총건수 각각 10,931·461 확인.
- Gov24 한글 JSON 필드·JA 조건 코드, 복지로 XML 반복 구조 확인. 원본·분석 결과는 Git 제외 데이터 폴더에 저장.
- 기존 복지로 파서의 신청 단계·연락처·서식·법령 손실 재현. Gov24 복합 조건의 단일 유형 분류·신청기간 구분 한계 확인.
- [실제 응답·가공 계획](api-data-analysis.md) 작성. 원문 보존·공급자별 매핑·조건 후보·검증·MySQL 저장 순서 정리.
- 업무 코드·DB 변경 없음. 전체 수집·첨부 다운로드·LLM 호출·개인별 자격 판정 미실시.

## 2026-09-21 — 코드·Codex CLI 분류 실증

- 실제 공개 응답 표본 6개로 기본정보 코드 매핑·다중 태그 힌트·코드/LLM 라우팅 실증.
- 원문 항목 17개 중 코드 2개(상시신청·미기재), LLM 해석 대상 15개 분류. 사업별 if문 분기 없음.
- 기존 모델 설정 `gpt-6-astra`를 사용한 Codex CLI 실제 호출 완료. 읽기 전용·도구 비활성·공개 원문만 전달.
- 조건 후보 60개 추출, 스키마·근거 일치 검증 통과. 사전 선정한 의미 구분 8개 일치. 전체 정확도로 일반화 금지.
- 정책 6개 모두 부분 분석. 개수 제한·조건 누락·자유 텍스트 값·불완전 논리 구조를 운영화 후속 항목으로 기록.
- 전체 테스트 40개·Ruff·pip check 통과. 실증 결과·프롬프트·CLI 이벤트는 Git 제외 경로에 저장.
- [실증 보고서](classification-experiment.md) 작성. 서버 자동 분석·MySQL 저장·개인별 자격 판정과 구분.

## 2026-09-21 — 실제 데이터 스키마 적용 샘플

- 수집 정책 6개·기존 조건 후보 60개를 제안 구조로 변환. 지역 미기재 6개·조건부 연령 면제 1개 추가, 67개 행 정렬.
- 상태 코드와 실제 값 분리. 값 있음 55개·정보 없음 11개·조건부 제한 없음 1개 확인.
- 숫자·날짜·소득 주체·단위 분리. 복합 텍스트·원문 인용·그룹 범위 유지. 공식 지역 코드 임의 생성 없음.
- JSON·CSV·전체 정렬표 생성, Git 제외 확인. [설계 설명·재현](schema-sample.md) 추가.
- 입력 해시·근거 인용·ID·그룹 참조·상태/값 검증 통과. 관련 테스트 12개·Ruff 통과.
- 실제 DB·SQL 변경 없음. 부분 분석·논리 연결 미완료로 자동 판정 비활성 유지.

## 2026-09-22 — 원격 최신 변경 통합

- 원격 main `fa25a6a` 확인·로컬 반영. 팀원 PR #2의 광운대 수집·집계·출력 기능 분리 유지.
- 로컬 미커밋 분석·실험·스키마 샘플 작업 복원. README 트리 충돌 해결, 양쪽 파일 반영.
- 전체 테스트 47개·Ruff·pip check 통과. 기존 deprecation 경고 2건 유지.
- 실제 인증키 대조 통과. `.env`·DB·수집 원본·생성 샘플 Git 제외 유지.
- Git 이력·커밋 대상 129개 파일 Gitleaks 검사 통과. 인증정보 탐지 0건 확인.

## 2026-09-22 — Rawdata 파싱과 소형 모델 설정

- Gov24 JSON·복지로 XML/JSON·RawDocument 입력 → 공통 원문 → CLI 추출 → 검증 → 초안 저장 구현.
- 복지로 XML 반복·중첩 목록 손실 해결. 정책별 하드코딩 없이 자료형·원문 근거·상태/값·그룹 참조 검증.
- `.env` 모델·reasoning·제한시간 설정 추가. 기본 Luna medium, 검증 실패 시 Terra 한 번 재시도. 실제 API 키·DB 설정 보존.
- 원문 6개 준비 모드 확인. 개선된 스키마로 실제 2개 정책에서 Luna 단독 52개 조건 추출·구조/근거 검증 통과.
- 초기 출력 자료형 오류와 CLI 기능 경고 오인 처리 해결. 실제 호출 수치·남은 단위/의미 검토는 [사용법](raw-parsing.md)에 기록.
- 테스트 71개·Ruff·의존성 검사 통과. 모델을 호출하지 않는 테스트로 재시도·시간 초과·도구 사용 차단 검증.
- MySQL 적재·사용자 판정·HTTP 분석 API는 후속 범위. 모든 결과 draft·자동 판정 비활성 유지.
- 별도 브랜치 `codex/raw-data-parser` 분리. 원격 main 기준 일치 확인, 전체 테스트 71개·Ruff·pip check 재검증 통과.
