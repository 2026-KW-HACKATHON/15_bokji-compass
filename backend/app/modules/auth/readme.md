# 회원가입·로그인·카카오 로그인

2026-10-02: 전화번호 인증을 제거하고 기존 비밀번호 로그인과 웹 카카오 로그인을 제공합니다. 로컬의 단계별 일반 가입, 아이디 중복 확인, 회원 정보 수정, 관리자 권한도 같은 암호화 계정 저장소를 사용합니다. [카카오 설정·흐름](../../../docs/kakao-login.md), [관리자 설정](../admin/readme.md).

app/api/auth.py는 일반 가입·로그인·세션·회원 수정을, app/api/kakao_auth.py는 카카오 인가 코드 흐름을 처리합니다. service.AuthService는 계정과 7일 세션을 관리합니다. kakao.exchange_identity(settings, code)는 검증된 카카오 사용자 ID와 선택적 닉네임만 반환합니다. 토큰·시크릿은 반환하지 않습니다.

## 실행과 저장

개발·운영 회원 저장은 MySQL입니다. DB_ENABLED=false이면 회원 API는 503이며 SQLite는 APP_ENV=test의 격리 테스트만 허용합니다. 서버 암호화/HMAC 키가 필수이며 backend에서 .venv/Scripts/python.exe -m app.modules.auth로 명시적으로 초기화/암호화합니다. [키 생성·MySQL 이관·키 교체·검증](../../../docs/member-privacy.md). 신규 카카오 테이블과 phone nullable 전환은 기존 계정·세션·금융정보의 ID를 보존합니다. 이전 전화번호 인증 테이블은 사용하지 않으며 자동 삭제하지 않습니다.

auth_admin_grants는 계정 ID에 관리자 권한을 연결합니다. 기존 등급 없는 권한 행은 qr_admin으로 갱신합니다. SQLite 회원 이관은 관리자 권한도 보존하며 목적지 권한과 충돌하면 덮어쓰지 않고 실패합니다. 재이관은 기존 목적지 계정의 삭제한 세션·권한·카카오 연결·금융정보를 복원하지 않습니다. 소스 계정이 없는 연결 행은 이관 전체를 롤백합니다. create_operator(engine, username, password, *, cipher, role)는 초기화된 저장소와 명시적으로 주입된 PrivacyCipher를 사용합니다. 공개 API는 호출자의 최고 관리자 권한을 먼저 검증하고 qr_admin만 생성할 수 있습니다.

## HTTP 계약

접두사 /v1/auth, 웹 프록시 /api/v1/auth. POST는 JSON과 X-Auth-Request: 1 필수입니다. 응답은 no-store이며 오류 detail은 입력값을 반사하지 않습니다.

| 메서드·경로 | 입력 | 성공 |
|---|---|---|
| POST /username/check | username | 소문자 username, available |
| POST /signup | name, username, password, confirm_password, age, gender, region | 201, message |
| POST /login | username, password | user, HttpOnly 세션 쿠키 |
| GET /me | 세션 쿠키 | user, 비로그인·만료는 401 |
| POST /profile | 세션 쿠키, name, age, gender, region | 변경된 user |
| POST /logout | 빈 JSON | 서버 세션 폐기·쿠키 삭제 |
| GET /kakao/status | 없음 | enabled |
| POST /kakao/start | 빈 JSON | authorization_url, 임시 쿠키 |
| GET /kakao/callback | code/state 또는 error | 웹으로 303 이동 |
| GET /kakao/pending | 가입 대기 쿠키 | name |
| POST /kakao/complete | name, age, gender, region | 201, user, 세션 쿠키 |

phone/request와 phone/verify는 삭제되어 404입니다. SignupInput은 phone·verification_token 등 계약 밖 필드를 422로 거부합니다. 전화번호는 신규 가입에서 수집하지 않습니다.

이름은 공백 제거 후 1~50자, 나이는 정수 0~120, 성별은 male/female/other/undisclosed, 지역은 17개 시도 약칭입니다. 일반 아이디는 영문·숫자·밑줄 4~20자이며 소문자로 저장합니다. 비밀번호는 영문+숫자 8~128자, 확인값 일치가 필요합니다. 기존 이름 없는 계정은 name=null입니다. 가입 시 나이는 자동 갱신하지 않습니다.

일반 가입은 IP당 시간당 20회, 로그인은 IP당 15분 50회·아이디당 10회입니다. 아이디 중복 확인은 IP당 1분 30회이며 HMAC 검색 인덱스로 조회합니다. 아이디를 예약하지 않으므로 최종 가입 유일성 검사와 409 처리도 유지합니다. 카카오 시작/가입 완료는 IP당 15분 20회이며 초과 시 429입니다.

회원 수정은 로그인한 웹 세션의 계정 ID만 사용하고 이름·나이·성별·지역만 재암호화합니다. 기존 아이디·비밀번호·전화번호·세션·관리자 권한은 보존하며 account_id·username·phone·password·권한 등 계약 밖 필드는 422로 거부합니다. user는 id/username/name/age/gender/region이며 웹 응답은 DB에서 계산한 is_admin/admin_role도 포함합니다. 계정 자동 연결·탈퇴·비밀번호 재설정은 제공하지 않습니다.

## 모바일 호환

모바일은 기존 아이디/Bearer 인증을 유지합니다. AuthService.login/me/logout의 mobile=True는 웹 쿠키와 분리된 해시 영역을 사용하며 서버 콘솔의 console=True도 별도 해시 영역을 사용합니다. 서로 다른 범위의 쿠키·토큰은 복사해도 인증되지 않습니다. 이번 카카오 기능은 웹만 지원합니다.

## 개인정보 저장 보호

아이디·이름·나이·성별·지역·기존 전화번호는 profile_ciphertext에 AES-256-GCM으로 암호화합니다. 아이디 검색과 중복 확인은 독립 HMAC 키의 username_lookup UNIQUE 인덱스를 사용합니다. 기존 평문 열은 자리표시자로 바꾸며 런타임 평문 복호화 우회는 없습니다. 카카오 가입 대기 닉네임과 계정별 소득·재산 원입력도 암호화합니다. 키는 서버 환경에서만 읽으며 기존 비밀번호 scrypt·세션/카카오 식별자 해시는 유지합니다.

privacy.PrivacyCipher 및 migration.migrate_private_data/import_sqlite_accounts의 입력·반환·오류·명령은 [회원 보안 저장 문서](../../../docs/member-privacy.md)를 참고합니다.

## 검증

backend/tests/test_auth.py, test_auth_privacy.py, test_auth_merge.py, test_kakao_auth.py, test_mobile_auth.py, test_finance_api.py와 웹 tests/e2e/auth.spec.js에서 가입·로그인·세션·프로필 암호화·계정 격리·기존 스키마 갱신·관리자 이관·카카오 취소/만료/재사용·브라우저 결합을 확인합니다. 카카오 실서비스 검증과 구분합니다.
