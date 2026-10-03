# 관리자 권한

2026-10-02. 웹 로그인 세션을 그대로 사용하고 `auth_admin_grants`에서 불변 account ID의 등급을 매 요청 조회합니다. 사용자명, 요청 헤더, 클라이언트 상태로 관리자 권한을 부여하지 않습니다.

| 등급 | QR 화면 | 관리자 목록·생성 | 직접 DB 관리 |
| --- | --- | --- | --- |
| `superadmin` 최고 관리자 | 허용 | 허용 | 웹 기능 없음 |
| `qr_admin` QR 관리자 | 허용 | 거부 | 거부 |
| 일반 회원·비로그인 | 거부 | 거부 | 거부 |

- `GET /v1/admin/session`: 관리자 세션 확인. 비로그인 401, 일반 회원 403.
- `GET /v1/admin/accounts`: 최고 관리자만 관리자 아이디·등급·생성 시각 조회. 비밀번호 해시·전화번호·일반 회원 목록은 반환하지 않습니다.
- `POST /v1/admin/accounts`: 최고 관리자만 QR 관리자 생성. `username`, `password`, `confirm_password`만 허용합니다. 등급은 서버에서 `qr_admin`으로 고정하며 `role`, `is_admin` 등의 추가 입력은 422입니다. `X-Auth-Request: 1` 필수입니다.
- 비밀번호는 영문·숫자를 포함한 12~128자이며 기존 auth 해시 함수를 사용합니다. 아이디·프로필은 일반 회원과 같은 저장소에 저장하며 전화번호를 수집하지 않습니다.
- 일반 회원가입·프로필 수정으로 권한을 얻을 수 없습니다. 목록/생성/QR API 모두 서버에서 재검사합니다. DB 연결 오류·모르는 등급은 권한 거부이며 응답은 no-store입니다. 검증 오류에 비밀번호를 반영하지 않습니다.
- 기존 단일 관리자 테이블에는 `role` 열을 추가하며 기존 레코드는 최소 권한인 `qr_admin`으로 이관합니다. `metadata.create_all`만으로 기존 열이 변경되지는 않으므로 `initialize_auth_schema`를 실행해야 합니다.

## 최초 최고 관리자 생성

신뢰한 서버 PC에서 `backend/.venv/Scripts/python.exe backend/scripts/setup-admin.py --share --username bokji_admin`을 실행합니다. 출력된 15분 유효한 loopback URL에서 비밀번호를 직접 입력합니다. 일회성 CSRF 토큰, Host/Origin/교차 사이트 검사, 크기 제한을 적용하고 성공하면 서버가 종료됩니다. 비밀번호는 명령행·로그에 남기지 않습니다. 기존 계정을 덮어쓰지 않습니다.

서버의 MySQL·암호화 키를 설정하고 `python -m app.modules.auth init`으로 저장소를 먼저 초기화합니다. `--share`도 같은 서버 설정의 MySQL 회원 저장소를 사용합니다. 기존 `backend/data/tunnel-demo/auth.sqlite3`의 회원은 서버 중지 후 `python -m app.modules.auth init --import-sqlite data/tunnel-demo/auth.sqlite3`로 이관하며, 회원 ID·관리자 등급을 유지합니다. 다른 환경의 DB와 자동 동기화하지 않습니다. [회원 저장·이관 안내](../../../docs/member-privacy.md).

최고 관리자로 웹 로그인 후 상단 **관리자 관리**(`#admin`)에서 하위 계정을 생성합니다. 일반 웹 UI에는 최고 관리자 생성/승격, 임의 SQL 실행, DB 다운로드 기능을 제공하지 않습니다. 웹 계정 권한은 서버 OS/MySQL 계정 권한과 별개이므로 하위 운영자에게 서버 파일·DB 자격증명을 공유하지 않습니다.

## 공고 공개 관리

기본 승인 방식은 자동 승인입니다. `POLICY_AUTO_PUBLISH=true`로 검증된 새 개정이 저장과 동시에 공개되며 관리자 목록에 현재 방식이 표시됩니다. 수동 공개·비공개는 계속 이용할 수 있고, 같은 결과 재저장이나 기존 초안 보완 실행으로 수동 비공개를 되돌리지 않습니다. 자동 변경 이력의 변경자는 `system:auto-publish`입니다. false로 설정하면 수동 검토 방식입니다.

최고 관리자만 `GET /v1/admin/policies?limit=10&cursor=0`로 개정을 조회하고, `GET /v1/admin/policies/{revision_id}`로 원문·누락 항목·표시 미리보기·이력을 검토합니다. `POST /v1/admin/policies/{revision_id}/publication` 입력은 `{action:"publish"|"unpublish",expected_status:"draft"|"reviewed"|"published"|"rejected",note:"검토 메모"}`입니다. `X-Auth-Request: 1` 필수. 성공은 revisionId/reviewStatus/matchingEnabled=false, 상태 변경 충돌 409, 미존재 404, 잘못된 검증 결과/입력 422, DB 장애 503입니다.

일반 회원·QR 관리자·비로그인에게 초안 원문과 공개 변경을 허용하지 않습니다. 세션·권한은 매 요청 확인합니다. 공고 공개와 자격 판정은 별개입니다. 같은 공고는 한 개정만 공개되고 비공개 전환 후 기존 개정으로 자동 되돌아가지 않습니다. 변경 시각·계정 ID·검토 메모를 공고 MySQL의 전용 이력에 기록합니다. `python -m app.modules.storage init`으로 006 마이그레이션을 먼저 적용합니다.

화면: 최고 관리자로 로그인 → 관리자 관리 → 공고 공개 관리 → 공고 검토 → 원문/확인 항목 확인 → 검토 확인 체크 → 공개. 공개 중인 개정은 같은 화면에서 비공개 전환할 수 있습니다. 검증: `tests/test_publication_api.py`, MySQL `tests/test_policy_database.py`, 웹 `tests/e2e/publication.spec.js`.

## 검증

`python -m pytest tests/test_admin.py tests/test_auth.py -q`: 최고/하위/일반/비로그인, 위조 헤더·추가 등급 입력, CSRF 헤더, 세션 만료·로그아웃·권한 회수, 중복 계정 보호, 비밀번호 비노출, 기존 테이블 이관 검사. QR 게이트웨이 테스트는 `frontend/web/tests/exhibition.test.js`, 화면 검사는 `tests/e2e/admin.spec.js`입니다.
