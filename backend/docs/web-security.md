# 웹 공격 방어

사용자 정보 API와 웹 화면의 입력·출력 경계에 방어를 적용합니다. 공고 DB의 스키마와 데이터를 변경하지 않습니다.

| 대상 | 적용 내용 |
| --- | --- |
| XSS | React의 텍스트 렌더링을 유지하고, 공고·신청·금융·관리자 화면의 외부 링크에 HTTP(S) 허용 목록을 적용합니다. 실행 가능한 스킴, 인증정보, 제어 문자, 역슬래시, 2,048자 초과 URL을 거부합니다. 금융 근거 링크는 HTTPS만 허용합니다. |
| CSRF | `/v1/` 쓰기 요청의 `Origin`을 현재 요청의 정확한 출처 또는 명시적 `CORS_ORIGINS`와 비교합니다. 같은 사이트의 다른 서브도메인도 자동 신뢰하지 않습니다. Fetch Metadata와 중복 보안 헤더를 검사하고, 인증 API의 `X-Auth-Request: 1` 검사를 POST·PUT·PATCH·DELETE에 적용합니다. 서버 콘솔은 자체 출처만 허용합니다. |
| SSRF | 외부 공고 HTTP 전송의 기존 호스트 허용 목록, 리다이렉트 검사, DNS 검증과 IP 고정을 유지합니다. 모든 DNS 응답에서 내부·루프백·메타데이터·멀티캐스트·IPv6 전환 주소를 거부하고 NAT64 주소의 내장 IPv4도 검사합니다. |
| Command Injection | 운영 명령의 동작·대상·작업 UUID를 실행 직전에 검사합니다. 고정 실행 파일과 인자 배열을 사용하며, 운영 및 모델 프로세스에 `shell=False`를 명시합니다. 모델에 전달되는 입력은 표준 입력의 JSON입니다. |
| SQL Injection | 회원 쿼리의 SQLAlchemy 파라미터 바인딩과 계정별 조건을 유지합니다. 로그인 입력의 추가 필드를 금지합니다. SQL 구문을 포함한 프로필 문자열이 그대로 저장되면서 다른 계정에는 영향을 주지 않는지 회귀 검사합니다. |
| 비정상 입력·자원 사용 | JSON 파싱 전에 실제 수신 본문 크기를 검사합니다. 본문이 있는 쓰기 요청은 `application/json`만 허용하고, 잘못된 JSON·중복 필드·파서 한도를 넘는 중첩 입력을 민감정보 없는 422 응답으로 거부합니다. |

## 2026-10-08 추가 점검: 조회 격리·DOM·CSS·경로 해석

이번 점검에서 확인한 방어 공백과 보완 내용입니다. 아래 재현은 로컬 코드와 테스트 환경을
대상으로 하며, 실제 회원 정보 추출이나 공개 사이트 침투를 수행한 결과는 아닙니다.

| 지점 | 발견한 문제와 수정 |
| --- | --- |
| XS-Search / XS-Leaks | 기존 출처 검사는 쓰기 요청만 검사했습니다. `/v1/policies?eligible_only=true&q=...`와 회원 조회에 다른 사이트/같은 사이트의 다른 출처가 GET·HEAD 요청을 보내면 인증·검색 경로까지 도달할 수 있었습니다. 이제 `Origin`과 Fetch Metadata를 검사하고 미허용 요청은 인증·DB 접근 전에 동일한 403으로 거부합니다. 이미지·스크립트·iframe과 외부 최상위 탐색도 포함합니다. 정확히 등록된 CORS 출처의 `cors`/`empty` fetch는 허용합니다. |
| DOM 설정 / URL 해석 | API 주소 검사식이 `/\\evil.example` 같은 역슬래시 경로와 일부 잘못된 절대 주소를 허용했습니다. 브라우저의 URL 정규화가 요청 대상을 바꿀 수 있어 제어 문자·역슬래시·인증정보·잘못된 주소를 거부하고 HTTP(S) 주소를 파싱합니다. 런타임 설정은 자체 문자열 속성을 가진 일반 객체만 읽어 DOM named property, 상속 속성과 getter가 설정값으로 사용되지 않도록 보완했습니다. 설정을 변조할 수 있는 경로가 있다는 전제의 방어이며, 독립적인 HTML 삽입 취약점이 확인된 것은 아닙니다. |
| CSS Injection | Caddy의 기존 `style-src 'unsafe-inline'`은 삽입된 `<style>`에도 적용됐습니다. `style-src-elem 'self'`로 인라인 스타일 요소·외부 스타일시트를 제한합니다. 정상 React 스타일에 필요한 `style-src-attr 'unsafe-inline'`은 유지하며, 입력에서 임의 스타일 속성을 만드는 경로는 발견하지 못했습니다. `script-src-attr 'none'`도 명시했습니다. |
| RPO / 배포 헤더 | nginx 예시에는 보안 헤더가 일부 경로에만 있었고 없는 경로도 `index.html`을 반환했습니다. 해시 라우팅에 맞게 없는 경로를 404로 처리하고 모든 경로에 nosniff·CSP·프레임 제한을 적용합니다. `add_header`로 상속이 끊기는 각 location에도 공통 헤더 파일을 포함합니다. 루트 HTML은 no-store로 반환합니다. 기존 문서는 doctype과 루트 기준 자산 경로를 사용하며, 실제 RPO exploit을 확인한 것은 아닙니다. |
| CSTI / DOM XSS | 템플릿 문자열 평가, `eval`, HTML 삽입 API를 통한 사용자 데이터 렌더링은 발견하지 못했습니다. 빌드된 React 화면에서 `{{constructor.constructor(...)()}}`, `<style>`, 설정 이름의 `<form>`이 텍스트로 남는지 회귀 검사합니다. |

API·콘솔·전시 QR 서버와 배포 설정에 `Cross-Origin-Resource-Policy: same-origin` 및
`Cross-Origin-Opener-Policy: same-origin`을 적용했습니다. API 응답의 CSP와 no-store,
`Vary: Origin, Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest`를 함께 사용합니다.
CORP는 다른 출처의 no-cors 리소스 삽입을 제한하며, 명시적으로 허용한 CORS fetch를 막지 않습니다.

카카오 웹 콜백과 모바일 authorize의 정확한 두 경로만 외부 최상위 탐색 예외로 둡니다.
해당 경로도 iframe·이미지·fetch 형태로 흐름을 소비하지 못하도록 검사하며 기존 state·쿠키·
PKCE·일회용 검증을 유지합니다. Fetch Metadata가 없는 네이티브 앱·CLI의 요청은 기존 인증을
사용합니다. 이 호환성 때문에 메타데이터를 보내지 않는 구형 브라우저에는 같은 수준의
요청 출처 차단을 보장하지 않습니다.

추가 검증 파일은 `tests/test_web_security.py`, 웹 `tests/web-security.test.js`와
`tests/e2e/production-security.spec.js`입니다. 마지막 파일은 빌드된 dist에 Caddy 설정의
실제 CSP 문자열을 적용한 격리 테스트 서버를 사용합니다. Caddy/nginx 자체 실행 검증이나
실제 카카오 서비스 연동 검증을 대신하지 않습니다.

모바일 의존성의 braces 재귀 취약점도 로컬 깊이 제한과 설치 후 해시 검사로 보완했습니다.
기존 Forge 서명 검증 패치와 함께 적용하며 npm audit의 버전 기반 경고는 남습니다.
[모바일 수정과 남은 경고](../../frontend/docs/mobile-security-review.md)를 참고합니다.

## 요청 한도와 호환성

일반 API 본문은 256 KiB, 서버 콘솔은 64 KiB, 콘솔 공고 편집 PATCH는 1 MiB입니다. `Content-Length`가 없거나 거짓이어도 실제 수신 크기로 제한합니다. 기존 빈 본문 로그아웃은 지원합니다. 브라우저 메타데이터가 없는 네이티브 앱·CLI는 기존 인증 헤더와 토큰 검사를 사용합니다. 카카오의 GET 콜백은 쓰기 요청 검사 대상에서 제외하며 기존 state·쿠키 검사를 유지합니다.

허용된 교차 출처 웹 클라이언트만 `CORS_ORIGINS`에 정확한 `scheme://host[:port]` 형식으로 등록합니다. API 요청을 프록시할 때 원래 Host를 보존하고, HTTPS 종료 프록시의 `X-Forwarded-Proto`는 신뢰하는 프록시에서만 받아야 합니다. 개발용 Vite 프록시는 Host를 보존하도록 설정합니다.

## 배포 반영

`scripts/share-server.py`는 외부 공개 실행 시 `APP_ENV=production`을 강제하여 Secure 세션 쿠키를 사용합니다. 개발용 직접 실행 설정은 별도로 유지합니다. 외부 MySQL 회원 DB는 [회원 DB 보안 설정](member-privacy.md)의 CA 요구사항도 확인해야 합니다.

`frontend/web/deploy/Caddyfile.tunnel`은 CSP의 `base-uri`와 `frame-ancestors`를 `none`으로 제한하고 프레임 차단·브라우저 권한 제한을 적용합니다. 카카오 주소 검색에 필요한 스크립트와 프레임 출처, 정상 스타일 속성 허용은 유지하며 인라인 스타일 요소는 차단합니다. API의 카카오 인증 응답에 지정된 `no-referrer` 정책을 프록시와 공통 미들웨어가 덮어쓰지 않습니다.

웹을 다시 빌드하고 공유 API와 Caddy 설정을 다시 불러와야 실행 중인 사이트에 반영됩니다. 이번 코드 수정으로 운영 프로세스를 재시작하거나 공개 사이트를 배포하지는 않습니다. nginx 예시는 `frontend/web/deploy/nginx-security-headers.conf`를 `/etc/nginx/snippets/bokji-security-headers.conf`에 설치한 뒤 사용합니다. HTTPS 전용 신뢰 게이트웨이 뒤에 둔 예시이며, Host·HTTPS 전달과 인증서를 실제 환경에 맞게 적용하고 `nginx -t` 후 다시 불러와야 합니다.

## 검증

이번 추가 점검: 백엔드 보안 검사 92개와 인증·모바일·검색·번역·금융·관리자 회귀 259개가
통과했습니다(별도 1개 제외). 웹 단위 검사 158개와 웹 빌드, 기존 브라우저 회귀 70개,
빌드의 배포 CSP를 적용한 새 브라우저 보안 검사 6개가 통과했습니다. Ruff·Prettier·패치 검사도
통과했습니다. 실제 Caddy/nginx 실행 파일의 설정 검사와 운영 서버 재시작은 수행하지 않았습니다.
모바일은 새 설치 후 전체 테스트 146개, 타입·린트, Android/iOS 번들 export가 통과했으며
두 로컬 의존성 패치의 자동 적용을 확인했습니다.

2026-10-08 앞선 보완 때 검사: 백엔드 회귀 검사 364개 통과, POSIX 프로세스 실행 전용 1개는 Windows에서 제외했습니다. 프런트엔드 단위 검사 122개, 실제 브라우저 검사 9개, 웹 빌드, Ruff·Prettier·JavaScript 구문 및 패치 검사를 통과했습니다. 로컬 Caddy 실행 파일이 없어 Caddy 설정의 실행 검증은 수행하지 않았으며, 공유 배포 스크립트는 설정 반영 전에 `caddy validate`를 실행합니다.

- `tests/test_web_security.py`: 출처 위조·서브도메인·중복 헤더·비 JSON·큰 본문·중복 및 깊은 JSON·SQL/XSS 문자열·SSRF 주소·운영 명령 인자 공격 입력을 검사합니다.
- `frontend/web/tests/web-security.test.js`: 외부 링크의 실행 스킴과 모호한 URL을 거부하는지 검사합니다.
- `frontend/web/tests/e2e/policy-source.spec.js`: 실제 브라우저에서 악성 HTML이 텍스트로 표시되고 실행 링크가 생성되지 않는지 검사합니다.
- 기존 인증·카카오·모바일·회원 주소·금융·관리자 API의 회귀 검사를 함께 실행합니다.

참고: [OWASP CSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP SSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP XSS 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [Caddy 응답 헤더의 기본값 설정](https://caddyserver.com/docs/caddyfile/directives/header).

추가 방어 근거: [XS-Leaks 요청 격리](https://xsleaks.dev/docs/defenses/isolation-policies/resource-isolation/), [OWASP DOM Clobbering 방어](https://cheatsheetseries.owasp.org/cheatsheets/DOM_Clobbering_Prevention_Cheat_Sheet.html), [CSP 스타일 지시어](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src), [nginx 헤더 상속](https://nginx.org/en/docs/http/ngx_http_headers_module.html).
