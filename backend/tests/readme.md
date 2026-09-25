# 개발환경 테스트

현재 상태: 오프라인 테스트 구현. 담당자: 미정.

설치 후 저장소 루트에서 `powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test.ps1`을 실행합니다. pytest 실패, Ruff 오류, 의존성 충돌은 비정상 종료로 보고합니다.

`test_bootstrap.py`는 설정·health/readiness·인증/금융 OpenAPI·CORS·비밀정보 보호·풀 종료를, `test_mysql_helper.py`는 다른 데이터 디렉터리·기존 데이터·다른 DB 설정 보호를 검사합니다. 외부 MySQL·AI를 호출하지 않습니다. 실제 연결 검증은 `/health/ready`로 별도 수행하고 기록합니다.

`scripts/test.ps1`은 `app/modules`의 수집·Gov24 요청·정책 행 변환 테스트도 수집합니다. 외부 HTTP는 대역을 사용합니다. 전체 공고의 자격 판정·정책 MySQL 저장은 아직 구현되지 않았습니다. 금융조건 비교 테스트와 전체 자격 판정 검증을 구분합니다.

`test_raw_parsing.py`는 공통 입력·조건 계약·원문 근거·준비 모드·모델 재시도/시간 초과·초안 파일을, `test_classification_experiment.py`는 이전 표본 실험의 후보/근거 검증을 검사합니다. CLI와 모델은 대역을 사용합니다. 모듈별 tests 폴더가 비어 있어도 해당 기능의 검증이 이 폴더에 있을 수 있으므로 각 README를 확인합니다.

`test_auth.py`는 격리 SQLite에서 가입·세션·만료·로그아웃·개발용 문자 인증·입력 검증·기존 계정 보존을 확인합니다. 실제 SMS 공급자를 호출하지 않습니다.

`test_finance_rules.py`는 공식 기준과 사업별 참고 산식, 미입력/0 구분, 차량·공제 경계, 미지원 연도, 검토된 공고 기준과의 비교를 검증합니다. `test_finance_api.py`는 격리 SQLite에서 비회원 무저장, 명시적 회원 저장 동의, 계정 격리·삭제·세션, 민감 오류, 재계산·재시작 보존을 확인합니다. MySQL 모드의 자동 테이블 생성 차단은 SQLite 엔진을 대역으로 사용하며 실제 MySQL 금융 저장 검증은 별도입니다.

기본 HTTP 계약만 확인하려면 backend에서 `.\.venv\Scripts\python.exe -m pytest tests/test_bootstrap.py -q`를 실행합니다. 금융 관련 검증은 `tests/test_finance_rules.py tests/test_finance_api.py tests/test_bootstrap.py`를 함께 지정합니다. 2026-09-25 이 세 파일에서 67개 통과를 확인했으며 전체 테스트 결과와 구분합니다. Windows 공용 임시폴더의 권한 문제가 있으면 `scripts/test.ps1`이 사용하는 프로젝트 `.cache` 내부 테스트 임시 경로를 사용합니다. [루트 API 관리대장](../../api-management.md)의 입력·응답·CORS와 대조합니다.
