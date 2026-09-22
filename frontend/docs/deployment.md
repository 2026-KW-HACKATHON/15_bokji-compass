# 웹 배포와 서버 연결
담당: 프론트/운영. 배포 구성 예시이며 실제 운영 호스트는 미정입니다.

1. frontend/web에서 npm ci → npm test → npm run build.
2. dist/ 전체를 정적 호스트에 배포합니다. 루트 경로 배포 기준이며 하위 경로 배포는 Vite base와 app-config script 주소를 함께 변경합니다.
3. /api/*를 backend로 전달하고 /api 접두사를 제거합니다. Vite 개발 proxy는 운영에 포함되지 않습니다.
4. dist/app-config.js로 공개 API 주소/모드를 설정합니다. index.html과 app-config.js는 캐시 재검증, 해시 assets는 장기 캐시.
5. HTTPS 도메인에서 실제 목록·필터·페이지·추천·실패 재시도·공식 링크를 점검합니다. 현재 서버에는 업무 API가 없으므로 아직 운영 서비스가 완성된 상태는 아닙니다.

공개 런타임 예시:
```js
window.__BOKJI_CONFIG__ = { dataMode: 'api', apiBaseUrl: '/api' };
```
공개 예시 체험 배포를 의도한 경우에만 dataMode:'demo'를 명시합니다. 예시 배너가 항상 표시됩니다.
우선순위: 명시적 런타임 값 → 빌드 시 VITE_DATA_MODE/VITE_API_BASE_URL → auto,/api.
auto는 Vite 개발 demo / build api. app-config.js는 공개 파일이며 비밀키 금지. 설정 파일을 수정하면 빌드를 반복하지 않고도 배포 주소 변경 가능.
개발 .env는 [예시](../web/.env.example)를 참고하고 변경 후 Vite 재시작.

[Nginx 예시](../web/deploy/nginx.conf)는 TLS를 처리하는 상위 proxy 뒤의 정적 호스트 예시입니다. 새 운영 환경을 강제하지 않습니다. Windows backend를 그대로 운영하며 IIS/다른 gateway로도 동일한 /api 규칙을 적용할 수 있습니다. 예시 upstream 127.0.0.1:8000은 frontend proxy와 backend가 같은 호스트일 때만 유효하므로 별도 호스트라면 실제 내부 주소로 변경합니다. 외부 공개/TLS/방화벽은 운영 호스트 확정 후 구성합니다.

다른 출처 HTTPS API를 쓰면 backend CORS Origin과 POST 허용을 추가해야 합니다. 현재 GET만 허용하고 credentials=false입니다. 인증 API가 생기면 쿠키/토큰/CSRF 계약을 별도로 확정합니다. 웹/앱 번들에 DB·수집·LLM 키를 넣지 않습니다.
