# 프론트 검증

담당: 프론트엔드. web/에서 npm test: Node 계약 테스트 12개. 필터·정확한 태그·cursor·응답 검증·서버 추천 payload·API 실패 시 fallback 없음·설정·저장 실패·HTTP 오류/취소/시간 초과를 검증합니다.

npm run test:e2e: Edge/Chromium desktop/mobile. 검색/태그/상세/저장, 쉬운 화면 단계 입력·설정 유지, 인증폼 비활성, 320px, API 실패/재시도 대역 시나리오. 실제 서버·LLM이나 모바일 OS 테스트가 아닙니다.
이번 변경은 Codex 브라우저 도구로 직접 사용자 흐름을 검증했으며 CLI E2E 실행 결과와 구분해 작업 기록에 남깁니다.
