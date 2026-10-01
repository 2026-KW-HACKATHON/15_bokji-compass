# 회원가입·로그인·개발용 문자 인증

`app/api/auth.py`가 입력을 검증하고 `service.AuthService`에 위임합니다. 실제 SMS 공급자는 아직 연결하지 않았습니다. `SmsSender.send_code(phone, code)` 경계를 통해 추가하며 현재 설정은 `development` 또는 `disabled`만 지원합니다.

## 로컬 실행

기본 `APP_ENV=development`, `DB_ENABLED=false`, `AUTH_ENABLED=true`, `AUTH_SMS_MODE=development`로 서버를 실행합니다. 별도 MySQL 없이 첫 인증 요청에 `backend/data/auth.sqlite3`가 생성됩니다. 계정·세션·인증 시도 제한은 이 파일에 저장되어 서버 재시작 후에도 유지됩니다. 파일은 Git에서 제외됩니다. 실제 개인정보를 개발용 DB에 넣지 마세요.

루트에서 `powershell -ExecutionPolicy Bypass -File backend/scripts/start.ps1`, 별도 터미널에서 `cd frontend/web; npm run dev` 실행 후 회원가입 화면으로 이동합니다. ‘인증번호 받기’를 누르면 개발용 번호가 화면에 표시됩니다. 실제 문자는 발송하지 않습니다. 회원가입 완료 후 로그인합니다.

`DB_ENABLED=true`이면 기존 MySQL 연결을 사용합니다. `backend`에서 `.venv/Scripts/python.exe -m app.modules.auth`를 명시적으로 실행해 `auth_accounts`, `auth_phone_challenges`, `auth_sessions`, `auth_rate_limits`를 생성하거나 인증 스키마를 갱신합니다. 현재 이름 열이 없는 기존 계정 테이블에 nullable `name VARCHAR(50)` 열을 추가하며 기존 계정·세션을 삭제하지 않습니다. 개발용 SQLite는 서버 재시작 후 첫 인증 요청에 같은 갱신을 자동 적용합니다. 기존 초안 `users/user_profiles`·정책 테이블과 분리되어 있습니다. MySQL 실서버 검증은 아직 하지 않았습니다.

운영 환경에서는 SQLite 인증을 차단하고 개발용 번호 발급도 차단합니다. 실 SMS 공급자 구현 및 설정 없이는 신규 문자 인증이 503으로 실패합니다. 개발 DB를 운영 DB로 재사용하지 마세요. 운영은 HTTPS와 동일 사이트의 API 프록시를 사용하며 `Secure` 쿠키가 적용됩니다. 교차 사이트 인증은 현재 지원하지 않습니다.

## HTTP 계약

모든 경로의 접두사는 `/v1/auth`, 웹 프록시에서는 `/api/v1/auth`입니다. 모든 POST는 JSON과 `X-Auth-Request: 1` 헤더가 필요하며 누락 시 403입니다. 응답은 `Cache-Control: no-store`이고 오류는 `{ "detail": "사용자 안내" }`입니다. 잘못된 입력 422 응답에 비밀번호·인증번호를 반사하지 않습니다.

| 메서드·경로 | 입력 | 성공 |
|---|---|---|
| POST `/phone/request` | phone | challenge_id, expires_in=300, retry_after=60; 개발 환경만 development_code |
| POST `/phone/verify` | phone, challenge_id, code(6자리) | verification_token, expires_in=300 |
| POST `/signup` | name, username, password, confirm_password, age, gender, region, phone, verification_token | 201, message |
| POST `/login` | username, password | user와 HttpOnly 세션 쿠키 |
| GET `/me` | 세션 쿠키 | user; 비로그인·만료 시 401 |
| POST `/logout` | 빈 JSON, 세션 쿠키 | message, 서버 세션 폐기 및 쿠키 삭제 |

이름(name)은 필수 1~50자이며 양끝 공백을 제거하고 공백만 있는 이름과 제어 문자를 거부합니다. 로그인·세션 응답에 이름을 포함하고 화면에는 이름 뒤에 ‘님’을 붙여 표시합니다. 이름 없이 가입했던 기존 계정은 name=null이며 화면에 ‘회원님’으로 표시합니다. 아이디는 영문·숫자·밑줄 4~20자이며 소문자로 정규화합니다. 비밀번호는 영문과 숫자를 포함한 8~128자이며 확인 값과 일치해야 합니다. 만 나이는 정수 0~120, 성별은 male/female/other/undisclosed, 지역은 화면의 17개 시·도 약칭입니다. 전화번호는 하이픈·공백을 제거한 국내 010 번호 11자리입니다. 아이디·전화번호는 각각 유일하며 충돌 시 409입니다. 나이는 가입 시 입력값으로 자동 증가하지 않습니다.

인증번호는 5분 유효, 5회 실패 시 사용 불가, 재발급 시 이전 번호·가입 증명을 무효화합니다. 인증 성공 후 가입 증명은 5분간 한 번만 사용할 수 있고 전화번호에 묶입니다. 가입과 증명 소비는 하나의 DB 트랜잭션으로 처리합니다. 잘못된 번호·증명은 400입니다.

발급은 전화번호당 60초 간격·시간당 5회, IP당 시간당 20회입니다. 확인은 IP당 15분에 50회, 가입은 IP당 시간당 20회, 로그인은 아이디당 15분에 10회·IP당 50회입니다. 성공·실패 요청 모두 계산하고 제한 시 429를 반환합니다. 프록시의 IP 전달은 ASGI 서버의 신뢰 프록시 설정을 사용합니다. 공급자 비용 상한·분산 공격 대응은 실제 문자 연동 때 추가해야 합니다.

비밀번호는 무작위 salt를 사용하는 scrypt(N=32768,r=8,p=3)로 저장합니다. 7일 세션은 무작위 토큰이고 DB에는 SHA-256 해시만 저장합니다. 쿠키는 HttpOnly/SameSite=Lax, 운영에서는 Secure입니다. `user` 응답은 id/username/name/age/gender/region만 포함하며 전화번호·비밀번호·세션 토큰을 반환하지 않습니다.

회원가입 정보는 계정에 저장됩니다. 기존 추천용 ‘내 정보’ 폼과 저장 공고는 브라우저 단위 기능으로 유지되며 계정 동기화·회원 정보 수정·탈퇴·비밀번호 재설정은 이번 구현 범위에 포함되지 않습니다.

## 검증

`tests/test_auth.py`: 가입·세션·재시작·로그아웃·입력 오류·중복·만료·재사용·전화번호 결합·요청 제한·동시 가입·운영 차단·발송 실패를 테스트합니다. 프론트 `tests/e2e/auth.spec.js`는 독립 SQLite 테스트 서버로 데스크톱·모바일 가입부터 로그아웃까지 검증합니다.

## 모바일 세션 확장 (2026-10-01)

`AuthService.login(..., mobile=True)`, `me(token, mobile=True)`, `logout(token, mobile=True)`는 모바일 전용 해시 영역의 세션을 발급·조회·폐기합니다. 기본값은 False이며 기존 쿠키 세션 동작을 유지합니다. 사용자/세션 스키마, 7일 만료, 시도 제한을 재사용합니다. token 원문은 DB에 기록하지 않으며 자동 갱신은 제공하지 않습니다. HTTP 공개 계약은 [모바일 인증](../../../../api-management.md)에 있습니다.
