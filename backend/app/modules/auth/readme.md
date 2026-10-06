# 회원가입·로그인·카카오 로그인

2026-10-06: 일반·카카오 신규 가입의 이메일을 필수로 받으며 일반 가입은 SMTP 인증번호 확인 후 완료합니다. [SMTP 설정·인증 흐름](../../../docs/email-signup.md). 카카오에서 실명·나이·성별을 자동 입력하는 변경은 되돌렸습니다.

2026-10-03: 전화번호 인증 없이 일반 비밀번호 로그인과 웹 카카오 로그인을 제공합니다. 회원 정보·카카오 가입 대기 닉네임·금융 원입력의 AES 암호화와 아이디 HMAC 검색을 제거했습니다. [카카오 설정·흐름](../../../docs/kakao-login.md), [저장 구조와 기존 데이터 복원](../../../docs/member-privacy.md).

app/api/auth.py는 일반 가입·로그인·세션·회원 수정을, app/api/kakao_auth.py는 카카오 인가 코드 흐름을 처리합니다. service.AuthService는 계정과 7일 세션을 관리합니다. kakao.exchange_identity(settings, code)는 검증된 카카오 사용자 ID와 선택적 닉네임만 반환합니다. 토큰·시크릿은 반환하지 않습니다.

## 실행과 저장

`DB_ENABLED=false`이면 `AUTH_SQLITE_PATH`의 SQLite를 사용하며 회원 API 첫 호출에서 스키마를 자동 준비합니다. 회원 암호화/HMAC 키는 필요하지 않습니다. `DB_ENABLED=true`이면 MySQL을 사용하며 `python -m app.modules.auth init`으로 명시적으로 테이블을 초기화합니다. 같은 명령은 원래 키가 있는 경우 기존 암호화 데이터를 복원합니다. 기존 계정·세션·금융정보 ID와 비밀번호 해시는 보존합니다.

`auth_admin_grants`는 계정 ID에 관리자 권한을 연결합니다. 기존 등급 없는 권한은 `qr_admin`으로 갱신합니다. SQLite 회원 이관은 계정·관리자 권한·카카오 연결·세션·금융정보를 보존하며 충돌 시 덮어쓰지 않습니다. 재이관은 삭제한 세션·권한·카카오 연결·금융정보를 복구하지 않습니다. `create_operator(engine, username, password, *, role)`는 암호화 키 없이 관리자를 생성합니다. 공개 API는 최고 관리자 권한을 검사하고 QR 관리자만 생성할 수 있습니다.

## HTTP 계약

접두사 /v1/auth, 웹 프록시 /api/v1/auth. POST는 JSON과 X-Auth-Request: 1 필수입니다. 응답은 no-store이며 오류 detail은 입력값을 반사하지 않습니다.

| 메서드·경로 | 입력 | 성공 |
|---|---|---|
| POST /username/check | username | 소문자 username, available |
| POST /email/request | email | 인증 메일 발송, expires_in/resend_after, HttpOnly 가입 쿠키 |
| POST /email/verify | email, code, 가입 쿠키 | 인증 완료, expires_in |
| POST /signup | name, username, password, confirm_password, email, age, gender, region, 인증 완료 쿠키 | 201, message |
| POST /login | username, password | user, HttpOnly 세션 쿠키 |
| GET /me | 세션 쿠키 | user, 비로그인·만료는 401 |
| POST /profile | 세션 쿠키, 선택적 name, age, gender, region | 변경된 user |
| POST /logout | 빈 JSON | 서버 세션 폐기·쿠키 삭제 |
| GET /kakao/status | 없음 | enabled |
| POST /kakao/start | 빈 JSON | authorization_url, 임시 쿠키 |
| GET /kakao/callback | code/state 또는 error | 웹으로 303 이동 |
| GET /kakao/pending | 가입 대기 쿠키 | name |
| POST /kakao/complete | 필수 email, 선택적 기본 정보 | 201, user, 세션 쿠키 |
| POST /kakao/cancel | 빈 JSON | 가입 증명 폐기·가입 대기 쿠키 삭제 |

phone/request와 phone/verify는 삭제되어 404입니다. SignupInput은 phone·verification_token 등 계약 밖 필드를 422로 거부합니다. 전화번호는 신규 가입에서 수집하지 않습니다.

이름은 공백 제거 후 1~50자, 나이는 정수 0~120, 성별은 male/female/other/undisclosed, 지역은 17개 시도 약칭입니다. 일반 아이디는 영문·숫자·밑줄 4~20자이며 소문자로 저장합니다. 비밀번호는 영문+숫자 8~128자, 확인값 일치가 필요합니다. 기존 이름 없는 계정은 name=null입니다. 가입 시 나이는 자동 갱신하지 않습니다.

2026-10-06: 카카오 가입은 이메일만 필수로 입력하며 이메일 인증번호는 요구하지 않습니다. name은 전달된 표시 이름 또는 가입 대기 닉네임을 사용하고, 둘 다 없으면 null입니다. age/region은 null, gender는 undisclosed가 기본입니다. 회원 수정은 전달한 필드만 변경하고 name/age/region의 null을 허용합니다. 질문 API는 나이·지역이 없는 회원도 빈 문맥으로 안내합니다. 기존 스키마의 age/region/phone은 SQLite 테이블 재구성 또는 MySQL ALTER로 nullable로 갱신하며 계정 ID·기존 행·연결·세션을 보존합니다. MySQL은 배포 전 init을 실행합니다.

일반 가입은 IP당 시간당 20회, 로그인은 IP당 15분 50회·아이디당 10회입니다. 아이디 중복 확인은 IP당 1분 30회이며 소문자 아이디의 UNIQUE 열로 조회합니다. 아이디를 예약하지 않으므로 최종 가입 유일성 검사와 409 처리도 유지합니다. 카카오 시작/가입 완료는 IP당 15분 20회이며 초과 시 429입니다.

회원 수정은 로그인한 웹 세션의 계정 ID만 사용하고 이름·나이·성별·지역만 갱신합니다. 기존 아이디·비밀번호·전화번호·세션·관리자 권한은 보존하며 account_id·username·phone·password·권한 등 계약 밖 필드는 422로 거부합니다. user는 id/username/name/age/gender/region/email/email_verified이며 웹 응답은 DB에서 계산한 is_admin/admin_role도 포함합니다. 계정 자동 연결·탈퇴·비밀번호 재설정은 제공하지 않습니다.

## 모바일 호환

모바일은 기존 아이디/Bearer 인증을 유지합니다. AuthService.login/me/logout의 mobile=True는 웹 쿠키와 분리된 해시 영역을 사용하며 서버 콘솔의 console=True도 별도 해시 영역을 사용합니다. 서로 다른 범위의 쿠키·토큰은 복사해도 인증되지 않습니다. 이번 카카오 기능은 웹만 지원합니다.

## 개인정보 저장 보호

아이디·이름·이메일·나이·성별·지역은 일반 회원 열로, 카카오 가입 대기 닉네임은 `nickname`으로, 금융 원입력은 JSON으로 저장합니다. 비밀번호는 scrypt 해시, 세션·카카오 요청 토큰은 해시로 저장합니다. 예전 암호화 열은 호환성을 위해 남겨두지만 새 로그인에서는 사용하지 않습니다.

`privacy.LegacyCipher`는 이전 암호화 데이터를 읽는 명시적 이관에서만 사용합니다. 새 데이터를 암호화하는 API는 없습니다. `migration.restore_plaintext_data`와 `import_sqlite_accounts`의 복원 절차는 [저장 안내](../../../docs/member-privacy.md)를 참고하세요.

## 검증

backend/tests/test_email_auth.py, test_auth.py, test_auth_privacy.py, test_auth_merge.py, test_kakao_auth.py, test_mobile_auth.py, test_finance_api.py와 웹 tests/e2e/auth.spec.js에서 가입·로그인·세션·키 없는 로그인·계정 격리·기존 스키마 갱신·관리자 이관·카카오 취소/만료/재사용·브라우저 결합을 확인합니다. 카카오 실서비스 검증과 구분합니다.
