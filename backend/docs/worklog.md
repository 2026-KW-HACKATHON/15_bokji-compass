# 작업 기록

## 2026-09-17 — MySQL 기반 백엔드 구현 전 계획

- 사용자 지정 DB를 MySQL로 반영하고 [구현 계획](implementation-plan.md)을 작성했다.
- 저장소의 빈 백엔드 구조, 적용 지침 유무, 개발 도구 버전과 Codex CLI 옵션을 점검했다.
- 서버 사양, 의존성·설치 순서, 저장·검색·판정 구조, 마이그레이션, 테스트와 지속 관리 TODO를 정리했다.
- 현재 PC의 CPU·RAM 조회는 권한 제한으로 확인하지 못했다. Docker 엔진·MySQL 서버·공급자 인증 상태는 미확인이다.
- 구현·설치·DB 변경·실제 LLM 호출·기능 테스트는 수행하지 않았다. 소스와 설정 파일은 빈 상태를 유지한다.

## 2026-09-17 — Windows 직접 운영 기준으로 계획 수정

- 사용자의 Windows 운영 지정을 반영했다. 이전 Ubuntu·가상화 기반 계획은 폐기하고 Windows 직접 설치로 통일했다.
- 초기 권장 사양을 CPU 4코어 이상, RAM 16GB, OS 공간 외 SSD 여유 100GB 이상으로 조정했다. 실제 요구 성능은 부하 시험으로 검증할 예정이다.
- MySQL x64 MSI/Configurator, Visual C++ 런타임, Python/uv, WinSW 서비스 등록과 자동 복구를 설치 계획에 반영했다.
- PowerShell 실행 예시, Windows Codex 실행 파일·계정 격리, 자식 프로세스 종료, NTFS·UTF-8·재부팅 검증을 추가했다.
- 문서만 변경했다. 패키지 설치·서비스 등록·DB 변경·기능 테스트는 수행하지 않았다.

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
