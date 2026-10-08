# 배포 구성 예시

웹 공격 방어의 요청 출처 검사·JSON 본문 한도·CSP 변경은 [웹 보안 안내](../../../backend/docs/web-security.md)를 따릅니다. 공유 API는 공개 실행 시 production 설정으로 Secure 쿠키를 사용하며, 빌드 후 공유 API와 Caddy를 다시 불러와야 새 코드와 헤더가 적용됩니다.

회원 주소 검색은 카카오 우편번호 SDK를 버튼 클릭 시 불러옵니다. `Caddyfile.tunnel`의 CSP에는 스크립트 `https://t1.kakaocdn.net`과 프레임 `https://postcode.map.kakao.com`, `https://postcode.map.daum.net`을 허용합니다. 별도 배포에서 CSP를 설정한다면 같은 출처를 허용해야 합니다. MySQL 배포에는 `python -m app.modules.auth init`으로 회원 주소 열도 준비합니다. [회원 주소 입력](../../docs/member-address.md).

## Windows PC 외부 시연

`backend/scripts/share.ps1 start`는 빌드한 프론트와 별도 시연 API를 실행합니다. 로컬 터널 토큰 파일이 있으면 고정 주소 `https://bokji.commitnaru.com`, 없으면 Cloudflare Quick Tunnel HTTPS 주소를 사용합니다. 고정 도메인 연결은 [설정 안내](../../../backend/docs/fixed-domain.md)를 따르고 `start -TunnelMode fixed`로 실행합니다. 저장소 루트에서 `powershell -ExecutionPolicy Bypass -File backend/scripts/share.ps1 start`로 실행합니다. `status`는 프로세스와 주소 확인, `stop`은 이 스크립트가 실행한 프로세스만 종료합니다. Quick Tunnel 재실행 시 공개 주소가 바뀝니다. PC 절전·종료 시 접속할 수 없습니다.

준비: 프론트에서 `npm ci`, `npm run build`; 공식 Windows amd64 `cloudflared`와 Caddy를 각각 `tmp/tunnel-tools/cloudflared-windows-amd64.exe`, `tmp/tunnel-tools/caddy/caddy.exe`에 설치합니다. 공식 GitHub 릴리스의 SHA256과 파일 해시를 비교합니다. 실행 파일·로그·DB·프로세스 상태는 Git에서 제외됩니다.

경로: HTTPS 터널 → 로컬 Caddy 8080 → `/` 정적 프론트, `/api` 공유 FastAPI 8001. 두 서버는 127.0.0.1에만 바인딩하며 공유기·Windows 방화벽 포트 개방은 필요 없습니다. 기존 8000 백엔드와 별도로 실행하며 공고는 `backend/.env`에 설정한 기존 MySQL을 조회합니다.

공고·계산은 실제 API입니다. `GET /api/v1/policies` 및 상세·캘린더는 MySQL의 최신 공개 개정만 반환합니다. 수집 초안을 자동 승인하지 않으며 공개 개정이 없으면 200과 빈 목록을 반환합니다. 공고 DB 연결을 위해 `DB_ENABLED=true`와 정상 MySQL 실행이 필요합니다. `/api/health/ready`로 연결을 확인합니다. 공고 FAQ·직접 질문 API는 기존 회원 인증과 공개 개정 검사를 유지하며 프록시 응답 제한은 75초입니다.

추천은 `POST /api/v1/recommendations`를 공유 API로 전달합니다. `Caddyfile.tunnel`의 `@publicApi` 허용 목록에는 접두사 제거 후 경로 `/v1/recommendations`가 필요합니다. 백엔드·Vite에서 성공해도 이 항목이 빠지면 공유 사이트는 404를 반환하므로 검증 시 실제 공유 도메인의 추천 화면까지 확인합니다.

생활 상담의 `/api/v1/assistant/dialogue`, `/api/v1/assistant/dialogue/profile`과 지속 안내의
`/api/v1/monitoring` 및 하위 경로도 허용 목록으로 전달합니다. 회원 인증·동의·쓰기 요청 검사는
FastAPI가 적용하며 서버 관리자 전용 경로는 이 공개 프록시에서 제공하지 않습니다.

일반 회원가입은 전화번호 인증 없이 이메일 인증 후 진행하며 카카오 설정 완료 시 카카오 로그인도 제공합니다. 신규 카카오 가입은 직접 입력한 이메일을 요구합니다. 일반 가입에는 서버의 SMTP 설정이 필요합니다. MySQL 배포 전 `python -m app.modules.auth init`으로 이메일 열과 인증 대기 테이블을 준비합니다. 기존 계정·세션은 보존하며 회원 암호화 키는 필수 설정이 아닙니다. [이메일·SMTP 설정](../../../backend/docs/email-signup.md), [회원 저장·기존 암호화 데이터 복원](../../../backend/docs/member-privacy.md)을 따릅니다. CLI 실행·DB 파일·원본 파일은 HTTP로 제공하지 않습니다. HTTPS 응답의 세션 쿠키에는 Caddy가 Secure 속성을 추가합니다. `share.ps1 reload`로 터널 URL을 유지하며 설정을 적용할 수 있습니다.

관련 구성: `Caddyfile.tunnel`, `backend/scripts/share-server.py`. 실제 카카오 공급자 로그인 및 운영 배포 검증은 별도로 수행합니다.
2026-10-02 공고 공개 관리 구현: 최고 관리자 전용 `/api/v1/admin/policies` 목록/검토/공개 상태 변경을 프록시로 전달합니다. `storage init`으로 006 이력 테이블 적용 후 빌드·reload합니다. 공개할 공고는 관리자 관리 → 공고 공개 관리에서 원문 검토 후 선택합니다. 일반/QR 관리자는 접근할 수 없습니다.

2026-10-01 공개·보안 확인: 프론트 단위 테스트 22개·빌드 통과. 실제 HTTPS 주소에서 화면·health·금융 규칙 200, `.env`·Git 설정·DB 파일·API 문서 404, 256KB 초과 요청 413, 미허용 출처 CORS preflight 400 확인. CSP·HSTS·nosniff·프레임 제한 헤더 확인. 브라우저에서 프론트 표시 확인. API·웹·MySQL의 수신 주소는 127.0.0.1이며 시연 프로세스 종료·재시작 검증. 사용자 요청에 따라 로그인 구현 변경·가입/로그인 기능 검증은 제외. 공개 주소는 접근 제한 없는 임시 시연 주소이며 DDoS 대응·침투 테스트·운영 보안 인증을 수행한 것은 아님.

담당: 프론트/운영. nginx.conf는 정적 dist 제공, /api 접두사 제거 proxy, 공개 설정 재검증/해시 자산 캐시를 설명하는 예시입니다. 실행 함수/반환값 없음.
실제 설치·호스트 배포·TLS 변경은 수행하지 않았습니다. 대상 운영 경로/upstream을 조정하고 nginx -t 후 적용해야 합니다. [배포 절차](../../docs/deployment.md).
