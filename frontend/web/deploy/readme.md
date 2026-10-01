# 배포 구성 예시

## Windows PC 외부 시연

`backend/scripts/share.ps1 start`는 빌드한 프론트와 별도 시연 API를 실행하고 Cloudflare Quick Tunnel HTTPS 주소를 출력합니다. 저장소 루트에서 `powershell -ExecutionPolicy Bypass -File backend/scripts/share.ps1 start`로 실행합니다. `status`는 프로세스와 주소 확인, `stop`은 이 스크립트가 실행한 프로세스만 종료합니다. 재실행하면 공개 주소가 바뀝니다. PC 절전·종료 시 접속할 수 없습니다.

준비: 프론트에서 `npm ci`, `npm run build`; 공식 Windows amd64 `cloudflared`와 Caddy를 각각 `tmp/tunnel-tools/cloudflared-windows-amd64.exe`, `tmp/tunnel-tools/caddy/caddy.exe`에 설치합니다. 공식 GitHub 릴리스의 SHA256과 파일 해시를 비교합니다. 실행 파일·로그·DB·프로세스 상태는 Git에서 제외됩니다.

경로: HTTPS 터널 → 로컬 Caddy 8080 → `/` 정적 프론트, `/api` 시연 FastAPI 8001. 두 서버는 127.0.0.1에만 바인딩하며 공유기·Windows 방화벽 포트 개방은 필요 없습니다. 기존 8000 백엔드·MySQL과 분리됩니다.

공고는 `demo`, 계산은 실제 API입니다. 시연용 회원가입은 실제 SMS 대신 화면에 시험용 번호를 표시합니다. 실제 개인정보 대신 테스트 정보를 사용합니다. 시연 계정·금융 입력은 `backend/data/tunnel-demo/auth.sqlite3`에만 저장하고 종료 후에도 보존합니다. 기존 MySQL 계정·데이터는 사용하지 않습니다. 외부 API는 health·auth·finance만 열며 CLI 실행·DB·원본 파일은 노출하지 않습니다. HTTPS 응답의 세션 쿠키에는 Caddy가 Secure 속성을 추가합니다.

관련 구성: `Caddyfile.tunnel`, `backend/scripts/share-server.py`. 이 구성은 임시 시연용이며 실제 SMS·정책 DB·추천 API 운영 완료를 뜻하지 않습니다.

2026-10-01 공개·보안 확인: 프론트 단위 테스트 22개·빌드 통과. 실제 HTTPS 주소에서 화면·health·금융 규칙 200, `.env`·Git 설정·DB 파일·API 문서 404, 256KB 초과 요청 413, 미허용 출처 CORS preflight 400 확인. CSP·HSTS·nosniff·프레임 제한 헤더 확인. 브라우저에서 프론트 표시 확인. API·웹·MySQL의 수신 주소는 127.0.0.1이며 시연 프로세스 종료·재시작 검증. 사용자 요청에 따라 로그인 구현 변경·가입/로그인 기능 검증은 제외. 공개 주소는 접근 제한 없는 임시 시연 주소이며 DDoS 대응·침투 테스트·운영 보안 인증을 수행한 것은 아님.

담당: 프론트/운영. nginx.conf는 정적 dist 제공, /api 접두사 제거 proxy, 공개 설정 재검증/해시 자산 캐시를 설명하는 예시입니다. 실행 함수/반환값 없음.
실제 설치·호스트 배포·TLS 변경은 수행하지 않았습니다. 대상 운영 경로/upstream을 조정하고 nginx -t 후 적용해야 합니다. [배포 절차](../../docs/deployment.md).
