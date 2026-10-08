# 배포 구성 예시

## 2026-10-08 공개 Cloudflare 보안 적용

`bokji.commitnaru.com`에 한정한 Cloudflare 규칙 4개를 운영에 적용했습니다.
HTTP의 GET·HEAD 화면은 경로·쿼리를 보존해 HTTPS로 308 전환합니다.
HTTP `/api`·`/api/*` 및 나머지 메서드는 WAF가 403으로 차단하고 원본 API로 보내지 않습니다.
HTTPS 응답은 HSTS 1년·CORP/COOP `same-origin`, `/`·`/index.html`은 현재 Caddy
템플릿과 같은 엄격한 CSP를 적용합니다. API·전시 QR의 개별 CSP는 기존 값을 유지합니다.

공개 주소에서 메서드별 차단·위조 전달 헤더·쿼리 보존·HTTPS 정상 응답·기존 인증
경계 **21개가 통과**했습니다. 브라우저의 홈·회원가입 안내도 정상 표시했고 CSP 오류는
없었습니다. 로컬 보안·개인정보·HTTPS·실제 Caddy 회귀 **150개가 통과**했습니다.
규칙 이름·ID·표현식과 실제 응답 증거는
[운영 적용 검증](../../../backend/docs/live-security-fix-validation-2026-10-08.json)에 보관합니다.

이번 적용은 Cloudflare 가장자리에서 이루어졌습니다. 운영 원본 PC에 접근하지 못해
Caddy/API 재시작은 수행하지 않았으므로 아래의 원본 전송 보완 코드는 운영 PC에서
별도로 다시 불러와야 합니다. 공개 전송 보호는 위 Cloudflare 규칙이 제공하며, 원본의
루프백 전용 바인딩과 신뢰 프록시 제한을 유지합니다.


## 2026-10-08 HTTP 전송 보완

공개 사이트 점검에서 HTTP도 화면과 API를 제공하는 것을 확인했습니다.
`Caddyfile.tunnel`은 이제 Cloudflare가 덮어쓴 실제 접속 방식의
`X-Forwarded-Proto`를 검사합니다. 외부 HTTP의 GET·HEAD 화면 요청은 같은 경로·쿼리의
HTTPS로 308 전환하며, HTTP API와 나머지 메서드는 upstream 호출 없이 403으로 거부합니다.
API의 전달 헤더를 무조건 `https`로 바꾸던 설정을 제거했습니다. production FastAPI도
신뢰 프록시를 거친 ASGI scheme이 HTTPS가 아니면 `/v1/`을 본문 처리 전에 거부합니다.
전시 QR 게이트웨이의 별도 내부 권한 확인은 고정 루프백 주소에만 HTTPS 프록시 정보를
명시하며 방문자의 헤더를 복사하지 않습니다. 기존 쿠키·관리자 권한 검사를 유지합니다.

이 신뢰는 Caddy의 `127.0.0.1` 수신과 관리하는 Cloudflare 터널을 전제로 합니다.
공개 인터페이스에 수신 포트를 열거나 클라이언트가 제공한 전달 헤더를 그대로 신뢰하면
안 됩니다. 전달 헤더와 Cloudflare 방문자 정보가 없는 localhost 직접 요청은 시작 시
상태 점검을 위해 허용하며, localhost로 들어온 전달 HTTP 요청은 예외가 아닙니다.
외부 TLS 게이트웨이에서 처음 HTTP 요청부터 HTTPS로 전환하는 설정도 적용합니다.
터널 내부 연결이 HTTP라는 이유로 모든 요청을 전환하면 HTTPS 접속도 반복 전환될 수 있습니다.
[Cloudflare의 전달 헤더](https://developers.cloudflare.com/fundamentals/reference/http-headers/).

nginx 예시는 http 범위의 `map`으로 HTTPS 전달 값을 검사하고 `127.0.0.1:8080`에서만
수신하며, 누락·잘못된 값은 403으로 거부합니다. 앞단 TLS 게이트웨이가 클라이언트의
전달 헤더를 교체하고 HTTP 화면 전환을 처리해야 합니다. API·QR upstream에도 검사한
전달 값을 보냅니다. Caddy/nginx의 HSTS를 1년으로 늘렸으며 기존 엄격한 CSP·COOP·CORP를
함께 적용합니다. HSTS는 HTTPS 응답을 받은 뒤에 효력이 생깁니다.

실제 Caddy 2.11.7을 임시 포트에서 실행한 회귀 검사 14개와 웹 단위 검사 158개,
웹 빌드, 배포 CSP의 데스크톱·모바일 보안 검사 6개가 통과했습니다.
nginx 실행 파일 검사는 수행하지 않았습니다. 재현 방법은
[백엔드 테스트 안내](../../../backend/tests/readme.md)를 따릅니다.
이번 HTTP 보완은 로컬 소스와 빌드에 반영했으며 공개 서버를 재시작하지 않았습니다.
운영 적용 시 API와 Caddy를 함께 다시 불러오고 HTTP 화면의 308·HTTP API의 403·
HTTPS 화면과 API의 정상 응답을 확인합니다.

## 기존 배포 보안 설정

웹 공격 방어의 요청 출처 검사·JSON 본문 한도·CSP 변경은 [웹 보안 안내](../../../backend/docs/web-security.md)를 따릅니다. 공유 API는 공개 실행 시 production 설정으로 Secure 쿠키를 사용하며, 빌드 후 공유 API와 Caddy를 다시 불러와야 새 코드와 헤더가 적용됩니다.

2026-10-08 추가 보완: API GET·HEAD도 교차 사이트 조회를 검사하며 Caddy/nginx에 CORP·COOP와
인라인 스타일 요소 차단을 적용했습니다. React 스타일 속성 및 카카오 우편번호 출처는
유지합니다. nginx 예시를 사용할 때 `nginx-security-headers.conf`를
`/etc/nginx/snippets/bokji-security-headers.conf`에 설치합니다. 이 예시는 HTTPS 전용 신뢰
게이트웨이 뒤의 서버이며 전달하는 HTTPS·Host 설정을 실제 환경에 맞게 검토해야 합니다.
프런트는 해시 라우팅을 사용하므로 없는 URL은 HTML 폴백 없이 404로 처리합니다.
적용 전 `nginx -t` 또는 공유 스크립트의 `caddy validate`가 필요합니다. 이번 추가 보완은
소스·배포 예시에 반영했으며 실행 중인 공개 서버를 재시작하지 않았습니다.

회원 주소 검색은 카카오 우편번호 SDK를 버튼 클릭 시 불러옵니다. `Caddyfile.tunnel`의 CSP에는 스크립트 `https://t1.kakaocdn.net`과 프레임 `https://postcode.map.kakao.com`, `https://postcode.map.daum.net`을 허용합니다. 별도 배포에서 CSP를 설정한다면 같은 출처를 허용해야 합니다. MySQL 배포에는 `python -m app.modules.auth init`으로 회원 주소 열도 준비합니다. [회원 주소 입력](../../docs/member-address.md).

2026-10-08 HTML 캐시: Caddy의 `/`, `/index.html`은 `Cache-Control: no-store`로
제공하고 ETag·Last-Modified 응답 헤더와 조건부 요청 검증자를 제거합니다. 이전 HTML의
보안 정책이 304 응답으로 재사용되는 상황을 피하고 새 문서와 CSP를 함께 반환합니다.
이 변경은 등록된 Caddy 웹 프로세스만 재시작해 공개 사이트에 적용했습니다. 실제 HTTPS
조건부 요청의 200·no-store, API health 200과 Chrome의 카카오 주소 검색·선택·자동 입력을
확인했습니다. 이미 열린 문서의 CSP는 새 문서를 열거나 새로고침할 때 갱신됩니다.
[Caddy 응답 헤더](https://caddyserver.com/docs/caddyfile/directives/header),
[요청 헤더](https://caddyserver.com/docs/caddyfile/directives/request_header).

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

2026-10-08 검색에서 비회원 상담으로 이어가는 경로 /api/v1/assistant/chat/dialogue도 @publicApi의 명시 경로로 전달합니다. 백엔드의 기존 요청 검증과 임시 비회원 쿠키를 유지합니다. test_tunnel_transport.py는 HTTPS 전달, HTTP 차단, 미허용 하위 경로 차단을 실제 격리 Caddy로 확인합니다.
