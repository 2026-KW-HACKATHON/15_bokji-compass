# 백엔드 앱

현재 상태: 개발 서버 기반 구현. 담당자: 미정.

`main.py`는 앱 조립과 lifespan만 담당합니다. 동기 함수 `create_app(settings=None) -> FastAPI`는 선택적인 `Settings`를 받습니다. ASGI 진입점은 `app.main:app`입니다. import만으로 외부 호출이나 DB 쓰기를 하지 않습니다.

앱 시작 시 설정을 검증하고 연결 풀을 준비합니다. readiness 요청에서 DB를 읽고 앱 종료 시 풀을 해제합니다. 설정 오류는 시작 실패, DB 점검 실패는 503입니다.

DB 읽기는 SELECT 1 연결 점검에 한정됩니다. 테이블 생성·정책 저장·파싱 자동 실행은 수행하지 않습니다. 원문 파싱은 `scripts/parse-raw.ps1`에서 별도 실행하고 파일 초안으로 저장합니다. [현재 구현 상태](../docs/implementation-status.md).

실행·검증은 [백엔드 사용법](../readme.md), 상세는 [개발환경 문서](../docs/development.md)를 따릅니다. 후속 업무 로직은 modules에 구현하며 진입점에 넣지 않습니다.
