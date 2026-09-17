# Windows 서버 기반 조건 검색·정제·MySQL 저장 구현 계획

작성일: 2026-09-17. 상태: 계획 작성 완료 / 설치·기능 구현 미착수.

사용자가 제공한 `Queryable Welfare Conditions, Normalization, and Persistence` 프롬프트를 기준으로 한다. 이후 요청인 **MySQL 사용, Windows 서버 직접 운영, 작업 전 계획 수립**을 우선한다. VMware 등 VM, Ubuntu, WSL, Docker는 설치·개발·테스트·배포 전제에서 제외한다. Python의 `.venv`는 패키지를 분리하는 폴더이며 가상 머신이 아니므로 사용한다. 이 문서의 명령, 경로, 테이블과 인터페이스는 구현 예정이며 현재 실행 가능한 기능을 뜻하지 않는다.

## 1. 확인한 사실과 가정

| 구분 | 확인 내용 |
| --- | --- |
| 저장소 | `backend/`와 `frontend/`가 분리되어 있다. 최초 계획 점검 시 Git 작업 트리는 깨끗했고 현재는 계획·작업 기록·루트 README 변경이 있다. 적용할 `AGENTS.md`는 발견되지 않았다. |
| 백엔드 | 기존 Python 파일, `pyproject.toml`, 환경변수 예시는 빈 파일이다. 계획·작업 기록 이외 공통 문서는 미작성이다. 재사용할 구현·스키마·마이그레이션·사용자 프로필 모델은 없다. |
| 프로젝트 지침 | 소문자 `readme.md`에 역할·호출법·반환값을 기록하고, 백엔드 공통 문서는 `backend/docs/`에서 관리한다. |
| DB | 사용자가 MySQL을 선택했다. 원문 프롬프트의 저장소 미정/JSON 파일 대체안은 기본 구현 방향에서 제외한다. |
| 서버 OS | 사용자가 Windows 직접 운영을 지정했다. 정확한 Windows 제품·에디션·빌드는 설치 전에 확인한다. |
| 현재 개발 PC | Windows PowerShell. `python --version`: 3.10.0. `py --list`에는 등록된 Python이 없다. `uv`, `mysql` 명령은 PATH에서 발견되지 않았다. 시스템 전체 미설치를 뜻하지는 않는다. |
| 기타 도구 | Node 22.19.0, Codex CLI 0.154.0을 확인했다. MySQL 서버 실행 상태와 공급자 인증은 확인하지 않았다. 기존 PC의 도구 설치 여부와 별개로 운영 구성은 Windows 네이티브로 통일한다. |
| 하드웨어 | 시스템 정보 조회 권한이 없어 현재 PC의 CPU·RAM은 확인하지 못했다. 아래 서버 사양은 현재 PC 사양과 무관한 제안이다. |
| 미확정 | 서버의 Windows 버전·사양·설치 경로, 기존 MySQL 서버 유무, 원본 데이터 규모, 동시 사용자 수, 일일 처리량, LLM 모델·인증·사용 한도, HTTPS 진입점, 백업 보존 정책. |

계획 가정은 초기 공고 약 1만 건, 하루 정제 최대 1천 건, LLM 동시 호출 1~2건, 조회 부하 시험 10요청/초이다. 이는 사용자가 확정한 요구량이나 성능 보장이 아니다. 먼저 작은 실측 데이터로 처리 시간·메모리·저장량·공급자 사용 한도를 측정한다.

## 2. 백엔드 서버 사양 제안

| 환경 | CPU / RAM | 디스크 | 용도 |
| --- | --- | --- | --- |
| 팀 개발 PC 권장 | 4코어 이상 / 16GB | 여유 SSD 60GB 이상 | Windows에서 편집기, Python, MySQL을 직접 실행. |
| 초기 통합 서버 권장 | 4코어 이상 / 16GB | OS 공간 외 프로젝트·데이터용 여유 SSD 100GB 이상 | API, 제한된 정제 실행, MySQL을 Windows 한 대에 직접 설치. 고가용성 구성은 아님. |
| 데이터·동시 처리 증가 시 | 8코어 이상 / 32GB | 데이터용 SSD 200GB 이상에서 실측 후 확장 | 초기 서버 증설 후보. 요청 처리량을 보장하는 수치가 아님. |
| 이후 앱·DB 분리 시 | 앱 4코어/16GB, DB 4코어/16GB부터 검토 | 앱 여유 60GB, DB 데이터용 100GB 이상 | 필요한 경우 Windows 장비 두 대로 분리하고 비공개 네트워크로 연결. |

운영 OS는 Windows x64로 확정한다. 기존 장비의 Windows 버전은 유지 가능한지 먼저 확인하고, 새 전용 서버를 고른다면 Windows Server 2022를 후보로 둔다. Windows 11 x64 장비도 MySQL 8.4 지원 목록에 포함되지만 실제 제품·빌드와 전체 의존성 호환성은 설치 전에 확인한다. OS 재설치나 라이선스 구매는 이번 계획의 실행 작업에 포함하지 않는다. [MySQL 지원 Windows 목록](https://www.mysql.com/support/supportedplatforms/database.html)

실행환경은 Windows용 Python 3.13의 설치 시점 최신 패치, DB는 MySQL Community Server 8.4 LTS x64의 지원되는 패치 버전이다. GPU는 외부 LLM 호출 방식에 필요하지 않다. 로컬 모델·OCR 서버를 추가할 경우 다시 산정한다. 기존 3.10 전역 환경은 교체하지 않고 프로젝트 환경을 별도로 만든다. [Python 지원 현황](https://devguide.python.org/versions/), [MySQL LTS 정책](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html)

통합 서버에서는 API 프로세스 1개와 정제 동시 실행 1건으로 시작한다. MySQL 버퍼 풀은 약 2GB를 초기 시험값으로 두고 OS·앱·Codex 프로세스의 실제 사용량을 본다. 프로세스 증설 시 메모리와 DB 연결 풀이 각각 늘어나는 점을 함께 계산한다. 초기 SQLAlchemy 풀은 프로세스당 5개, 추가 연결 0개를 제안하며 전체 연결 수는 DB 한도 안에서 조정한다. [FastAPI 프로세스 운영](https://fastapi.tiangolo.com/deployment/server-workers/)

저장량은 `원본 평균 크기 × 건수 × 보존 기간 + JSON/조건 인덱스/개정 이력 + 운영 여유`로 산정한다. 예를 들어 원본 평균 1MB를 하루 1천 건 보관하면 30일에 약 30GB가 추가된다. 따라서 SSD 100GB를 장기 보관 충분 용량으로 간주하지 않는다. 백업은 별도 저장소에 두고 DB와 원본 참조가 함께 복구되는지 검증한다.

운영 연결은 HTTPS를 사용하고 MySQL 3306 포트는 외부에 공개하지 않는다. DB 계정은 앱의 읽기·쓰기 계정과 마이그레이션 계정을 분리한다. Codex 추출 프로세스에는 DB 계정이나 저장소 전체 접근을 전달하지 않는다. 외부 공개는 접근 제어가 마련된 후 수행한다.

## 3. 필요한 의존성과 선택 이유

정확한 패치 버전은 설치 단계에서 호환성을 확인하고 `backend/uv.lock`으로 고정한다. 아래 목록은 설치 계획이며 아직 `pyproject.toml`에 작성하거나 설치하지 않았다.

| 구분 | 예정 의존성 | 목적 |
| --- | --- | --- |
| 환경 관리 | Python 3.13, `uv` | 프로젝트별 Python·가상환경·의존성 잠금 관리 |
| API | `fastapi`, `uvicorn` | Windows에서 `asyncio` 이벤트 루프와 `h11` HTTP 구현으로 실행 |
| 계약·설정 | `pydantic>=2,<3`, `pydantic-settings` | 정제 계약, 엄격한 타입·의미 검증, 환경변수 설정 |
| DB | `sqlalchemy>=2,<3`, `pymysql[rsa]` | MySQL 접속, 세션·트랜잭션, 인증에 필요한 RSA 지원 |
| DB 이력 | `alembic` | 테이블·인덱스 버전 및 마이그레이션 |
| 입력 | `defusedxml`, `pillow` | XML 외부 엔티티 등 차단, 이미지 형식·크기 검증 |
| 시간대 | Windows용 `tzdata` | `zoneinfo`를 이용한 한국 시간대 처리 |
| Gemini 선택 의존성 | `google-genai` (`gemini` extra) | Gemini 요청·응답 어댑터. 기본 mock 실행에는 불필요. |
| 개발·검증 | `pytest`, `pytest-cov`, `hypothesis`, `httpx`, `ruff`, `mypy` | 단위·API·속성 기반 테스트, 커버리지, 정적 검사 |
| 별도 실행 도구 | 고정 버전 Codex CLI | 비대화형 추출. Python `subprocess`로 연결하며 OpenAI Python SDK는 필수가 아님. |
| Windows 필수 런타임 | MySQL 요구사항에 맞는 Microsoft Visual C++ x64 재배포 패키지 | MySQL 8.4의 Windows 실행 전제. C++ 개발 도구 전체를 설치하는 의미는 아님. |
| Windows 서비스 관리 | WinSW 안정 버전 및 해당 빌드가 요구하는 .NET 런타임 | Uvicorn의 서비스 등록, 자동 시작, 장애 복구·로그 관리. .NET 기존 설치 여부부터 확인. |
| Windows 프로세스 제어 | `pywin32` (Windows 전용) | Codex 제한 계정 실행 및 Job Object 기반 자식 프로세스 종료 등 Windows API 사용 |

SQLAlchemy + PyMySQL의 동기식 저장소로 시작한다. API에서 DB를 호출하는 경로는 동기 `def` 또는 명시적 스레드 위임을 사용하며 `async def` 안에서 동기 DB/CLI 호출로 이벤트 루프를 막지 않는다. 세션은 요청/작업별로 만들고 스레드 간 공유하지 않는다. [SQLAlchemy MySQL 드라이버](https://docs.sqlalchemy.org/en/20/dialects/mysql.html), [PyMySQL 설치](https://pypi.org/project/PyMySQL/), [FastAPI 동기·비동기 경계](https://fastapi.tiangolo.com/async/)

`json`, `hashlib`, `decimal`, `datetime`, `zoneinfo`, `subprocess`, `tempfile`, `logging`은 표준 라이브러리를 사용한다. Redis, Celery, 벡터 DB, LangChain, 로컬 LLM, OCR, 브라우저 자동화, PDF 파서는 현재 요구를 위해 설치하지 않는다. HTTP 파일 업로드를 범위에 넣을 때만 `python-multipart`를 추가한다.

## 4. Windows 직접 설치·환경 구성 순서

1. 실제 서버의 Windows 버전·x64 여부·관리 권한·여유 디스크·기존 MySQL 서비스/포트를 확인한다. 기존 운영 DB를 테스트에 재사용하지 않는다.
2. 공식 Windows 배포 경로로 `uv`를 설치한다. 프로젝트용 Python 3.13 x64를 준비하고 `backend/.python-version`에 선택 버전을 기록한다. `backend/.venv/Scripts/python.exe`를 사용해 전역 Python과 분리한다. [uv 설치](https://docs.astral.sh/uv/getting-started/installation/)
3. `backend/pyproject.toml`에 패키지 구성, Windows 의존성, `gemini` extra, 개발 그룹을 작성한다. `uv lock`으로 실제 잠금 파일을 생성하고 Windows에서 설치·검증한다. `.venv/`는 Git에서 제외한다.
4. 사용할 MySQL이 없다면 Microsoft Visual C++ x64 재배포 패키지 요건을 확인한 뒤 MySQL Community Server 8.4 x64 MSI와 MySQL Configurator로 설치·초기화한다. Windows 서비스 자동 시작, 데이터 디렉터리, 포트, 계정을 설정한다. 기존 데이터 디렉터리를 재초기화하지 않는다. Workbench는 필요할 때만 설치하는 선택 도구다. [MySQL Windows 설치](https://dev.mysql.com/doc/refman/8.4/en/windows-installation.html)
5. `backend/.env.example`에 이름과 비밀값 없는 안내를 작성한다. 개인 `.env`는 복사 후 설정한다. 운영 비밀 설정은 서비스 계정만 읽는 외부 설정 파일/보호된 설정으로 전달한다. 설정 파일의 절대 경로를 명시하여 서비스 작업 디렉터리에 따라 다른 `.env`가 읽히지 않게 한다.
6. MySQL에 `utf8mb4`, InnoDB, 엄격한 SQL 모드, UTC 저장 규칙을 적용하고 별도 개발/테스트 스키마와 계정을 만든다. 단일 장비에서는 DB를 loopback에 바인딩한다. 원문 시각의 시간대 정보는 JSON에 보존한다.
7. 최초 Alembic 마이그레이션을 생성·검토한 뒤 개발/테스트 DB에 적용한다. mock 정제→저장→조회→판정을 PowerShell에서 확인한다.
8. WinSW 안정 버전과 해당 런타임을 확인하고 Uvicorn을 Windows 서비스로 등록한다. 실행 파일, 작업 디렉터리, 서비스 계정, 환경설정 경로, 로그 경로를 절대 경로로 지정한다. 등록 단계에만 관리자 권한을 사용하고 앱은 제한된 서비스 계정으로 실행한다.
9. Windows용 Codex 실행 파일과 Gemini SDK를 각각 검증한다. 서비스 계정의 인증·파일 접근·비대화형 실행을 시험하고 CLI 버전을 고정한다. 사용자 데스크톱에서 실행된다는 이유만으로 서비스에서도 성공한다고 간주하지 않는다.
10. 재부팅·로그아웃·DB 지연 시작·API 강제 종료·실행 중 취소를 시험하고 자동 복구와 데이터 정합성을 확인한다. 실제 공급자 호출은 별도 연결 시험으로 기록한다.

예정 설정 키는 `APP_ENV`, `APP_CONFIG_FILE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA`, `RAW_STORAGE_DIR`, `LOG_DIR`, `NORMALIZATION_PROVIDER=mock|codex|gemini`, `CODEX_EXECUTABLE`, `CODEX_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `PROVIDER_TIMEOUT_SECONDS`, `PROVIDER_MAX_CONCURRENCY`, `ALLOW_PROVIDER_FALLBACK`이다. DB 주소・Windows 경로・모델명은 도메인 코드에 넣지 않는다. 기본 공급자는 `mock`, 다른 공급자로의 자동 전환은 기본 비활성으로 둔다.

다음은 **해당 구성 파일과 모듈을 만든 이후** PowerShell에서 실행할 명령 예시다. 현재 빈 프로젝트에서는 실행하지 않는다. 기준 디렉터리는 `backend/`이며 MySQL은 앞 단계에서 Windows 서비스로 설치·시작되어 있어야 한다.

```powershell
uv python install 3.13
uv python pin 3.13
uv lock
uv sync --locked --group dev
uv sync --locked --group dev --extra gemini
uv run --locked alembic upgrade head
uv run --locked pytest -m "not integration and not live"
uv run --locked pytest -m integration
uv run --locked ruff check .
uv run --locked mypy app
uv run --locked python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --loop asyncio --http h11
```

Gemini extra 동기화는 Gemini를 사용할 때만 필요하다. pytest 표식도 구현 예정이다. `integration`은 전용 테스트 DB 설정과 격리 검사를 통과해야 실행한다. Windows CI에서 잠금 파일을 임의 갱신하지 않도록 `--locked`를 사용한다. 서버 배포 시에는 개발 의존성 없이 `uv sync --locked --no-dev`로 설치하고, 필요한 경우 `--extra gemini`를 추가한다. [uv 잠금·동기화](https://docs.astral.sh/uv/concepts/projects/sync/)

### Windows 서비스 운영

- MySQL은 자체 Windows 서비스로 등록하고 서비스 이름은 설치 결과에서 확인한다. API는 WinSW로 등록하여 로그인 여부와 무관하게 부팅 후 시작한다. [MySQL 서비스](https://dev.mysql.com/doc/refman/8.4/en/windows-start-service.html), [WinSW](https://github.com/winsw/winsw)
- WinSW는 설치 시 검증한 안정 버전을 고정한다. 서비스 실행 대상으로 프로젝트 `.venv/Scripts/python.exe`의 절대 경로를 지정하고 `-m uvicorn app.main:app --loop asyncio --http h11 --workers 1` 등 검증된 인자를 넘긴다. 서비스 시작 때 패키지를 다운로드하거나 다시 설치하지 않는다.
- API 프로세스는 한 개로 시작하고 운영에서는 `--reload`를 사용하지 않는다. Uvicorn의 Windows 호환 루프인 `asyncio`를 명시한다. [Uvicorn 공식 설정](https://raw.githubusercontent.com/encode/uvicorn/master/docs/settings.md)
- 지연 자동 시작과 실패 후 재시작 정책, 정상 종료 대기 시간, 로그 회전을 설정한다. MySQL 서비스 시작만으로 연결 준비가 끝났다고 보지 않고 앱에서 제한된 재접속과 readiness 상태를 처리한다.
- 서비스 설정 예시는 추후 `backend/deploy/windows/`, 설치·점검 PowerShell은 `backend/scripts/`에 둔다. 실제 비밀번호·인증 파일은 Git에 포함하지 않는다. 공통 운영 문서는 계속 `backend/docs/`에서 관리한다.
- 원본·DB 데이터·로그는 배포 소스와 분리한 Windows 데이터 디렉터리에 두고 NTFS 접근 권한을 설정한다. 파일 경로는 `pathlib`로 처리하며 공백·한글 경로도 시험한다. Python/CLI 입출력·로그는 UTF-8을 명시한다.
- Windows 방화벽은 필요한 수신 포트만 허용한다. 외부 HTTPS 진입점·인증서 갱신 방식을 운영 환경에 맞춰 정하고, 프록시가 같은 장비에 있으면 API는 loopback으로 연결한다. Uvicorn 개발 포트를 그대로 외부 공개하지 않는다.
- 로그아웃·재부팅 후 복구, Windows 업데이트 재부팅 시간, 절전 방지, 백업·복원 절차를 운영 점검에 포함한다. 백업 자동화가 필요하면 Windows 작업 스케줄러를 사용하되 복지 처리용 업무 스케줄러는 이번 구현에 추가하지 않는다.

## 5. 구현 구조와 영향 범위

하나의 백엔드 안에서 아래 책임을 나눈다. 기존 모듈 구조를 유지하고 검색·판정 책임만 명확히 추가한다.

| 영역 | 구현할 책임 |
| --- | --- |
| `app/contracts/` | 정제 JSON v2.0.0, 필드 레지스트리 v1.0.0, 규칙 트리, 근거, 사용자 fact 및 평가 문맥 계약 |
| `app/core/` | 설정·로그·실행 한도. 업무 로직은 넣지 않음. |
| `modules/parsers/` | 전달받은 JSON/XML/이미지 검증, 결정적 추출, 원본 위치·페이지 경계 보존 |
| `modules/llm/` | 동일 후보 계약을 반환하는 mock/Codex/Gemini 어댑터 |
| `modules/normalization/` | 명확한 필드의 코드 매핑, 필요한 의미 추출 요청, 규칙·논리 관계 정규화 |
| `modules/validation/` | 타입·필드·단위·기준·근거·논리 완전성 검증, 검수 이슈 구분 |
| `modules/storage/` | MySQL 저장·조회, 원본 영속 저장 경계, 트랜잭션, 개정 이력, 파생 검색 데이터 |
| `modules/pipeline/` | 처리 순서, 앱 소유 ID/해시/버전/시각, 작업 상태·재시도·부분 실패 |
| `modules/matching/` (신규 예정) | 프로필 어댑터, 보수적 후보 검색, 코드만 사용하는 PASS/FAIL/UNKNOWN 판정 |
| `app/api/`, `app/main.py` | HTTP 변환과 앱 조립. 내부 함수/CLI를 먼저 완성하고 필요한 API만 노출. |
| `migrations/`, `tests/`, `docs/` | Alembic, 합성 fixture·통합 테스트, 계약·운영·호출법 문서 |

`collectors/`, 프론트엔드, 실제 회원 프로필 DB는 이번 기능 구현 대상이 아니다. 크롤러·스케줄러·알림·개인 AI 서비스는 추가하지 않는다. 모듈 간 호출은 `public.py`에 공개한 인터페이스를 사용한다.

예정 인터페이스는 다음과 같다. 초기 구현은 동기식으로 시작한다.

```text
normalize_and_persist(input_item, options) -> 작업 상태와 식별자만
find_candidates(user_facts, evaluation_context, filters) -> 후보 참조, 미해결 후보, 페이지 정보
evaluate_conditions(record, user_facts, evaluation_context) -> PASS/FAIL/UNKNOWN, 규칙 결과, 필요한 누락 fact
```

정제는 우선 내부 함수와 명시적 CLI 실행으로 제공한다. HTTP `BackgroundTasks`만으로 영속 작업 완료를 보장하지 않는다. 비동기 작업 접수 API가 필요해지면 작업 재개·내구성 요구를 먼저 별도 설계한다. 정제 완료는 DB 커밋 이후에만 보고하며 정제 JSON 본문은 반환하지 않는다.

## 6. MySQL 저장 설계 초안

원본 근거와 정제 JSON을 보존하고, 검색에 필요한 값은 앱 코드가 파생한다. MySQL JSON 컬럼 전체에 직접 인덱스를 붙이는 설계는 사용하지 않는다. 스칼라 컬럼·조건 행을 우선 사용하며 필요한 경우 생성 컬럼 인덱스를 검토한다. [MySQL JSON 및 인덱스](https://dev.mysql.com/doc/refman/8.4/en/json.html)

| 테이블 후보 | 역할 |
| --- | --- |
| `source_documents` | 출처 ID, 수집 시각, 입력 형식, 원본 해시, 영속 원본 참조 및 완전성 |
| `policy_records` | 기관/원천 ID·사업 회차에 기반한 안정 ID, 현재 채택한 개정 포인터 |
| `policy_revisions` | 불변 개정 ID, 전체 canonical JSON, 스키마·처리 버전, 검수 상태, 공개 승인 상태 |
| `policy_condition_index` | 개정별 field/operator/typed value/unit/basis/논리 경로. JSON에서 코드로 생성. |
| `ingestion_jobs`, `ingestion_items` | 작업·항목 상태, 공급자/모델, 단계, 시간, 시도 횟수, 오류, 검증 후보의 재사용 정보 |

테이블명과 실제 컬럼은 계약 구현 시 확정한다. 문자열 비교에 사용할 코드 값은 대소문자/정렬 규칙을 명시한다. 금액은 Python 정수/Decimal과 MySQL BIGINT/DECIMAL로 정확하게 처리하고 float로 변환하지 않는다. 퍼센트, 원화 금액, 기간과 평가 기준은 별도 타입·메타데이터로 둔다. Decimal JSON 직렬화 규칙도 계약에 포함한다.

원본은 먼저 내용 해시 기반 파일을 최종 데이터 디렉터리와 같은 NTFS 볼륨의 임시 경로에 쓰고 파일을 닫은 뒤 최종 경로로 원자적 이동한다. 드라이브 간 이동은 원자적이라고 가정하지 않으며 디스크 동기화·파일 잠금·이동 실패를 검증한다. 그 후 DB에서 원본 참조·개정 JSON·조건 인덱스·현재 개정 포인터·완료 상태를 하나의 트랜잭션으로 커밋한다. 파일시스템과 DB가 단일 트랜잭션인 것처럼 취급하지 않는다. DB 실패 시 남은 원본은 안전하게 재사용/정리하고, 존재하지 않는 원본을 참조하는 완료 상태는 만들지 않는다.

동일 원본·동일 처리 버전의 재입력은 중복으로 식별한다. 원문 변경 또는 처리 버전 변경 시 불변 개정을 추가한다. 제목만 같은 다른 사업·연도·회차를 합치지 않는다. 현재 개정 갱신은 기대 개정 번호 비교와 잠금/유니크 제약으로 보호하며, 늦게 끝난 오래된 작업이 최신 개정을 덮어쓰지 않도록 출처 개정 순서 정책도 둔다. 신뢰할 출처 시각이 없으면 단순 완료 순서로 최신이라고 판단하지 않는다.

장시간 LLM 호출 동안 DB 트랜잭션을 유지하지 않는다. 검증된 후보는 앱 관리 체크포인트에 보존해 저장 실패 재시도에 재사용한다. DB가 내려가면 상태 저장에 성공했다고 보고하지 않고 작업 ID와 실제 실패를 안전한 진단으로 반환한다. 잘못된 출력은 정상 정책 테이블 밖에 격리하고, 유효하지만 불확실한 출력은 `needs_review` 등으로 구분한다. 검증 통과와 공개 승인은 별개다.

최초 마이그레이션은 빈 개발 DB에서 시작한다. 현재 이관할 레코드는 없다. 향후 스키마 변경은 명시적 버전 변환과 인덱스 재생성을 거치며 기존 JSON/근거를 보존한다. 기본 운영 저장소는 MySQL 하나로 두고 테스트용 메모리 대역을 제공한다. JSON 파일 기반 운영 저장소를 동시에 구현하지 않는다.

## 7. 조건 계약·검색·판정 원칙

- 필드 레지스트리는 신청자 성별·나이·주민등록 거주지·자산·주택 보유와 부모 합산 자산부터 시작한다. 비교 연산자, 값 타입, 단위, 기준 시점, 재산 정의와 프로필 매핑을 버전 관리한다.
- 원문의 `all/any/not` 관계와 예외를 보존한다. 빈 논리 그룹, 잘못된 참조, 근거 없는 필드 코드·금융 기준은 검증에서 걸러낸다. 미지원 조건은 삭제하지 않고 미해결 조건으로 보존한다.
- 없는 값, 0, false, 명시적 제한 없음은 다르다. 부모 자산을 신청자 자산으로 대체하거나 부모 중 누락값을 0으로 만들지 않는다. 명시적 성별 제한 없음은 성별 fact 없이 통과한다.
- 나이는 명시된 기준일과 생년월일로 계산한다. 신청일을 모르면 오늘 날짜로 대신하지 않는다. 거주지 계층은 통제된 매핑으로 비교하고 직장·학교·실거주·주민등록은 구분한다.
- `all`은 신뢰할 필수 분기 실패 시 FAIL, 모두 통과할 때 PASS, 나머지는 UNKNOWN이다. `any`는 한 분기 통과 시 PASS, 모두 실패할 때 FAIL, 나머지는 UNKNOWN이다. `not`은 UNKNOWN을 유지한다. 미해결 외부 예외나 원본 누락으로 트리 자체가 불완전하면 전체 결론도 UNKNOWN으로 제한한다.
- SQL 조건 검색은 최종 판정이 아니다. 초기에는 메타데이터로 후보를 좁히고 전체 규칙을 코드에서 평가한다. 부모 정보 누락, 미지원 논리, 접수일 미정 등은 후보에서 제거하지 않는다. 안전성이 입증된 필수 AND 조건만 추후 SQL 최적화한다.
- 인덱스 누락·버전 불일치 시 canonical JSON 평가로 되돌아가거나 명확한 운영 오류를 반환한다. OR 분기의 각 조건을 전부 필수 WHERE 조건으로 결합하지 않는다.
- 결정적 순서, 페이지 크기·커서, 검색 범위/다음 페이지 정보를 반환한다. 일부 페이지만 조회하고 전체 검색이라고 표시하지 않는다. 캐시는 초기에 넣지 않고 추가 시 정책·프로필·평가기 버전과 평가 문맥/시각을 키에 포함한다.
- 해석된 조건의 PASS는 공식 승인이나 현재 접수 가능 여부를 뜻하지 않는다. 개인 프로필과 개인별 판정은 공고 JSON에 저장하지 않는다.

Pydantic 모델을 권위 있는 검증기로 두고 JSON Schema를 생성한다. 엄격한 타입 검증 외에도 필드별 의미·근거·참조·완전성 검증을 추가한다. 공급자용 생성 스키마는 단순화할 수 있지만 최종 검증은 공통으로 수행한다. [Pydantic 엄격 모드](https://docs.pydantic.dev/latest/concepts/strict_mode/)

프롬프트의 예시는 `schema_version=2.0.0`을 초기 기준으로 채택한다. 다만 해시 대상인 원본 fixture 전체는 첨부에 없으므로 제시된 해시를 복사해 일치한다고 주장하지 않는다. 실행 가능한 가상 원본 fixture를 만들고 UTF-8·키 정렬·공백 없는 JSON·한글 보존 규칙으로 SHA-256을 다시 계산한다. 변경 근거는 예제 문서에 남긴다.

## 8. Codex·Gemini 연동 계획

Codex CLI 0.154.0의 로컬 도움말에서 `exec`, stdin 입력, `--image`, `--output-schema`, `--output-last-message`, `--json`, `--sandbox read-only`, `--ephemeral`을 확인했다. 공식 문서도 비대화형 실행과 구조화 출력을 설명한다. 실제 이미지·모델·계정 접근은 연동 시험에서 확인해야 한다. [Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode), [CLI 옵션](https://learn.chatgpt.com/docs/developer-commands?surface=cli)

Codex 어댑터는 Windows용 `codex.exe`의 검증된 절대 경로를 설정값으로 받아 `shell=False` 인자 배열과 UTF-8 stdin으로 실행한다. 현재 PATH의 `codex.ps1` 또는 npm의 `.cmd` 래퍼를 그대로 Python 실행 파일로 취급하지 않는다. 설치 시 네이티브 실행 파일 위치를 확인하고, 필요할 때만 선택한 설치 방식에 맞는 Node/npm을 준비한다.

추출은 별도의 제한된 Windows 계정과 NTFS 권한으로 필요한 입력·스키마·출력 폴더만 접근하도록 구성한다. 앱과 추출 계정의 환경·인증을 분리하고 DB 비밀값을 자식 프로세스에 전달하지 않는다. 제한 계정 실행에 필요한 자격 정보는 Windows 보호 저장소를 사용하고 명령행·소스·로그에 기록하지 않는다. 읽기 전용 샌드박스만으로 호스트 전체 읽기가 차단된다고 가정하지 않는다. 사용자 설정·MCP·훅·불필요한 도구를 상속하지 않는 실행 프로필을 검증한다.

Windows 네이티브 Codex 샌드박스의 대상 OS·서비스 계정에서의 동작은 실제 연동 시험 항목으로 둔다. 지원 여부나 초기 설정 권한 때문에 실패하면 해당 어댑터의 명확한 오류로 보고한다. 샌드박스를 해제하거나 다른 실행환경/공급자로 자동 전환하지 않는다. [공식 Windows 안내](https://learn.chatgpt.com/docs/windows/windows-sandbox)

타임아웃·취소·서비스 종료 시 실행 트리 전체를 정리하도록 Windows Job Object를 사용한다. 임시 파일 핸들·표준 입출력 파이프가 닫힌 후 파일을 정리한다. 프로세스 숨김 실행, 자식 프로세스 잔류, 재부팅 후 임시 파일 복구를 테스트한다. [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)

Gemini는 `google-genai` 공식 SDK로 이미지와 구조화 후보를 요청한다. 공급자 스키마의 지원 범위가 전체 도메인 검증을 대신하지 않으므로 동일 Pydantic/의미 검증을 적용한다. 모델명은 설정값으로 받으며 무료 사용량이나 특정 모델의 영구 제공을 가정하지 않는다. [Gemini 구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output), [이미지 입력](https://ai.google.dev/gemini-api/docs/image-understanding)

두 어댑터 모두 후보 데이터만 반환한다. ID·해시·수집/처리 시각·실제 공급자/모델·저장 대상·인덱스는 앱이 관리한다. 런타임 진단과 업무 JSON을 분리하고, 사용량 미제공은 0이 아닌 미상으로 기록한다.

입력 바이트·이미지 픽셀·문서/페이지 수·응답 크기·시간 제한을 설정 가능하게 두고 초과 시 명시적으로 실패한다. 조건을 몰래 잘라내지 않는다. JSON/XML은 안전하게 파싱하고 근거 위치를 유지하며 이미지 좌표·확신도를 임의 생성하지 않는다. URL/asset reference는 허용된 기존 저장소 참조만 해석하고 공고에 적힌 임의 URL을 자동 조회하지 않는다.

타임아웃, 429, 인증 실패, 빈/차단/잘린 응답, 잘못된 JSON, 읽을 수 없는 이미지를 구분한다. 일시 오류만 제한적으로 재시도하고 인증·스키마 오류를 무한 재시도하지 않는다. 공급자 간 전환은 명시적으로 활성화한 경우에만 허용한다. 기본 테스트는 두 공급자의 transport mock을 사용한다.

## 9. 구현 순서와 완료 기준

| 단계 | 작업 | 통과 기준 |
| --- | --- | --- |
| 1 | Windows Python/uv/의존성, 네이티브 MySQL, 환경변수, Windows CI 기반 | 같은 lock으로 환경 재현, 개발/테스트 DB 분리, 비밀파일 제외 |
| 2 | 필드 레지스트리·JSON 계약·합성 원본 fixture·판정기 | 경계값·UNKNOWN·논리식·근거·원본 해시 검증 통과 |
| 3 | MySQL 저장소·마이그레이션·개정·인덱스 | 실제 테스트 MySQL에서 커밋/롤백/중복/동시성/재시작 후 조회 확인 |
| 4 | JSON/XML/이미지 입력, mock, 정제·검증·pipeline | mock 입력부터 저장까지 연결, 저장 전 성공 보고 금지, 업무 본문 반환 없음 |
| 5 | Codex 및 Gemini 실제 어댑터 | 오프라인 transport 테스트 통과. 실제 호출 검증 여부는 공급자별 별도 기록 |
| 6 | 후보 검색·프로필 어댑터·실행 데모 | AI 호출 0회, PASS/UNKNOWN 후보 누락 없음, 페이지 범위 명확 |
| 7 | Windows 서비스·통합 검증·문서·운영 준비 | 성능 실측, 재부팅·실패 복구, 영향받은 README/공통 문서/TODO 일치 |

서버 사양 재산정은 단계 3~6에서 한다. 공고 1만 건·10만 건, 입력 크기, 동시 정제 1/2건과 조회 부하별로 p95 응답 시간, 메모리, DB CPU/느린 쿼리, 디스크 증가량을 측정한다. 미달 시 인덱스와 쿼리를 먼저 확인한 뒤 DB 분리·메모리·동시 실행 수를 조정한다.

## 10. 검증 계획

기본 오프라인 테스트는 네트워크·운영 DB 없이 Windows에서 수행한다. MySQL 통합 테스트는 Windows에 직접 설치한 별도 테스트 인스턴스 또는 격리된 테스트 스키마·전용 계정을 사용한다. 통합 테스트는 별도 표식으로 구분하고 운영 DB를 가리키면 중단한다. CI 역시 Windows 실행기를 기준으로 하며 DB가 준비되지 않았다면 건너뛴 사유를 보고한다. SQLite나 메모리 대역 통과를 MySQL 호환성 확인으로 보고하지 않는다. 실서비스 호출은 `live`로 명시적으로 활성화하며 호출 비용·인증이 있는 환경에서만 수행한다.

- 조건: 나이 19/20/34/35, 정확히 1억·5억인 자산 경계, 부모 합산/개별 범위, false와 누락, 성별 무제한, AND/OR/NOT, 외부 예외, 신청일 누락, 부적합한 재산 기준, 오래된 fact, 원본·첨부 누락.
- 후보: 참조 판정기가 PASS/UNKNOWN으로 판단한 공고를 검색이 잃지 않는 속성 테스트. 이미 확정된 OR 분기와 무제한 조건에 불필요한 fact를 요청하지 않음.
- 입력/공급자: JSON/XML/이미지 라우팅, XML 외부 엔티티 거부, 크기 초과, 한글 보존, 페이지 경계, 공급자 오류·취소·타임아웃·불완전 출력, 동일 의미 결과의 동등성.
- 저장: 장애 중 거짓 완료 방지, 트랜잭션 롤백, 인덱스 누락/노후화, 같은 입력 재처리, 출처/처리 버전 개정, 동시 실행 경쟁, 이전 작업의 덮어쓰기 방지, 배치 일부 실패, DB 재연결·백업 복원.
- 경계: 조회·판정의 모델 호출 횟수가 0인지 spy로 확인. 정제 완료 결과에 업무 JSON이 없는지 검증. 공급자 출력의 임의 SQL·코드가 실행되지 않는지 확인.
- Windows: 공백·한글 경로, UTF-8 입출력, NTFS 파일 잠금과 같은 볼륨 내 이동, 서비스 계정 권한, Codex 네이티브 실행·취소·자식 프로세스 종료, 로그아웃·재부팅 자동 시작, DB 지연 준비, 백업 복원을 확인.
- 문서: 실제 호출 경로·입력·반환·오류·예시·테스트 명령과 각 `readme.md` 일치. `data-contracts.md`, `project-structure.md`, API 문서, AI 안내, 작업 기록 갱신.

## 11. 지속 관리 TODO

- [x] 저장소와 설치된 도구를 읽기 전용으로 점검한다.
- [x] MySQL 선택을 반영한 서버·의존성·구현 계획을 작성한다.
- [x] Windows 직접 운영 기준으로 서버 사양·설치·서비스 관리·검증 계획을 수정한다.
- [ ] 서버의 Windows 버전·설치 경로·기존 MySQL과 실제 데이터·부하 가정을 확인한다.
- [ ] Windows Python 3.13/uv, 의존성, lock, 개발·테스트 MySQL을 구성한다.
- [ ] MySQL·API Windows 서비스와 계정·로그·자동 복구·백업을 구성한다.
- [ ] 필드 레지스트리, 조건 논리, 버전 계약, 원본 fixture를 구현한다.
- [ ] 입력 처리, Codex/Gemini 어댑터와 오프라인 mock을 구현한다.
- [ ] 공통 검증, MySQL 영속 저장, 마이그레이션·개정·검색 인덱스를 구현한다.
- [ ] 코드만 사용하는 후보 검색·판정과 실행 데모를 구현한다.
- [ ] 경계·불확실성·실패·동시 개정·공급자 동등성 테스트를 통과한다.
- [ ] 별도 허용된 환경에서 MySQL 통합 및 공급자별 실제 연결을 검증한다.
- [ ] 문서·작업 기록·TODO를 실제 완료 상태와 맞춘다.

이번 계획 단계에서 수행한 것은 파일·도구 버전·CLI 도움말 점검과 공식 문서 확인 및 Windows 기준 문서 수정이다. 의존성 설치, Windows 서비스 등록/시작, DB 접속/변경, 모델 호출, 기능 테스트, 부하 시험은 수행하지 않았다.
