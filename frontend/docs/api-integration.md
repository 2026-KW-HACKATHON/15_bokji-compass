# 백엔드 API 연동 현황
기준: 2026-09-22. 공통 주소/상태는 루트 [API 관리대장](../../api-management.md).

현재 서버 구현은 GET /health, GET /health/ready입니다. 공고·추천·인증은 없습니다.
웹에는 [업무 계약 제안](service-contract.md)에 대한 호출자를 구현했습니다. 서버 구현 완료를 의미하지 않습니다.

- createPolicyRepository({mode,request}).list(filters,{cursor,limit,signal}) → {items,total,nextCursor,source}
- createRecommendationRepository({mode,request}).recommend(profile,{signal}) → {items:[{policy,reason}],summary,source}
- api: GET /v1/policies, POST /v1/recommendations. HTTP 클라이언트가 /api 등 기준 주소 결합.
- demo: 합성 공고와 결정적 관심 분야 우선 정렬, 네트워크 없음. 실제 LLM 추론 아님.
- 공고 15초, 추천 30초 제한. 취소·이전 응답 무시·JSON/schema 검증·안전한 오류 표시.
- API 실패 시 예시 fallback 없음. 빈 결과, 404 준비 중, 기타 실패와 재시도 구분.
- checkHealth() 도구 함수는 유지하지만 현재 제품 UI에서 호출하지 않음.
- 로그인/가입 입력폼은 인증·세션·전송 로직 없음. 쿠키/Authorization 헤더도 미연결.

Vite proxy는 개발 전용입니다. 운영 /api reverse proxy 또는 HTTPS 주소+CORS 구성은 [배포 문서](deployment.md).
현재 백엔드 CORS는 GET만 허용하므로 다른 출처에서 추천 POST를 연결하려면 서버 메서드/Origin 정책을 함께 변경해야 합니다. 같은 출처 reverse proxy가 기본 권장 경로입니다.
Android/iOS도 같은 공개 JSON 계약을 사용하며 백엔드 파일·DB·CLI를 직접 참조하지 않습니다.
