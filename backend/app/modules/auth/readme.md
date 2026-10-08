# 회원가입·로그인·카카오 로그인

2026-10-08: 회원 전용 접속 풀, SQL 바인딩 값 숨김, 원격 운영 MySQL의 인증서·호스트명 검증 및 TLS 미사용 연결 거부, SQLite 보안 삭제를 적용했습니다. 회원 DB 전용 자격 증명은 `AUTH_DB_USER/PASSWORD`, CA는 `AUTH_DB_SSL_CA`로 설정할 수 있습니다. 프로필 저장 시 트랜잭션에서 웹 세션을 다시 검증하고 로그인 중 비밀번호가 변경되면 세션을 발급하지 않습니다. [운영 설정·검증·저장 보호의 범위](../../../docs/member-privacy.md).

2026-10-07: 신규 가입은 버전이 있는 개인정보 안내의 명시적 필수 동의를 확인하며 선택 프로필·외부 AI 처리 동의를 각각 기록합니다. 이름·나이·성별·지역·우편번호·주소·상세주소는 선택 입력이며 선택 프로필 동의가 없으면 저장하지 않습니다. [가입 동의·AI 처리 안내](../../../docs/privacy-consent.md).

2026-10-06: 일반·카카오 신규 가입의 이메일을 필수로 받으며 일반 가입은 SMTP 인증번호 확인 후 완료합니다. [SMTP 설정·인증 흐름](../../../docs/email-signup.md). 카카오에서 실명·나이·성별을 자동 입력하는 변경은 되돌렸습니다.

2026-10-03: 전화번호 인증 없이 일반 비밀번호 로그인과 웹 카카오 로그인을 제공합니다. 회원 정보·카카오 가입 대기 닉네임·금융 원입력의 AES 암호화와 아이디 HMAC 검색을 제거했습니다. [카카오 설정·흐름](../../../docs/kakao-login.md), [저장 구조와 기존 데이터 복원](../../../docs/member-privacy.md).

app/api/auth.py는 일반 가입·로그인·세션·회원 수정을, app/api/kakao_auth.py는 카카오 인가 코드 흐름을 처리합니다. service.AuthService는 계정과 7일 세션을 관리합니다. kakao.exchange_identity(settings, code)는 검증된 카카오 사용자 ID와 선택적 닉네임만 반환합니다. 토큰·시크릿은 반환하지 않습니다.

## 실행과 저장

`DB_ENABLED=false`이면 `AUTH_SQLITE_PATH`의 SQLite를 사용하며 회원 API 첫 호출에서 스키마를 자동 준비합니다. 회원 암호화/HMAC 키는 필요하지 않습니다. `DB_ENABLED=true`이면 MySQL을 사용하며 `python -m app.modules.auth init`으로 명시적으로 테이블을 초기화합니다. 같은 명령은 원래 키가 있는 경우 기존 암호화 데이터를 복원합니다. 기존 계정·세션·금융정보 ID와 비밀번호 해시는 보존합니다.

`auth_admin_grants`는 계정 ID에 관리자 권한을 연결합니다. 기존 등급 없는 권한은 `qr_admin`으로 갱신합니다. SQLite 회원 이관은 계정·관리자 권한·카카오 연결·세션·금융정보·기록된 동의를 보존하며 충돌 시 덮어쓰지 않습니다. 재이관은 삭제한 세션·권한·카카오 연결·금융정보·동의를 복구하지 않습니다. 원본에 동의 기록이 없는 회원은 기록을 만들지 않습니다. `create_operator(engine, username, password, *, role)`는 암호화 키 없이 관리자를 생성합니다. 공개 API는 최고 관리자 권한을 검사하고 QR 관리자만 생성할 수 있습니다.

## HTTP 계약

접두사 /v1/auth, 웹 프록시 /api/v1/auth. POST는 JSON과 X-Auth-Request: 1 필수입니다. 응답은 no-store이며 오류 detail은 입력값을 반사하지 않습니다.

| 메서드·경로 | 입력 | 성공 |
|---|---|---|
| POST /username/check | username | 소문자 username, available |
| POST /email/request | email | 인증 메일 발송, expires_in/resend_after, HttpOnly 가입 쿠키 |
| POST /email/verify | email, code, 가입 쿠키 | 인증 완료, expires_in |
| POST /signup | username, password, confirm_password, email, consent, 선택적 name/age/gender/region/postal_code/address/address_detail, 인증 완료 쿠키 | 201, message |
| GET /privacy-notice | 없음 | 안내 버전, 운영자·연락처·보유기간, AI 처리 준비 상태 |
| POST /login | username, password | user, HttpOnly 세션 쿠키 |
| GET /me | 세션 쿠키 | user, 비로그인·만료는 401 |
| POST /profile | 세션 쿠키, 선택적 name, age, gender, region, postal_code, address, address_detail | 변경된 user |
| POST /logout | 빈 JSON | 서버 세션 폐기·쿠키 삭제 |
| POST /withdraw | 웹 세션 쿠키, confirmation=true, 현재 notice_version | 자신의 회원정보·금융정보·알림 기기·동의·연결·세션 즉시 삭제 |
| GET /kakao/status | 없음 | enabled |
| POST /kakao/start | 빈 JSON | authorization_url, 임시 쿠키 |
| GET /kakao/callback | code/state 또는 error | 웹으로 303 이동 |
| GET /kakao/pending | 가입 대기 쿠키 | name |
| POST /kakao/complete | 필수 email/consent, 선택적 기본 정보 | 201, user, 세션 쿠키 |
| POST /kakao/cancel | 빈 JSON | 가입 증명 폐기·가입 대기 쿠키 삭제 |

phone/request와 phone/verify는 삭제되어 404입니다. SignupInput은 phone·verification_token 등 계약 밖 필드를 422로 거부합니다. 전화번호는 신규 가입에서 수집하지 않습니다.

이름은 공백 제거 후 1~50자, 나이는 정수 0~120, 성별은 male/female/other/undisclosed, 지역은 17개 시도 약칭입니다. 일반 아이디는 영문·숫자·밑줄 4~20자이며 소문자로 저장합니다. 비밀번호는 영문+숫자 8~128자, 확인값 일치가 필요합니다. 기존 이름 없는 계정은 name=null입니다. 가입 시 나이는 자동 갱신하지 않습니다.

2026-10-07: 일반·카카오 가입의 `consent`는 `notice_version="2026-10-07.3"`, 엄격한 불리언 `collection=true`가 필수입니다. `profile`·`ai`는 생략하면 false입니다. 미동의·문자열/숫자 불리언·예전 버전을 422로 거부합니다. `auth_consents`는 계정 ID마다 안내 버전·선택 내역·서버 동의 시각을 가입과 같은 트랜잭션으로 저장합니다. 기존 회원에 동의를 소급 생성하지 않습니다. 외부 AI 동의는 별도 안내의 준비 상태와 `ai_notice_version`을 검증합니다.

카카오 가입은 이메일과 동의 입력이 필수이며 이메일 인증번호는 요구하지 않습니다. 선택 프로필에 동의하면 name은 전달된 표시 이름 또는 가입 대기 닉네임을 사용하고, 둘 다 없으면 null입니다. age/region은 null, gender는 undisclosed가 기본입니다. 회원 수정은 전달한 필드만 변경하고 name/age/region의 null을 허용합니다. 질문 API는 나이·지역이 없는 회원도 빈 문맥으로 안내합니다. 기존 스키마의 age/region/phone은 SQLite 테이블 재구성 또는 MySQL ALTER로 nullable로 갱신하며 계정 ID·기존 행·연결·세션을 보존합니다. MySQL은 배포 전 init을 실행합니다.

일반 가입은 IP당 시간당 20회, 로그인은 IP당 15분 50회·아이디당 10회입니다. 아이디 중복 확인은 IP당 1분 30회이며 소문자 아이디의 UNIQUE 열로 조회합니다. 아이디를 예약하지 않으므로 최종 가입 유일성 검사와 409 처리도 유지합니다. 카카오 시작/가입 완료는 IP당 15분 20회이며 초과 시 429입니다.

회원 수정은 로그인한 웹 세션의 계정 ID만 사용하고 이름·나이·성별·지역·우편번호·주소·상세주소를 갱신합니다. 기존 아이디·비밀번호·전화번호·세션·관리자 권한은 보존하며 account_id·username·phone·password·권한 등 계약 밖 필드는 422로 거부합니다. user는 id/username/name/age/gender/region/postal_code/address/address_detail/email/email_verified이며 웹 응답은 DB에서 계산한 is_admin/admin_role도 포함합니다. 회원 탈퇴는 `POST /withdraw`로 제공하며 현재 웹 세션의 자신의 계정과 주소를 즉시 삭제합니다. 계정 자동 연결·비밀번호 재설정은 제공하지 않습니다. 개인정보 삭제·동의 철회 문의는 개인정보 문의 이메일로 접수합니다.

주소 검색에서 선택한 기본주소는 `address`, 5자리 숫자 우편번호는 `postal_code`, 직접 입력한 상세주소는 `address_detail`로 저장합니다. 주소·상세주소는 앞뒤 공백 제거 후 최대 200자이며 제어문자를 허용하지 않습니다. 세 필드 모두 선택 입력이고 null 또는 빈 문자열로 지울 수 있습니다. 지역 `region`은 기존 시도 약칭으로 유지해 추천에 사용하며 정확한 주소는 AI 질문의 회원 문맥에 자동 첨부하지 않습니다. 기존 계정의 주소는 null이며 세 nullable 열을 더하는 반복 가능한 초기화로 계정·기존 정보·세션을 보존합니다. 주소를 모르는 이전 클라이언트가 다른 프로필 필드만 갱신하면 저장된 주소를 유지합니다.

주소 항목이 추가된 회원 안내 .3은 외부 AI 전달 항목을 바꾸지 않습니다. 기존 .2 회원의 명시적 AI 동의는 별도 AI 안내 지문이 현재 설정과 일치할 때만 계속 인정하고 원래 동의 기록을 보존합니다. .1 등 다른 회원 안내나 변경된 AI 수탁자·항목·보유기간에 대한 동의는 인정하지 않습니다.

## 모바일 호환

모바일은 기존 아이디/Bearer 인증을 유지합니다. AuthService.login/me/logout의 mobile=True는 웹 쿠키와 분리된 해시 영역을 사용하며 서버 콘솔의 console=True도 별도 해시 영역을 사용합니다. 서로 다른 범위의 쿠키·토큰은 복사해도 인증되지 않습니다. 이번 카카오 기능은 웹만 지원합니다.

## 개인정보 저장 보호

아이디·이름·이메일·나이·성별·지역·우편번호·주소·상세주소는 일반 회원 열로, 카카오 가입 대기 닉네임은 `nickname`으로, 금융 원입력은 JSON으로 저장합니다. 비밀번호는 scrypt 해시, 세션·카카오 요청 토큰은 해시로 저장합니다. 예전 암호화 열은 호환성을 위해 남겨두지만 새 로그인에서는 사용하지 않습니다.

`privacy.LegacyCipher`는 이전 암호화 데이터를 읽는 명시적 이관에서만 사용합니다. 새 데이터를 암호화하는 API는 없습니다. `migration.restore_plaintext_data`와 `import_sqlite_accounts`의 복원 절차는 [저장 안내](../../../docs/member-privacy.md)를 참고하세요.

## 검증

backend/tests/test_member_address.py, test_email_auth.py, test_auth.py, test_auth_privacy.py, test_auth_merge.py, test_kakao_auth.py, test_mobile_auth.py, test_finance_api.py와 웹 tests/e2e/auth.spec.js에서 주소 저장·검증·선택 동의·탈퇴 삭제·가입·로그인·세션·키 없는 로그인·계정 격리·기존 스키마 갱신·관리자 이관·카카오 취소/만료/재사용·브라우저 결합을 확인합니다. 카카오 실서비스 검증과 구분합니다.
