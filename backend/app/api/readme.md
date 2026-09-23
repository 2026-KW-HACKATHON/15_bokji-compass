# HTTP API 경계

현재 상태: 상태 점검 및 회원가입·로그인·개발용 전화번호 인증 API 구현.

공개 진입점은 `health.router`입니다. 입력 없는 동기 GET `/health`, `/health/ready`를 제공합니다. 반복 호출은 DB 데이터를 변경하지 않습니다. 준비 상태는 내부 풀로 `SELECT 1`을 실행하며 미설정·실패 시 503을 반환합니다. 드라이버 오류나 비밀정보는 응답하지 않습니다.

예: `/health`는 `{"status":"ok","service":"bokji-compass-backend"}`, DB 미설정 readiness는 `{"status":"not_ready","database":"disabled"}`입니다.

[API 문서](../../docs/api/readme.md)를 참고하고 backend에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py tests/test_auth.py`로 검증합니다. `auth.router`는 `/v1/auth`의 인증 API를 제공합니다. [인증 계약](../modules/auth/readme.md)을 참고하세요. 정책·추천 업무 API는 미구현입니다.
