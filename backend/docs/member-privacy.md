# 회원 저장과 기존 암호화 데이터 복원

2026-10-08: 회원 저장소는 공고 조회와 분리된 접속 풀을 사용하며 SQL 바인딩 값을 로그·SQLAlchemy 예외 문자열에서 숨깁니다. 운영 환경의 원격 MySQL은 CA·호스트명을 검증하는 TLS 1.2 이상 연결을 요구하고, 연결 후 실제 TLS 사용 여부를 확인합니다. SQLite는 각 연결에 `secure_delete=ON`과 `temp_store=MEMORY`를 적용합니다. 프로필 변경은 저장 트랜잭션에서 현재 웹 세션과 계정 소유자를 다시 확인하고, 로그인 중 비밀번호 해시가 변경되면 이전 검증 결과로 세션을 발급하지 않습니다.

2026-10-03: 로그인 설정을 단순화했습니다. 회원 프로필, 카카오 가입 대기 닉네임, 금융 원입력의 AES 암호화와 아이디 HMAC 검색을 제거했습니다. 새 환경에서는 AUTH_ENCRYPTION_KEYS, AUTH_ENCRYPTION_KEY_ID, AUTH_LOOKUP_KEY를 설정하거나 생성하지 않습니다.

## 현재 저장 구조

- DB_ENABLED=false: AUTH_SQLITE_PATH(기본 data/auth.sqlite3)에 SQLite 회원·세션을 저장합니다. 회원 API 첫 요청에서 스키마를 자동 준비합니다.
- DB_ENABLED=true: 설정한 MySQL에 회원·세션을 저장합니다. 테이블은 아래 초기화 명령으로 준비합니다. 공고 MySQL 기능은 별도입니다.
- 회원 아이디·이름·나이·성별·지역·우편번호·주소·상세주소는 일반 열에 저장합니다. 세 주소 필드는 선택 정보이며 기존 계정에는 null로 추가합니다. 정확한 주소는 AI 질문의 회원 문맥에 자동 첨부하지 않습니다. 카카오 가입 대기 닉네임은 nickname, 금융 원입력은 profile_json의 JSON입니다.
- 비밀번호 scrypt 해시, 세션·카카오 요청 토큰의 해시, 요청 제한, HttpOnly 쿠키, 일회성 OAuth state와 브라우저 결합 검증은 유지합니다. 카카오 토큰은 저장하지 않습니다.

Windows에서 backend 폴더 기준:

```powershell
.\.venv\Scripts\python.exe -m app.modules.auth init
```

새 SQLite 환경에서는 이 명령도 필수가 아닙니다. 카카오 로그인은 팀 앱 REST API 키, 해당 Client Secret, 동일 출처 콜백·웹 주소가 필요합니다. [카카오 설정](kakao-login.md).

## 이전 암호화 DB가 있는 경우

서버 쓰기를 중지하고 DB와 기존 .env를 Git에서 제외한 로컬 위치에 백업합니다. AUTH_ENCRYPTION_KEYS와 AUTH_LOOKUP_KEY의 원래 값을 유지한 상태에서 위 init 명령을 실행합니다. 복원은 회원 프로필·가입 대기 닉네임·금융 JSON을 복호화해 일반 저장 열로 옮기고 이전 암호문·검색 인덱스를 비웁니다. 회원 ID, 비밀번호 해시, 세션, 카카오 연결, 관리자 등급, 금융정보 소유자와 갱신 시각은 보존합니다.

기존 스키마의 profile_ciphertext, username_lookup, nickname_ciphertext 및 과거 메타데이터 테이블은 호환성을 위해 남겨두며 새 데이터 암호화에는 사용하지 않습니다. 원래 키가 없거나 키·암호문이 잘못되면 변환을 거부하고 데이터 변경을 롤백합니다. init 재실행은 이미 복원된 데이터를 다시 변경하지 않습니다. MySQL DDL은 암묵적으로 커밋되므로 초기화 실패 시에도 추가된 스키마는 남을 수 있습니다.

복원 성공 후 현재 서버 .env에서 세 개의 AUTH 암호화/HMAC 항목을 제거하고 서버를 다시 시작합니다. 백업된 암호화 DB를 다시 복구할 가능성이 있다면 해당 백업의 원래 키도 보관합니다. 키 생성·키 교체 명령은 현재 제공하지 않습니다.

## 다른 DB에서 회원 가져오기

대상 저장소 설정 후 backend 폴더에서 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m app.modules.auth init --import-sqlite data/previous-auth.sqlite3
```

암호화된 원본이라면 원본의 원래 키가 필요합니다. 원본 DB는 변경하지 않습니다. 회원·세션·관리자 등급·카카오 연결·금융정보를 복사하며 충돌하는 대상 계정을 덮어쓰지 않습니다. 반복 가져오기로 삭제한 세션·권한·금융정보를 복구하지 않습니다. 소스 계정이 없는 소유 정보는 전체 가져오기를 거부합니다. 만료 가능한 카카오 가입 대기 흐름은 가져오지 않으므로 다시 인증합니다.

## 검증

`test_member_security.py`는 SQL 바인딩 값 노출 차단, SQLite 주소 삭제 후 DB 페이지 확인, 로그아웃·만료·다른 계정·모바일 세션의 프로필 쓰기 거부, 로그인 중 자격 증명 변경, 손상된 비밀번호 해시, 회원 전용 접속 자격 증명, 원격 운영 DB의 TLS 필수화와 TLS 미지원 서버 거부를 검사합니다. TLS 연결 검사는 대역을 사용합니다.

test_auth_privacy.py는 MySQL·회원 암호화 키 없는 일반/카카오 로그인, 재시작 세션 보존, 기존 암호화 데이터 복원, 잘못된 키·암호문에 대한 롤백을 검사합니다. test_auth_merge.py는 기존 계정·관리자·세션·금융정보 이관과 소유권 경계를 검사합니다. 카카오 공급자 응답은 대역을 사용하므로 실제 사용자 동의 성공과 구분합니다.

## 회원 DB 접속과 운영 설정

`AUTH_DB_USER`와 `AUTH_DB_PASSWORD`를 함께 설정하면 회원·금융·지속 안내·알림 API와 회원 관련 초기화 명령이 이 자격 증명을 사용합니다. 생략하면 기존 `DB_USER`·`DB_PASSWORD`를 사용합니다. 서버·포트·스키마는 기존 `DB_HOST`·`DB_PORT`·`DB_NAME`을 유지하며 공고 DB의 연결 설정과 코드는 변경하지 않습니다. 지속 안내 작업자도 회원 데이터는 회원 풀, 공고 조회는 기존 공고 풀로 나누어 사용합니다. 회원 DB 연결 실패 시 SQLite로 전환하지 않습니다.

운영 환경에서 DB 호스트가 `localhost`·`127.0.0.1`·`::1` 외의 값이면 `AUTH_DB_SSL_CA` 또는 기존 `DB_SSL_CA`를 설정해야 합니다. CA 상대 경로는 backend 폴더를 기준으로 해석합니다. CA 파일을 읽을 수 없거나 인증서·호스트명 검증이 실패하거나 서버가 TLS를 지원하지 않으면 회원 연결을 거부합니다. 로컬 DB도 CA를 지정하면 같은 검증을 수행합니다.

DB 관리자는 회원 전용 계정에 `auth_*`, `account_financial_profiles`, `account_monitoring_*`, `account_notification_preferences`, `mobile_push_devices`의 필요한 테이블만 허용하고, 공고용 계정에는 회원 테이블 접근을 허용하지 않도록 권한을 설정합니다. 실행용 계정은 필요한 SELECT·INSERT·UPDATE·DELETE 권한만 부여하고, 테이블 생성·변경은 별도 이관용 자격 증명으로 초기화 명령을 실행합니다. 애플리케이션이 DB 사용자나 GRANT를 자동 변경하지는 않습니다.

SQLite 설정은 앞으로 삭제·갱신하는 일반 테이블의 DB 페이지 잔여값을 줄입니다. 기존 백업·별도 복제본·WAL·저널·파일 시스템의 이전 복사본을 정리하는 기능은 아닙니다. SQLite 파일과 폴더에는 서버 실행 계정만 접근하도록 OS 권한을 설정하고, 백업에도 같은 접근 제한을 적용합니다. 회원·주소·금융 원입력의 저장 형식은 현재의 일반 열·JSON을 유지하므로 DB 파일과 백업 자체의 암호화는 별도 키 관리 및 이관 작업이 필요합니다.

SQLAlchemy의 `hide_parameters`는 바인딩 값을 가리며 DB 서버가 생성하는 오류 메시지 전체를 정제하지는 않습니다. DB 드라이버 디버그 로그와 민감한 예외의 원문 로깅을 활성화하지 않습니다. HTTP 오류와 초기화 명령의 오류 출력은 입력값·SQL·자격 증명을 반사하지 않는 기존 경계를 유지합니다.

설정 검증 실패의 예외 문자열에도 원본 입력값을 표시하지 않아 DB 비밀번호 등 환경 설정이 시작 오류에 그대로 출력되는 것을 막습니다. [SQLAlchemy 바인딩 값 숨김](https://docs.sqlalchemy.org/en/20/core/engines.html#hiding-parameters), [SQLite 보안 삭제](https://www.sqlite.org/pragma.html#pragma_secure_delete).
