# 웹 배포와 서버 연결
담당: 프론트/운영. 배포 구성 예시이며 실제 운영 호스트는 미정입니다.

## 현재 공유 서버의 API 반영 확인

이 PC의 공유 서버는 `frontend/web/dist`를 제공하며 백엔드는 코드 변경을 자동으로
불러오지 않습니다. 새 화면이 사용하는 API가 추가·변경되었다면 웹 파일 반영만으로
배포가 끝나지 않습니다. 실행 중인 API의 로컬 `/openapi.json`에서 필요한 경로를 확인하고,
누락되면 `backend/scripts/share.ps1 reload`로 최신 서버를 반영합니다. 이 명령은 고정
터널 주소를 유지하고 API·QR·웹을 재시작합니다.

추천 제외는 POST `/v1/monitoring/candidates/feedback`, 서류 준비는 POST
`/v1/monitoring/candidates/preparation`이 필요합니다. 배포 후 공개 HTTPS의 readiness와
각 경로의 비로그인 401 경계를 확인합니다. 이는 실제 계정 저장 성공 검증과 구분합니다.

## 정적 웹 배포 절차

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

다른 출처 HTTPS API를 쓰면 backend CORS Origin을 정확히 설정해야 합니다. 현재 GET/POST와 credentials=true를 허용합니다. 인증은 동일 사이트 API 프록시, HTTPS, HttpOnly/SameSite=Lax 쿠키와 X-Auth-Request 헤더를 사용하며 교차 사이트 쿠키는 지원하지 않습니다. `/v1/auth` 응답은 캐시하지 않습니다. APP_ENV=production에서는 Secure 쿠키가 적용됩니다. 개발·운영 회원 저장은 암호화 MySQL을 요구하며 SQLite는 격리 테스트만 허용합니다. MySQL 인증 테이블 초기화와 카카오 설정은 [인증 문서](../../backend/app/modules/auth/readme.md)를 참고하세요. 웹/앱 번들에 DB·수집·LLM 키를 넣지 않습니다.

금융 API도 모든 응답을 `no-store`로 유지하고 프록시에서 요청 본문을 기록하지 않도록 운영 설정을 확인합니다. MySQL은 HTTP 요청에서 자동 초기화하지 않으므로 [금융 모듈의 초기화 명령](../../backend/app/modules/finance/readme.md#db-초기화)으로 인증·금융 테이블을 준비합니다. 이 명령은 기존 정책 데이터나 초안 사용자 테이블을 삭제·이관하지 않습니다. 회원 원입력은 본인 세션으로만 조회하며 실제 운영 DB 적용·복구 절차는 배포 담당자가 확인해야 합니다. 이번 기능의 구현·검증·미완료 범위는 [인수인계](finance-calculator.md)에 정리되어 있습니다.
