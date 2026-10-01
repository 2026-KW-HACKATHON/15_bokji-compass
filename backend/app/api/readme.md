# HTTP API 경계

현재 상태: 상태 점검, 인증, 금융 계산·저장, 공개 공고 목록·상세·검색과 회원 공고 질문 API 구현.

`policies.router`는 MySQL의 공개된 최신 공고 목록·상세·검색을 제공합니다.
`assistant.router`는 로그인 회원의 공고 질문을 받으며 최소 프로필과 공개 원문으로 답변합니다.
`members.get_member`는 금융/질문 API의 웹 쿠키·모바일 Bearer 검증을 공유합니다.
[공고/질문 계약과 제한](../../docs/policy-storage.md), `test_policy_api.py`를 참고하세요.

`health.router`는 입력 없는 동기 GET `/health`, `/health/ready`를 제공합니다. 반복 호출은 DB 데이터를 변경하지 않습니다. 준비 상태는 내부 풀로 `SELECT 1`을 실행하며 미설정·실패 시 503을 반환합니다. 드라이버 오류나 비밀정보는 응답하지 않습니다.

예: `/health`는 `{"status":"ok","service":"bokji-compass-backend"}`, DB 미설정 readiness는 `{"status":"not_ready","database":"disabled"}`입니다.

`auth.router`는 `/v1/auth`의 인증 API를 제공합니다. [인증 계약](../modules/auth/readme.md)을 참고하세요.

`finance.router`는 `/v1/finance`의 공개 규칙 조회·계산과 로그인 계정별 금융정보 조회·저장·삭제를 제공합니다. 공개 계산은 인증·DB 설정 없이 실행하며, 회원 경로는 검증한 세션의 계정 ID만 사용합니다. 금융 응답은 오류를 포함해 `no-store`이며 검증 오류에 원입력을 포함하지 않습니다. [금융 모듈·초기화](../modules/finance/readme.md), [공식 산정 규칙·계산 한계](../../docs/financial-rules.md)를 참고하세요. 추천과 공고 전체의 신청 자격 판정 HTTP API는 미구현입니다.

[API 문서](../../docs/api/readme.md)를 참고하고 backend에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py tests/test_auth.py tests/test_finance_api.py`로 검증합니다.

## 모바일 인증

`mobile_auth.router`는 `/v1/mobile/auth`의 login/me/logout을 제공합니다. login 입력은 기존 LoginInput이고 토큰·사용자·만료 초를 반환합니다. me/logout은 HTTP Bearer 토큰을 받습니다. 웹 쿠키와 모바일 토큰은 해시 영역을 분리하며 쿠키를 발급하지 않습니다. 금융 회원 API는 Authorization이 있으면 모바일 토큰만, 없으면 기존 쿠키를 검증합니다. 공개 계산은 기존처럼 비회원 사용이 가능합니다.

계약은 [API 관리대장](../../../api-management.md)의 모바일 인증 절, 검증은 `tests/test_mobile_auth.py`와 기존 인증/금융 테스트를 참고하세요.
