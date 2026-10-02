# 공통 설정과 DB 연결

현재 상태: 구현. 담당자: 미정.

- `config.load_settings() -> Settings`: 환경변수와 backend 기준 `.env`를 읽는 동기 함수. 지정 파일 누락과 필수 DB 설정 누락은 오류입니다. 비밀번호는 `SecretStr`입니다.
- `database.create_database_engine(settings) -> Engine`: MySQL 풀을 생성하는 동기 함수. 생성만으로 연결하지 않습니다. 호출자가 `dispose()`로 해제합니다.

DB 데이터를 변경하지 않습니다. 설정 예시는 [개발환경 문서](../../docs/development.md)를 따릅니다. backend에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py`로 검증합니다. 수정 시 진입점·health API·환경 예시·테스트를 함께 점검합니다. 업무 로직은 넣지 않습니다.

Settings에는 CODEX_MODEL·추론 수준·재시도 모델·제한시간과 AUTH_ENABLED/AUTH_SQLITE_PATH 및 AUTH_ENCRYPTION_KEYS/AUTH_ENCRYPTION_KEY_ID/AUTH_LOOKUP_KEY도 포함합니다. 쿠키 인증 때문에 CORS_ORIGINS 와일드카드를 거부합니다. 파이프라인은 설정만 읽으며 DB 엔진을 사용하지 않습니다. MySQL 풀은 readiness 및 DB_ENABLED=true인 인증 저장소에서 사용합니다. [정책 DB 저장과의 구분](../../docs/implementation-status.md), [인증 저장소](../modules/auth/readme.md).

개발·운영 회원 저장은 MySQL이며 SQLite는 격리 테스트만 허용합니다. 암호화 키 설정은 SecretStr로 관리합니다. [회원 보안 저장·키 설정](../../docs/member-privacy.md).
