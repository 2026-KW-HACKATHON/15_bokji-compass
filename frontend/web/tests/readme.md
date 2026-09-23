# 프론트 검증

담당: 프론트엔드. web/에서 npm test: Node 계약 테스트 12개. 필터·정확한 태그·cursor·응답 검증·서버 추천 payload·API 실패 시 fallback 없음·설정·저장 실패·HTTP 오류/취소/시간 초과를 검증합니다.

npm run test:e2e: Edge/Chromium desktop/mobile 14개. 검색/태그/상세/저장, 쉬운 화면 단계 입력·설정 유지, 320px, API 실패/재시도 및 전화번호 인증·가입·로그인·세션 복원·로그아웃을 검증합니다.

백엔드 setup.ps1/setup.sh로 `.venv`를 먼저 준비해야 합니다. Playwright 설정이 포트 8001의 FastAPI와 5173의 Vite를 시작하고 종료합니다. 인증은 별도 `.cache/auth-e2e-*.sqlite3`를 사용하여 실제 HTTP/DB 흐름을 검증합니다. 기존 개발 서버를 재사용하지 않으므로 두 포트가 비어 있어야 합니다. 일부 실패/번호 변경 시나리오는 HTTP 응답 대역을 사용합니다. 실제 문자 발송·MySQL·LLM·모바일 OS 검증은 아닙니다.
