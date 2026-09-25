# 웹 배포와 서버 연결
담당: 프론트/운영. 배포 구성 예시이며 실제 운영 호스트는 미정입니다.

1. frontend/web에서 npm ci → npm test → npm run build.
2. dist/ 전체를 정적 호스트에 배포합니다. 루트 경로 배포 기준이며 하위 경로 배포는 Vite base와 app-config script 주소를 함께 변경합니다.
3. /api/*를 backend로 전달하고 /api 접두사를 제거합니다. Vite 개발 proxy는 운영에 포함되지 않습니다.
4. dist/app-config.js로 공개 API 주소/모드를 설정합니다. index.html과 app-config.js는 캐시 재검증, 해시 assets는 장기 캐시.
5. HTTPS 도메인에서 로그인·계산·동의 저장·재조회·삭제와 실패 재시도를 점검합니다. 인증·금융 API는 구현되어 있으며, 실제 공고 목록·추천 API와 운영 연결은 아직 후속 범위입니다.

공개 런타임 예시:
```js
window.__BOKJI_CONFIG__ = { dataMode: 'api', apiBaseUrl: '/api' };
```
공개 예시 체험 배포를 의도한 경우에만 dataMode:'demo'를 명시합니다. 예시 배너가 항상 표시됩니다.
우선순위: 명시적 런타임 값 → 빌드 시 VITE_DATA_MODE/VITE_API_BASE_URL → auto,/api.
auto는 Vite 개발 demo / build api. app-config.js는 공개 파일이며 비밀키 금지. 설정 파일을 수정하면 빌드를 반복하지 않고도 배포 주소 변경 가능.
개발 .env는 [예시](../web/.env.example)를 참고하고 변경 후 Vite 재시작.

[Nginx 예시](../web/deploy/nginx.conf)는 TLS를 처리하는 상위 proxy 뒤의 정적 호스트 예시입니다. 새 운영 환경을 강제하지 않습니다. Windows backend를 그대로 운영하며 IIS/다른 gateway로도 동일한 /api 규칙을 적용할 수 있습니다. 예시 upstream 127.0.0.1:8000은 frontend proxy와 backend가 같은 호스트일 때만 유효하므로 별도 호스트라면 실제 내부 주소로 변경합니다. 외부 공개/TLS/방화벽은 운영 호스트 확정 후 구성합니다.

다른 출처 HTTPS API를 쓰면 backend CORS Origin을 정확히 설정해야 합니다. 현재 GET/POST와 credentials=true를 허용합니다. 인증은 동일 사이트 API 프록시, HTTPS, HttpOnly/SameSite=Lax 쿠키와 X-Auth-Request 헤더를 사용하며 교차 사이트 쿠키는 지원하지 않습니다. `/v1/auth` 응답은 캐시하지 않습니다. APP_ENV=production에서는 Secure 쿠키가 적용되고 개발용 SMS/SQLite 인증은 차단됩니다. 운영 MySQL 인증 테이블 초기화와 실제 SMS 공급자 연동은 [인증 문서](../../backend/app/modules/auth/readme.md)를 참고하세요. 웹/앱 번들에 DB·수집·LLM 키를 넣지 않습니다.

금융 API도 모든 응답을 `no-store`로 유지하고 프록시에서 요청 본문을 기록하지 않도록 운영 설정을 확인합니다. MySQL은 HTTP 요청에서 자동 초기화하지 않으므로 [금융 모듈의 초기화 명령](../../backend/app/modules/finance/readme.md#db-초기화)으로 인증·금융 테이블을 준비합니다. 이 명령은 기존 정책 데이터나 초안 사용자 테이블을 삭제·이관하지 않습니다. 회원 원입력은 본인 세션으로만 조회하며 실제 운영 DB 적용·복구 절차는 배포 담당자가 확인해야 합니다. 이번 기능의 구현·검증·미완료 범위는 [인수인계](finance-calculator.md)에 정리되어 있습니다.
