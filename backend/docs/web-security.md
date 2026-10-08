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

## 요청 한도와 호환성

일반 API 본문은 256 KiB, 서버 콘솔은 64 KiB, 콘솔 공고 편집 PATCH는 1 MiB입니다. `Content-Length`가 없거나 거짓이어도 실제 수신 크기로 제한합니다. 기존 빈 본문 로그아웃은 지원합니다. 브라우저 메타데이터가 없는 네이티브 앱·CLI는 기존 인증 헤더와 토큰 검사를 사용합니다. 카카오의 GET 콜백은 쓰기 요청 검사 대상에서 제외하며 기존 state·쿠키 검사를 유지합니다.

허용된 교차 출처 웹 클라이언트만 `CORS_ORIGINS`에 정확한 `scheme://host[:port]` 형식으로 등록합니다. API 요청을 프록시할 때 원래 Host를 보존하고, HTTPS 종료 프록시의 `X-Forwarded-Proto`는 신뢰하는 프록시에서만 받아야 합니다. 개발용 Vite 프록시는 Host를 보존하도록 설정합니다.

## 배포 반영

`scripts/share-server.py`는 외부 공개 실행 시 `APP_ENV=production`을 강제하여 Secure 세션 쿠키를 사용합니다. 개발용 직접 실행 설정은 별도로 유지합니다. 외부 MySQL 회원 DB는 [회원 DB 보안 설정](member-privacy.md)의 CA 요구사항도 확인해야 합니다.

`frontend/web/deploy/Caddyfile.tunnel`은 CSP의 `base-uri`와 `frame-ancestors`를 `none`으로 제한하고 프레임 차단·브라우저 권한 제한을 적용합니다. 카카오 주소 검색에 필요한 스크립트와 프레임 출처, 현재 화면에 필요한 인라인 스타일 허용은 유지합니다. API의 카카오 인증 응답에 지정된 `no-referrer` 정책을 프록시와 공통 미들웨어가 덮어쓰지 않습니다.

웹을 다시 빌드하고 공유 API와 Caddy 설정을 다시 불러와야 실행 중인 사이트에 반영됩니다. 이번 코드 수정으로 운영 프로세스를 재시작하거나 공개 사이트를 배포하지는 않습니다. 별도 nginx 구성은 Host·HTTPS 전달과 CSP를 그 환경에 맞게 적용해야 합니다.

## 검증

2026-10-08 최종 검사: 백엔드 회귀 검사 364개 통과, POSIX 프로세스 실행 전용 1개는 Windows에서 제외했습니다. 프런트엔드 단위 검사 122개, 실제 브라우저 검사 9개, 웹 빌드, Ruff·Prettier·JavaScript 구문 및 패치 검사를 통과했습니다. 로컬 Caddy 실행 파일이 없어 Caddy 설정의 실행 검증은 수행하지 않았으며, 공유 배포 스크립트는 설정 반영 전에 `caddy validate`를 실행합니다.

- `tests/test_web_security.py`: 출처 위조·서브도메인·중복 헤더·비 JSON·큰 본문·중복 및 깊은 JSON·SQL/XSS 문자열·SSRF 주소·운영 명령 인자 공격 입력을 검사합니다.
- `frontend/web/tests/web-security.test.js`: 외부 링크의 실행 스킴과 모호한 URL을 거부하는지 검사합니다.
- `frontend/web/tests/e2e/policy-source.spec.js`: 실제 브라우저에서 악성 HTML이 텍스트로 표시되고 실행 링크가 생성되지 않는지 검사합니다.
- 기존 인증·카카오·모바일·회원 주소·금융·관리자 API의 회귀 검사를 함께 실행합니다.

참고: [OWASP CSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP SSRF 방어](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [OWASP XSS 방어](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [Caddy 응답 헤더의 기본값 설정](https://caddyserver.com/docs/caddyfile/directives/header).
