# 개발환경 테스트

현재 상태: 오프라인 테스트 구현. 담당자: 미정.

`test_stop_dev.py`는 Windows 프로세스 조회·종료를 대역으로 바꿔 개발 API 트리 종료,
운영/타 프로젝트 보존, 코드 속 경로 오인 방지, PID 재사용·권한 오류·종료 실패 시 시작 중단을 검사합니다.
실제 서버나 터널을 실행·종료하지 않습니다.

설치 후 저장소 루트에서 `powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test.ps1`을 실행합니다. pytest 실패, Ruff 오류, 의존성 충돌은 비정상 종료로 보고합니다.

`test_bootstrap.py`는 설정·health/readiness·인증/금융 OpenAPI·CORS·비밀정보 보호·풀 종료를, `test_mysql_helper.py`는 다른 데이터 디렉터리·기존 데이터·다른 DB 설정 보호를 검사합니다. 외부 MySQL·AI를 호출하지 않습니다. 실제 연결 검증은 `/health/ready`로 별도 수행하고 기록합니다.

`scripts/test.ps1`은 `app/modules`의 수집·Gov24 요청·정책 행 변환 테스트도 수집합니다. 외부 HTTP는 대역을 사용합니다. 전체 공고의 자격 판정·정책 MySQL 저장은 아직 구현되지 않았습니다. 금융조건 비교 테스트와 전체 자격 판정 검증을 구분합니다.

`test_raw_parsing.py`는 공통 입력·조건 계약·요약 출력 필드·6개 분야 제한·조건 상태 구분·제목/URL/항목별 원문 근거·준비 모드·모델 재시도/시간 초과·초안 파일을, `test_classification_experiment.py`는 이전 표본 실험의 후보/근거 검증을 검사합니다. CLI와 모델은 대역을 사용하며 실제 모델 호출이나 의미 정확도 평가는 하지 않습니다. 모듈별 tests 폴더가 비어 있어도 해당 기능의 검증이 이 폴더에 있을 수 있으므로 각 README를 확인합니다.

`test_auth.py`는 격리 SQLite에서 가입·세션·만료·로그아웃·개발용 문자 인증·입력 검증·기존 계정 보존을 확인합니다. 실제 SMS 공급자를 호출하지 않습니다.

`test_finance_rules.py`는 공식 기준과 사업별 참고 산식, 미입력/0 구분, 차량·공제 경계, 미지원 연도, 검토된 공고 기준과의 비교를 검증합니다. `test_finance_api.py`는 격리 SQLite에서 비회원 무저장, 명시적 회원 저장 동의, 계정 격리·삭제·세션, 민감 오류, 재계산·재시작 보존을 확인합니다. MySQL 모드의 자동 테이블 생성 차단은 SQLite 엔진을 대역으로 사용하며 실제 MySQL 금융 저장 검증은 별도입니다.

기본 HTTP 계약만 확인하려면 backend에서 `.\.venv\Scripts\python.exe -m pytest tests/test_bootstrap.py -q`를 실행합니다. 금융 관련 검증은 `tests/test_finance_rules.py tests/test_finance_api.py tests/test_bootstrap.py`를 함께 지정합니다. 2026-09-25 이 세 파일에서 67개 통과를 확인했으며 전체 테스트 결과와 구분합니다. Windows 공용 임시폴더의 권한 문제가 있으면 `scripts/test.ps1`이 사용하는 프로젝트 `.cache` 내부 테스트 임시 경로를 사용합니다. [루트 API 관리대장](../../api-management.md)의 입력·응답·CORS와 대조합니다.


## 공고 DB / 개인 안내 (2026-10-01)

- conftest.py는 pipeline 모델 호출을 기본 대역으로 바꿔 실제 API 비용 발생을 막는다.
- pytest importlib 모드로 서로 다른 모듈의 동명 test_policy.py 수집 충돌을 방지한다.
- test_policy_database.py: 기본 계약 검증 + BOKJI_TEST_MYSQL=1에서 실제 격리 MySQL 테스트.
  source/개정/조건 roundtrip, 중복/개정/롤백/동시성/NULL/부분 실패/재개 검증.
  지역 약칭·정식/이전 명칭, 대상 동의어·기타 조건, 검색어와의 AND 조합,
  필터 후 건수·페이지·캘린더·공개 상태·미확정 값·지역 혼동도 검증한다.
  테스트 생성 ID는 종료 시 정리한다. 서비스 DB에는 합성 공고를 넣지 않는다.
- test_notice_presentation.py: 공고체 변환의 한도·부정 보존, 지급/신청 기간 분리,
  봉규 seed 190건 정규화·2건 개요 인용/원문 불변성·SQL INSERT 행 수를 검증한다.
  실제 LLM·네트워크·DB나 seed SQL 실행은 수행하지 않는다.
- test_assistant.py: DB 조회·프로필 문맥 분리·공개 경계·잘못된 인용 거부 검증.
- 실제 모델 검증은 일반 pytest 밖에서 명시적으로 수행한다. [실증](../docs/worklog.md).

## 백엔드 서버 관리자

`test_server_runtime.py`는 고정 인수·숨김 프로세스 실행·영속 결과·프로세스 간 중복 접수·
수집과의 동시 실행 차단·실행 실패 복구를 검증합니다. `test_process_control.py`는 임시
프로젝트와 PowerShell 프로세스 명령 대역으로 PID 재사용, 다른 프로젝트 보존, 개발/운영
종료와 고정 재시작 경로를 확인합니다. 실제 운영 프로세스를 종료하지 않습니다.
`test_server_admin.py`의 제어 API 검사는 최고 관리자 권한·동일 출처·허용 입력·UUID 조회를
확인하며 실제 실행 명령은 대역으로 바꿉니다.

`test_server_operations.py`와 `test_server_admin.py`의 실행 검사는 실제 worker 연결,
원문 모드의 모델·작업·검색 차단, 분석 프리셋·저장 설정 반영, 중복 접수 차단,
DB 재시작 대기·수집 비활성, 관리자·출처 검사, 비밀값 비노출, 종료 시 worker 대기를 검증합니다.
Windows 작업 호출은 subprocess 대역으로 인수 배열과 등록 제약만 확인합니다.
공공 API·모델·실제 스케줄 등록을 실행하지 않습니다.

`test_server_admin.py`는 임시 SQLite 계정과 임시 환경 설정 파일만 사용합니다.
최고 관리자 로그인, 전용 쿠키 격리, 권한 회수·만료, 동일 출처 요청 보호,
설정 허용 목록·비밀값 비노출·충돌 처리, DB 설정의 재시작 필요 상태를 검증합니다.
64KB를 넘는 일반·청크 요청을 인증 전에 차단하며, `test_ingestion_disabled.py`는
수집 중지 설정 시 `tick --live`도 DB·네트워크·모델을 접근하지 않는지 확인합니다.
실제 MySQL, 수집 API, 모델, 운영 설정 파일은 접근하지 않습니다.
