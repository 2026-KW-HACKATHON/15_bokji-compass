# 백엔드 API 연동 현황

주소·엔드포인트·응답 예시·CORS·변경 책임은 루트 [API 관리대장](../../api-management.md)에서 통합 관리합니다. 이 문서는 현재 웹 호출자의 구현과 후속 Android/iOS 연동 범위를 기록합니다.

기준: 2026-09-22. 현재 백엔드 공개 경로는 GET /health, GET /health/ready입니다. [HTTP 계약](../../backend/docs/api/readme.md)과 [전체 구현 상태](../../backend/docs/implementation-status.md)를 기준으로 연결합니다.

- health 200: 서버 응답 확인.
- readiness 200: MySQL SELECT 1 연결 점검 성공. 정책 테이블·조회 API 준비 완료 의미 아님.
- 정책 목록·상세·검색·사용자 자격 판정·원문 업로드/분석·인증 API: 미구현.
- 원문 파싱은 백엔드 내부 CLI이며 결과는 로컬 검토용 JSON. 프론트엔드가 결과 폴더·DB·백엔드 내부 모듈을 직접 참조하지 않음.

업무 API 추가 시 요청·응답·오류·인증 계약을 확정하고 실제 OpenAPI와 호출자를 함께 갱신합니다. 현재 없는 엔드포인트를 구현된 API로 안내하지 않습니다.

## 웹 시작점의 연결 방식

- `features/policies/policyRepository.js`의 `listPolicies()`는 합성 예시만 반환합니다. 반환: `Promise<{items: PolicyViewModel[], source: 'demo'}>`. 네트워크 호출 없음.
- 화면 모델은 `id, title, category, region, audience, organization, summary, benefit, tags, icon, tone, date`를 사용합니다. 이는 프론트 예시 계약이며 서버의 확정 계약이 아닙니다. `date`도 예시 정렬용입니다.
- `shared/api/client.js`의 `checkHealth()`만 실제 GET `/health`를 호출합니다. 서비스 안내 팝업에서 사용자가 버튼을 누를 때 실행하며 자동 폴링하지 않습니다.
- `VITE_API_BASE_URL=/api`를 기본값으로 사용하고 Vite 개발 proxy가 `/api`를 제거해 `API_PROXY_TARGET`으로 전달합니다. 운영에서는 별도 reverse proxy 또는 CORS가 필요합니다.
- 원천 Gov24/복지로 API, 백엔드 파일·DB·CLI를 브라우저에서 직접 호출하지 않습니다. readiness를 정책 준비 상태로 표시하지 않습니다.

실제 정책 API 확정 후 공급 어댑터 교체, 응답 검증, 페이지/정렬/필터 계약, 취소·시간 초과·재시도, 승인/검수 상태, 원문 URL 정책, 빈 결과·오류 상태를 함께 연결해야 합니다. Android/iOS도 같은 공개 HTTP 계약을 사용하며 웹 Vite 환경설정이나 DOM 컴포넌트를 의존하지 않습니다.
