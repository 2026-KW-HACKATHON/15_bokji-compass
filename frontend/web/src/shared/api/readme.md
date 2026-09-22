# HTTP 어댑터

담당: 프론트엔드. `checkHealth()` → `Promise<{status: 'ok', service: 'bokji-compass-backend'}>`. `VITE_API_BASE_URL`(기본 `/api`)의 `/health`에 GET 요청합니다. 5초 시간 초과·네트워크·HTTP 실패·잘못된 JSON·응답 형태 불일치 시 예외를 던집니다. 화면에서 오류를 안내하며 예시 탐색은 계속 가능합니다.

실제 정책 API는 아직 호출하지 않습니다. 준비 상태와 정책 서비스 상태를 혼동하지 않습니다. [연동 문서](../../../../docs/api-integration.md). E2E에서 성공/실패 응답을 대역으로 검증하며 실제 서버 연결 검증과는 구분합니다.
