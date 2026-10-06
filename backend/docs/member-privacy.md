# 회원 저장과 기존 암호화 데이터 복원

2026-10-03: 로그인 설정을 단순화했습니다. 회원 프로필, 카카오 가입 대기 닉네임, 금융 원입력의 AES 암호화와 아이디 HMAC 검색을 제거했습니다. 새 환경에서는 AUTH_ENCRYPTION_KEYS, AUTH_ENCRYPTION_KEY_ID, AUTH_LOOKUP_KEY를 설정하거나 생성하지 않습니다.

## 현재 저장 구조

- DB_ENABLED=false: AUTH_SQLITE_PATH(기본 data/auth.sqlite3)에 SQLite 회원·세션을 저장합니다. 회원 API 첫 요청에서 스키마를 자동 준비합니다.
- DB_ENABLED=true: 설정한 MySQL에 회원·세션을 저장합니다. 테이블은 아래 초기화 명령으로 준비합니다. 공고 MySQL 기능은 별도입니다.
- 회원 아이디·이름·나이·성별·지역은 일반 열에 저장합니다. 카카오 가입 대기 닉네임은 nickname, 금융 원입력은 profile_json의 JSON입니다.
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

test_auth_privacy.py는 MySQL·회원 암호화 키 없는 일반/카카오 로그인, 재시작 세션 보존, 기존 암호화 데이터 복원, 잘못된 키·암호문에 대한 롤백을 검사합니다. test_auth_merge.py는 기존 계정·관리자·세션·금융정보 이관과 소유권 경계를 검사합니다. 카카오 공급자 응답은 대역을 사용하므로 실제 사용자 동의 성공과 구분합니다.
