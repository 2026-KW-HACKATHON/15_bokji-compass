# 백엔드 API 연동 현황
기준: 2026-09-22. 공통 주소/상태는 루트 [API 관리대장](../../api-management.md).

현재 서버 구현은 GET /health, GET /health/ready와 `/v1/auth` 인증 API입니다. 공고·추천 서버는 없습니다.
웹에는 [업무 계약 제안](service-contract.md)에 대한 호출자를 구현했습니다. 서버 구현 완료를 의미하지 않습니다.

- createPolicyRepository({mode,request}).list(filters,{cursor,limit,signal}) → {items,total,nextCursor,source}
- createRecommendationRepository({mode,request}).recommend(profile,{signal}) → {items:[{policy,reason}],summary,source}
- api: GET /v1/policies, POST /v1/recommendations. HTTP 클라이언트가 /api 등 기준 주소 결합.
- demo: 합성 공고와 결정적 관심 분야 우선 정렬, 네트워크 없음. 실제 LLM 추론 아님.
- 공고 15초, 추천 30초 제한. 취소·이전 응답 무시·JSON/schema 검증·안전한 오류 표시.
- API 실패 시 예시 fallback 없음. 빈 결과, 404 준비 중, 기타 실패와 재시도 구분.
- checkHealth() 도구 함수는 유지하지만 현재 제품 UI에서 호출하지 않음.
- 로그인/가입은 `authApi.js`를 통해 실제 서버와 연결합니다. credentials=include, X-Auth-Request: 1, 15초 제한이며 HttpOnly 세션 쿠키를 사용합니다. 개발용 전화번호 인증번호는 화면에 표시되며 실제 SMS는 미연결입니다. [필드·오류·세션 계약](../../backend/app/modules/auth/readme.md).

Vite proxy는 개발 전용입니다. 운영 /api reverse proxy 또는 HTTPS 주소+CORS 구성은 [배포 문서](deployment.md).
현재 백엔드 CORS는 설정된 Origin에 GET/POST, credentials=true, Content-Type/X-Auth-Request 헤더를 허용합니다. 인증 쿠키는 SameSite=Lax이므로 같은 사이트의 reverse proxy를 사용합니다. 인증·개인정보 응답을 프록시에서 캐시하지 않습니다.
Android/iOS도 같은 공개 JSON 계약을 사용하며 백엔드 파일·DB·CLI를 직접 참조하지 않습니다.
