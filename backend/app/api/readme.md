# HTTP API 경계

현재 상태: 상태 점검 API 구현. 담당자: 미정.

공개 진입점은 `health.router`입니다. 입력 없는 동기 GET `/health`, `/health/ready`를 제공합니다. 반복 호출은 DB 데이터를 변경하지 않습니다. 준비 상태는 내부 풀로 `SELECT 1`을 실행하며 미설정·실패 시 503을 반환합니다. 드라이버 오류나 비밀정보는 응답하지 않습니다.

예: `/health`는 `{"status":"ok","service":"bokji-compass-backend"}`, DB 미설정 readiness는 `{"status":"not_ready","database":"disabled"}`입니다.

[API 문서](../../docs/api/readme.md)를 참고하고 backend에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py`로 검증합니다. 후속 업무 API와 인증은 미구현입니다. 업무 처리는 모듈 공개 인터페이스로 위임합니다.
