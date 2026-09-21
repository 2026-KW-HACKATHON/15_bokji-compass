# 개발환경 테스트

현재 상태: 오프라인 테스트 구현. 담당자: 미정.

설치 후 저장소 루트에서 `powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/test.ps1`을 실행합니다. pytest 실패, Ruff 오류, 의존성 충돌은 비정상 종료로 보고합니다.

`test_bootstrap.py`는 설정·health/readiness·CORS·비밀정보 보호·풀 종료를, `test_mysql_helper.py`는 다른 데이터 디렉터리·기존 데이터·다른 DB 설정 보호를 검사합니다. 실제 DB·AI를 호출하지 않습니다. 실제 연결 검증은 `/health/ready`로 별도 수행하고 기록합니다.

`scripts/test.ps1`은 `app/modules`의 수집·Gov24 요청·정책 행 변환 테스트도 수집합니다. HTTP는 대역을 사용합니다. 조건 판정·정책 MySQL 저장 테스트는 아직 없습니다. 후속 변경 시 실제 기능과 오류 경계를 검증하는 테스트를 추가합니다.
