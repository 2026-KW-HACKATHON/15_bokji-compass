# 웹 회원가입·로그인

2026-10-02: AuthPage({type, onLogin, easy})는 전화번호 없는 일반 가입과 카카오 로그인을 제공합니다. 일반 가입은 계정 정보→기본 정보의 2단계이며 쉬운 화면에서 단계별 검증·초점 이동·입력 보존을 지원합니다. 기존 아이디·비밀번호 로그인은 유지합니다.

카카오 버튼은 서버 kakao/status가 enabled=true일 때 활성화합니다. kakao/start의 고정 카카오 인증 주소로 이동하고 서버 콜백이 기존 회원은 홈, 신규 회원은 #signup?kakao=complete로 돌려보냅니다. 신규 회원은 kakao/pending으로 인증 상태를 확인한 뒤 이름·만 나이·성별·시도만 입력합니다. 전화번호·아이디·비밀번호를 추가로 요구하지 않습니다. 취소/오류/만료 안내와 재시도 버튼을 제공합니다.

authApi.js는 credentials=include, X-Auth-Request: 1, 15초 제한을 사용합니다. 비밀번호·카카오 토큰·시크릿을 브라우저 저장소에 기록하지 않습니다. 기존 App의 /me 세션 복원과 onLogin을 재사용합니다.

[서버 계약](../../../../../backend/app/modules/auth/readme.md), [카카오 개발자 설정](../../../../../backend/docs/kakao-login.md). tests/e2e/auth.spec.js는 실제 일반 가입 API와 대역 기반 카카오 화면을 데스크톱·모바일 크기에서 확인합니다. 실제 카카오 동의 화면 테스트는 앱 설정 후 별도 수행합니다.

2026-10-02: 서버 회원 저장은 MySQL+개인정보 암호화로 전환했으며 웹 HTTP 계약은 유지합니다. Playwright는 APP_ENV=test의 격리 SQLite와 실행별 독립 암호화/HMAC 테스트 키를 사용하며 실제 서버 키를 사용하지 않습니다. [서버 저장 보안](../../../../../backend/docs/member-privacy.md).
