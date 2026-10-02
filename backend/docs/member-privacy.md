# MySQL 회원 정보 암호화

2026-10-02 구현. 일반 가입, 웹 카카오 가입, 모바일 아이디 로그인이 같은 암호화 회원 저장소를 사용합니다. 개발·운영 회원 저장은 MySQL이며 SQLite는 APP_ENV=test인 격리 테스트만 허용합니다. HTTP 계약은 유지합니다.

## 저장 내용

| 데이터 | 저장 방식 |
| --- | --- |
| 아이디·이름·나이·성별·지역·기존 전화번호 | auth_accounts.profile_ciphertext의 AES-256-GCM 암호문 |
| 로그인 아이디 검색·중복 확인 | 별도 비밀키로 계산한 HMAC-SHA-256 username_lookup, UNIQUE 인덱스 |
| 비밀번호 | 기존 scrypt 단방향 해시; 복호화 불가 |
| 카카오 가입 대기 닉네임 | auth_kakao_flows.nickname_ciphertext 암호문 |
| 저장 동의한 소득·재산·가구·차량 원입력 | account_financial_profiles.profile_json의 암호문 |
| 카카오 연결 ID·세션 토큰 | 기존 공급자 식별자/세션 해시; 카카오 토큰은 저장하지 않음 |
| 회원 ID·연결 ID·가입/수정/만료 시각 | 참조 관계와 운영에 필요한 값 |

기존 계정 테이블의 username은 무작위 식별값, name/phone은 NULL, age는 0, gender/region은 encrypted라는 자리표시자로 바꿉니다. 실제 회원 정보는 암호문에만 남습니다. 기존 정책 테이블 및 초안 users/user_profiles는 이 회원 저장소에서 사용하지 않습니다.

저장마다 새로운 96비트 nonce를 사용하며 GCM 인증 태그를 함께 보관합니다. 암호문 형식은 enc:v1:키ID:base64입니다. 회원/금융/카카오 가입 흐름의 종류와 레코드 ID를 AAD에 결합하여 다른 회원이나 테이블로 암호문을 바꿔 넣으면 복호화가 실패합니다. API는 로그인한 계정 정보를 서버에서 복호화해 기존 응답 형식으로 반환합니다. 암호화 키 누락, 키 불일치, 변조, 평문 데이터의 런타임 읽기는 안전한 503으로 거부합니다.

## 서버 설정과 실행

backend/.env.example에는 비밀값 없는 변수만 있습니다. 실제 키·MySQL 비밀번호는 Git에서 제외한 서버 .env 또는 비밀 관리 서비스에 둡니다. 키를 프런트엔드, VITE 변수, 모바일 번들, DB 테이블에 넣지 않습니다.

- AUTH_ENCRYPTION_KEYS: 키ID와 URL-safe base64로 인코딩한 32바이트 암호키의 JSON 객체.
- AUTH_ENCRYPTION_KEY_ID: 신규 암호화에 사용하는 키ID. 기본 primary.
- AUTH_LOOKUP_KEY: 암호키와 다른 무작위 32바이트 HMAC 키. 로그인 인덱스가 의존하므로 암호키 교체와 함께 변경하지 않습니다.
- DB_ENABLED=true 및 DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD: MySQL 접속 설정.
- DB_SSL_CA: 원격 운영 MySQL 연결 시 서버 인증서 검증에 사용할 CA 경로.

Windows의 backend 폴더에서 실행합니다. macOS/Linux는 .venv/bin/python을 사용합니다.

```powershell
# 기존 프로젝트 MySQL 설정이 없을 때만 로컬 개발 DB 준비
.venv/Scripts/python.exe scripts/mysql_dev.py setup

# 기존 키가 없을 때만 생성. 키는 화면에 출력하지 않고 .env에 기록합니다.
.venv/Scripts/python.exe -m app.modules.auth keys

# 회원/금융 테이블 및 기존 평문 데이터 암호화. 반복 실행 가능.
.venv/Scripts/python.exe -m app.modules.auth init

# 기존 SQLite 회원·카카오 연결·세션·금융정보를 MySQL로 이관
.venv/Scripts/python.exe -m app.modules.auth init --import-sqlite data/auth.sqlite3
```

MySQL 연결이 없으면 SQLite로 우회하지 않습니다. HTTP 요청에서는 MySQL 테이블 생성/데이터 이관을 실행하지 않습니다. 최초 초기화 후 서버를 시작하고, 이미 실행 중이면 재시작하여 새 DB/키 설정을 읽게 합니다.

이관은 회원 ID, 비밀번호 해시, 카카오 연결, 세션, 금융정보 소유자를 보존합니다. 목적지 계정을 덮어쓰지 않고 충돌을 거부합니다. MySQL 데이터 복사는 한 트랜잭션이며 실패하면 해당 복사가 롤백됩니다. 복사 성공 후 원본 SQLite도 암호화하고 VACUUM하여 논리 DB 파일의 이전 평문 페이지를 제거합니다. 이미 존재하는 외부 백업·디스크 스냅샷까지 지우지는 않습니다. 만료 가능한 카카오 가입 대기 흐름은 이관하지 않으므로 다시 인증해야 합니다.

스키마 추가와 기존 phone nullable 전환, 카카오 가입 흐름 subject를 64자로 확장합니다. MySQL DDL은 암묵적으로 커밋되므로 데이터 변환 실패 시에도 추가 열/테이블은 남을 수 있습니다. DML 암호화는 한 트랜잭션이고 재실행할 수 있습니다. 초기화/이관/키 교체는 서버 쓰기를 중지한 상태에서 실행합니다.

## 키 교체와 운영

새 암호키를 새 키ID로 AUTH_ENCRYPTION_KEYS에 추가하고 AUTH_ENCRYPTION_KEY_ID를 새 ID로 설정합니다. 기존 키와 AUTH_LOOKUP_KEY는 유지합니다. 서버 쓰기를 중지한 상태에서 init을 실행하면 회원, 금융, 가입 대기 암호문을 새 키로 다시 암호화합니다. 검증 후 서버를 재시작합니다. 기존 키는 그 키로 암호화된 백업을 복구할 가능성까지 고려해 보관합니다. 기존 키ID의 키값을 다른 값으로 덮어쓰지 않습니다.

auth_privacy_state에는 HMAC 키의 확인값만 저장하며 원래 키를 저장하지 않습니다. HMAC 키를 잘못 바꿨을 때 인증 서비스와 이관이 중단됩니다. 이 확인값을 삭제하거나 덮어써서 우회하지 않습니다. HMAC 키를 교체하는 별도 운영 절차는 제공하지 않습니다.

암호화 키를 잃으면 해당 암호문을 복구할 수 없습니다. DB 백업과 키 백업은 별도 접근 권한으로 보관합니다. 서버를 장악한 공격자가 키까지 가져갈 수 있으므로 운영에는 HTTPS, 원격 DB의 TLS 인증서 검증, 서버 비밀 관리, 최소 권한 DB 계정, 백업 접근 통제가 필요합니다. 로컬 mysql_dev.py의 개발 계정은 초기화용 DDL 권한을 포함하므로 운영 계정과 구분합니다. API 로그에 요청 본문·비밀번호·복호화 값·SQL 매개변수·카카오 인가 코드를 기록하지 않습니다.

가입 프로필 암호화는 DB 저장 보호입니다. 보관기간 자동 삭제, 회원 탈퇴, 비밀번호 재설정, 관리자 개인정보 조회 권한은 별도의 후속 기능입니다.

## Python 인터페이스와 검증

- PrivacyCipher(settings): 서버 키 설정을 검증. 잘못된 설정은 PrivacyError. 외부 통신 없음.
- encrypt/decrypt(value, context): 문자열 암호화/복호화. JSON은 encrypt_json/decrypt_json을 사용. 인증 실패는 PrivacyError.
- lookup(username): 소문자로 정규화한 아이디의 HMAC 인덱스.
- encrypted_account(cipher, account): 참조 ID/해시를 유지하고 평문 열을 자리표시자로 바꾼 저장 행 반환.
- initialize_auth_schema(engine): 추가 스키마와 기존 호환 열 갱신. 키나 데이터 암호화는 별도.
- migrate_private_data(engine, cipher): 기존 회원/금융/가입 대기 데이터 암호화 또는 키 교체. 변환 계정 수 반환.
- import_sqlite_accounts(source, target, cipher): 목적지에 없는 계정과 관련 데이터 복사, 신규 계정 수 반환.
- FinancialProfileStore(engine, cipher): 계정별 암호화 금융 원입력 저장/조회/삭제. 조회 시 복호화.

tests/test_auth_privacy.py는 난수 nonce, 변조/회원 간 암호문 교체, 잘못된 키, MySQL 없는 라이브 저장 차단, 이관/반복 실행/키 교체/롤백/세션 보존을 검증합니다. BOKJI_TEST_MYSQL=1로 별도 bokji_compass_test DB에서 일반/카카오 가입, 재로그인, 금융 저장의 암호화를 검증합니다. 실제 카카오 공급자 대신 합성 응답을 사용하므로 카카오 실서비스 검증과 구분합니다.

설계 참고: [cryptography AES-GCM API](https://cryptography.io/en/latest/hazmat/primitives/aead/), [OWASP 암호화 저장 지침](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

최종 검증: 전체 백엔드 287개 통과·10개 선택 검사 건너뜀, 추가 보안 검사 10개 통과·실제 MySQL 별도 통합 1개 통과, 웹 회원가입/카카오 데스크톱·모바일 10개 통과, 변경 Python Ruff 검사 통과. MySQL 기존 회원 1명·카카오 연결 1건 이관 및 원본 SQLite 암호화를 확인했습니다. 실행 중인 자동 재시작 개발 백엔드의 /health/ready=200, /v1/auth/me=401을 확인하여 새 MySQL 설정과 인증 경계가 적용됨을 검증했습니다.
