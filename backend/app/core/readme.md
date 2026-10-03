# 공통 설정과 DB 연결

`POLICY_AUTO_PUBLISH`는 검증된 새 공고의 자동 공개 기본값이며 true입니다. false로 지정하면 저장 후 관리자 수동 공개를 사용합니다. 새 수집·파싱·재개·JSON 이관 CLI는 이 설정을 저장소에 전달합니다. 저장된 원문 JSON과 자동 맞춤 자격 판정은 변경하지 않습니다.

현재 상태: 구현. 담당자: 미정.

- `config.load_settings() -> Settings`: 환경변수와 backend 기준 `.env`를 읽는 동기 함수. 지정 파일 누락과 필수 DB 설정 누락은 오류입니다. 비밀번호는 `SecretStr`입니다.
- `database.create_database_engine(settings) -> Engine`: MySQL 풀을 생성하는 동기 함수. 생성만으로 연결하지 않습니다. 호출자가 `dispose()`로 해제합니다.
- `Settings.auth_uses_mysql -> bool`: `DB_ENABLED`를 따릅니다. 개발·운영 인증은 MySQL을 요구하며 SQLite는 `APP_ENV=test`인 격리 테스트에만 허용합니다.

DB 데이터를 변경하지 않습니다. 설정 예시는 [개발환경 문서](../../docs/development.md)를 따릅니다. backend에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py`로 검증합니다. 수정 시 진입점·health API·환경 예시·테스트를 함께 점검합니다. 업무 로직은 넣지 않습니다.

Settings에는 CODEX_MODEL·추론 수준·재시도 모델·제한시간과 AUTH_ENABLED/AUTH_SQLITE_PATH 및 AUTH_ENCRYPTION_KEYS/AUTH_ENCRYPTION_KEY_ID/AUTH_LOOKUP_KEY도 포함합니다. 쿠키 인증 때문에 CORS_ORIGINS 와일드카드를 거부합니다. 파이프라인은 설정만 읽으며 DB 엔진을 사용하지 않습니다. MySQL 풀은 readiness 및 DB_ENABLED=true인 인증 저장소에서 사용합니다. [정책 DB 저장과의 구분](../../docs/implementation-status.md), [인증 저장소](../modules/auth/readme.md).

개발·운영 회원 저장은 MySQL이며 SQLite는 격리 테스트만 허용합니다. 암호화 키 설정은 SecretStr로 관리합니다. [회원 보안 저장·키 설정](../../docs/member-privacy.md).

서버 수집의 INGESTION_* 설정은 페이지·작업·시간·HTTP/모델 호출·일일 사용량·대기열 크기를
제한합니다. 메모리/디스크 여유가 부족하면 작업 시작을 미루며 검색은 기본 비활성입니다.
대기열 한도는 한 페이지 이상이어야 합니다. 실제 API 계정 한도 확인 후 .env에서 조정합니다.
[서버 수집 실행 안내](../../docs/server-ingestion.md)의 실행은 명시적인 CLI/스케줄에서만 수행합니다.

`INGESTION_ENABLED`는 기본 true이며 false로 저장하면 이후 수집 회차는 DB·HTTP·모델에
접근하지 않고 대기합니다. 진행 중인 worker를 강제 종료하지는 않습니다.
[백엔드 관리자 화면](../../docs/server-admin.md)에서도 허용된 설정을 저장할 수 있습니다.
수집·모델 설정은 다음 실행부터 반영하며, DB 연결 설정은 현재 서버를 재시작해야 적용됩니다.
