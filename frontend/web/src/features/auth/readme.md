# 회원가입·로그인

`AuthPage({type, onLogin})`는 아이디 로그인 및 회원가입 폼입니다. 가입 시 이름·비밀번호 확인·만 나이·성별·시도·전화번호 인증을 받습니다. 로그인 후 App은 user.name으로 이름을 표시하며 기존 이름 없는 계정은 ‘회원님’으로 표시합니다. 전화번호 변경 시 인증 상태를 지우며 재전송·만료 시간을 표시합니다. 개발용 인증번호는 서버가 development_code를 반환할 때만 표시하며 실제 미발송 안내를 함께 보여줍니다.

`authApi.js`는 dataMode와 관계없이 실제 인증 서버를 호출합니다. credentials=include, X-Auth-Request 헤더, 15초 제한을 사용합니다. 비밀번호·인증 증명은 localStorage에 저장하지 않습니다. 세션 쿠키는 서버가 설정하며 App에서 /me로 로그인 상태를 복원합니다. 인증 성공을 가정하는 브라우저 전용 대체 모드는 없습니다.

[서버 계약·실행법](../../../../../backend/app/modules/auth/readme.md). 실제 문자 발송은 미연결입니다. 검증은 tests/e2e/auth.spec.js 및 app.spec.js에서 진행합니다.
