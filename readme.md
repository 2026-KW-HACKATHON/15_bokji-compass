# 복지나침반

공공기관의 복지·혜택·지원사업 정보를 수집·정제하여 사용자에게 맞춤 안내하는 프로젝트입니다.

Windows 백엔드 개발환경과 서버 진입점, requirements 기반 의존성 설치, 독립 개발 MySQL 구성을 제공합니다. 설치·실행은 [백엔드 사용법](backend/readme.md)을 참고하세요. 팀원의 공고 원문 수집·파일 저장, Gov24 조회·정책 행 변환과 개발 SQL도 통합했습니다. 조건 판정과 정규화 결과의 MySQL 저장은 후속 구현 대상입니다.



## 사용언어
| 사용부분 | 언어|
| --- | --- |
| backend | 파이썬|
| front   | java 및 javascript(react활용)| 
## 작성법
*반드시 readme.md에 함수 호출 방법 및 반환 값 및 해당 풀더의 역할에대해 정확하게 작성할것.<br>
*각 모듈별로 작업완료시 /docs/내 파일에 정리해서 다음 작업시 참고할수있도록 할것.

1. 담당 폴더에서 작업합니다. 백엔드는 `backend/`, 웹은 `frontend/web/`, 향후 Android 앱은 `frontend/android/`에 구현합니다.
2. 구현을 시작할 때 해당 폴더의 `readme.md`에 역할, 담당자, 실제 사용법과 검증 방법을 작성합니다. 업무 모듈의 외부 공개 진입점은 `public.py`에 둡니다.
3. 공통 문서는 `backend/docs/`와 `frontend/docs/`에서 관리합니다. 개발환경·프로젝트 구조·API·작업 기록을 관리하며 나머지는 기능 구현에 맞춰 작성합니다.
4. 프론트엔드는 백엔드 공개 API로 연결합니다. 서로의 내부 소스, DB 또는 수집 원본을 직접 참조하지 않습니다. 각 영역의 의존성과 실행환경도 분리합니다.
   <br>특히 백엔드와 프론트엔드 구현간에 배포를 고려하여 작성해야합니다.
5. 환경변수가 필요해지면 `backend/.env.example`에 비밀정보 없는 설정 예시를 작성하고, 복사한 `backend/.env`에 개인 설정을 넣습니다. 다른 영역의 `.env`도 Git에서 제외됩니다.
6. 수집 원본과 로컬 데이터는 `backend/data/`에 둡니다. 이 폴더는 `readme.md`만 추적합니다. 추후 작은 합성 테스트 데이터는 해당 `tests/`에서 관리합니다.
7. 커밋 전 `git status --short`와 `git diff --cached`로 포함될 파일을 확인합니다. 실제 키나 개인정보를 코드·문서·샘플에 넣지 않습니다. `.gitignore`는 이미 추적 중인 파일에는 적용되지 않습니다.

## 문서 위치

| 용도 | 작성할 위치 |
| --- | --- |
| 팀원 Git 변경 통합 결과 | [Git 통합 검토](backend/docs/git-sync.md) |
| 팀원 설치·서버 실행·DB·테스트 | [개발환경 사용법](backend/docs/development.md) |
| Windows·MySQL 후속 구현 계획 | [implementation-plan.md](backend/docs/implementation-plan.md) |
| 전체 구조와 공통 개발 규칙 | [backend/docs/project-structure.md](backend/docs/project-structure.md) |
| 데이터 계약 | [backend/docs/data-contracts.md](backend/docs/data-contracts.md) |
| 기능별 README 작성 양식 | [backend/docs/module-readme-template.md](backend/docs/module-readme-template.md) |
| 공개 API 명세 | [backend/docs/api/readme.md](backend/docs/api/readme.md) |
| 프론트엔드 구조와 API 연결 | [architecture.md](frontend/docs/architecture.md), [api-integration.md](frontend/docs/api-integration.md) |
| AI 협업 안내 | [백엔드](backend/docs/ai-guide.md), [프론트엔드](frontend/docs/ai-guide.md) |
| 영역별 작업 기록 | [백엔드](backend/docs/worklog.md), [프론트엔드](frontend/docs/worklog.md) |

백엔드는 Windows에 Python + FastAPI와 MySQL을 직접 설치해 운영하며, Android는 향후 Java 기반 개발을 예정합니다. LLM 모델, Windows 세부 버전·설치 경로, 최종 데이터 스키마는 후속 구현 과정에서 결정합니다. 현재 서버 진입점·개발환경과 원문 수집·파일 저장을 구현했습니다. Gov24 조회는 collectors/gov24_services.py, 정책 행 변환은 normalization/policy.py를 사용하며 각 폴더의 사용법을 따릅니다. 나머지 업무 모듈은 후속 구현용 골격입니다.

## 폴더 트리

아래는 현재 소스 구조입니다. Git 메타데이터·로컬 환경·캐시·비밀 설정·DB 데이터는 생략했습니다. 빈 폴더도 Git에 남도록 각 폴더에 빈 `readme.md`를 두었습니다.

또한 해당 내용은 작업간에 변경하여도 되며, 변경시 해당 파일에서 수정해주시면 감사하겠습니다.

```text
15_bokji-compass/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   |-- __init__.py
|   |   |   |-- health.py
|   |   |   `-- readme.md
|   |   |-- contracts/
|   |   |   |-- __init__.py
|   |   |   |-- public.py
|   |   |   `-- readme.md
|   |   |-- core/
|   |   |   |-- __init__.py
|   |   |   |-- config.py
|   |   |   |-- database.py
|   |   |   `-- readme.md
|   |   |-- modules/
|   |   |   |-- collectors/
|   |   |   |   |-- tests/
|   |   |   |   |   |-- readme.md
|   |   |   |   |   |-- test_data_go_kr.py
|   |   |   |   |   |-- test_gov24_services.py
|   |   |   |   |   `-- test_public.py
|   |   |   |   |-- __init__.py
|   |   |   |   |-- data_go_kr.py
|   |   |   |   |-- gov24_services.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- llm/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- normalization/
|   |   |   |   |-- tests/
|   |   |   |   |   |-- readme.md
|   |   |   |   |   `-- test_policy.py
|   |   |   |   |-- __init__.py
|   |   |   |   |-- policy.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- parsers/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- pipeline/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- storage/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- validation/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- __init__.py
|   |   |   `-- readme.md
|   |   |-- __init__.py
|   |   |-- main.py
|   |   `-- readme.md
|   |-- data/
|   |   `-- readme.md
|   |-- database/
|   |   |-- 001_schema.sql
|   |   |-- 002_seed.sql
|   |   |-- 003_queries.sql
|   |   `-- readme.md
|   |-- docs/
|   |   |-- api/
|   |   |   |-- gov24.md
|   |   |   `-- readme.md
|   |   |-- ai-guide.md
|   |   |-- data-contracts.md
|   |   |-- development.md
|   |   |-- git-sync.md
|   |   |-- implementation-plan.md
|   |   |-- module-readme-template.md
|   |   |-- project-structure.md
|   |   |-- readme.md
|   |   `-- worklog.md
|   |-- scripts/
|   |   |-- common.ps1
|   |   |-- lock.ps1
|   |   |-- mysql.ps1
|   |   |-- mysql_dev.py
|   |   |-- readme.md
|   |   |-- setup-mysql.ps1
|   |   |-- setup.ps1
|   |   |-- start.ps1
|   |   `-- test.ps1
|   |-- tests/
|   |   |-- readme.md
|   |   |-- test_bootstrap.py
|   |   `-- test_mysql_helper.py
|   |-- .env.example
|   |-- .python-version
|   |-- pyproject.toml
|   |-- readme.md
|   |-- requirements-dev.in
|   |-- requirements-dev.txt
|   |-- requirements.in
|   |-- requirements.txt
|   `-- server.py
|-- frontend/
|   |-- android/
|   |   `-- readme.md
|   |-- docs/
|   |   |-- ai-guide.md
|   |   |-- api-integration.md
|   |   |-- architecture.md
|   |   |-- readme.md
|   |   `-- worklog.md
|   |-- web/
|   |   |-- src/
|   |   |   |-- app/
|   |   |   |   `-- readme.md
|   |   |   |-- features/
|   |   |   |   |-- notifications/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- policies/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- profile/
|   |   |   |   |   `-- readme.md
|   |   |   |   `-- readme.md
|   |   |   |-- shared/
|   |   |   |   |-- api/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- ui/
|   |   |   |   |   `-- readme.md
|   |   |   |   `-- readme.md
|   |   |   `-- readme.md
|   |   |-- tests/
|   |   |   `-- readme.md
|   |   `-- readme.md
|   `-- readme.md
|-- .gitignore
`-- readme.md
```
트리에 하위 파일이 생략된 기능 폴더에도 반드시 readme.md를 생성한다.

백엔드의 각 업무 모듈은 다음 기본 형태를 사용한다.

```text
<module>/
├── readme.md
├── __init__.py
├── public.py
└── tests/
    └── readme.md
```

- public.py는 다른 모듈에 공개할 진입점을 둘 위치다.
- 이번에는 모듈 설명과 명확한 미구현 표시만 작성해도 된다.
- 실제 로직이 없는 상태에서 의미 없는 service.py나 클래스를 대량 생성하지 않는다.
- contracts/, core/, api/에는 역할에 맞는 readme.md와 필요한 최소 패키지 파일을 둔다.
- 프론트엔드 기능 폴더는 readme.md부터 작성하고, 프레임워크별 컴포넌트를 임의로 생성하지 않는다.
- 자동 생성 폴더나 외부 라이브러리 폴더에 readme.md를 추가할 필요는 없다.

## 5. 백엔드 모듈 책임과 의존 관계

각 모듈의 readme.md에 아래 책임과 금지 사항을 반영한다.

### contracts

모듈 간 공통 입력·반환 데이터 모델을 관리할 위치다.

다음 개념을 계약 초안으로 문서화한다.

- RawDocument: 원본 자료와 출처 정보.
- ParsedDocument: 추출한 내용과 원문 위치 정보.
- PolicyDraft: 공통 양식으로 정리한 정책 초안.
- ValidationReport: 오류, 경고, 누락, 검수 필요 항목.
- PublishedPolicy: 정해진 승인 기준을 통과한 공개 데이터.

현재는 개념과 경계만 정하고, 복지 대상 조건·금액·신청기간의 최종 필드를 임의로 확정하지 않는다.

공통 계약이 특정 수집기, LLM 공급자, DB 구현에 의존하지 않게 한다.

### collectors

원본 자료와 출처·수집 정보를 확보한다.
정책 해석, 대상 판정, 정제 결과 승인을 담당하지 않는다.

### parsers

입력 형식에 맞게 본문·표·이미지 참조·위치 정보를 추출한다.
복지 조건을 추측하거나 사용자 지원 자격을 판정하지 않는다.

### normalization

직접 필드 매핑과 LLM 추출을 통해 PolicyDraft를 생성한다.
검수 완료나 공개 여부를 스스로 결정하지 않는다.

하나의 문서에 여러 정책이 있거나 여러 문서가 하나의 정책을 설명하는 경우를 수용할 수 있도록 입력·반환 경계를 설계한다.

### validation

초안의 형식, 원문 근거, 누락, 충돌, 필드 간 관계를 검사한다.
누락된 조건을 추측해서 채우지 않는다.

### llm

LLM 공급자 연결과 호출을 담당한다.
추후 공급자를 교체할 수 있도록 공개 인터페이스를 분리한다.

DB 변경, 정책 공개, 임의 코드 실행, 브라우저 조작 권한을 포함하지 않는다.

### storage

원본, 초안, 검증 결과, 승인된 데이터의 저장·조회를 담당한다.
정책의 의미 해석이나 승인 여부 판단을 담당하지 않는다.

DB 종류와 저장 기술은 미정으로 남긴다.

### pipeline

모듈 실행 순서, 저장 시점, 실패 상태, 재처리, 검수·승인 흐름을 연결한다.
다른 모듈의 실제 처리 로직을 복사해서 구현하지 않는다.

검증 통과와 공개 승인을 구분하며, 검증만 끝났다는 이유로 자동 공개하지 않는다.

### api

HTTP 요청·응답 변환, 접근권한 확인 지점, 기능 호출을 담당할 위치다.
수집·정제·LLM 호출 로직을 라우터에 직접 작성하지 않는다.

인증·인가 구현은 후속 보안 작업으로 명시하고 이번에 임의 구현하지 않는다.

### core

설정, 로그 등 최소 공통 기반만 둔다.
기능의 위치가 애매하다는 이유로 비즈니스 로직을 core에 모으지 않는다.

### 공통 의존 규칙

- 외부 모듈은 다른 모듈의 public.py에 공개된 인터페이스만 사용한다.
- 내부 구현 파일을 직접 import하지 않는다.
- 순환 의존성을 만들지 않는다.
- 모듈 import만으로 외부 호출, 파일 쓰기, DB 변경이 발생하지 않게 한다.
- 실제 구현 단계에서는 외부 서비스를 테스트용 대체 구현으로 주입할 수 있게 한다.
- normalization은 LLM 공개 인터페이스를 사용하고, 공급자 SDK를 직접 참조하지 않도록 설계한다.
- pipeline이 처리 흐름을 조정하고, 개별 모듈이 서로의 실행 순서를 임의로 제어하지 않게 한다.

## 6. 모든 기능 readme.md의 필수 내용

각 기능 readme.md는 단순한 폴더 소개가 아니라 팀원과 AI를 위한 사용·인계 문서로 작성한다.

다음 항목을 포함한다.

1. 목적과 책임
   - 이 모듈이 하는 일과 하지 않는 일.

2. 현재 상태
   - planned / scaffolded / implemented 중 실제 상태.
   - 담당자는 임의로 정하지 않고 미정으로 표시.

3. 공개 진입점과 호출 방법
   - 공개 경로.
   - 함수·클래스·API·CLI 또는 UI 진입점.
   - 동기·비동기 여부.
   - 아직 구현하지 않았다면 "예정 인터페이스 / 현재 호출 불가"를 명시.

4. 입력 규격
   - 입력 타입과 의미.
   - 필수·선택 항목, 기본값, null 처리.
   - 미확정 항목은 미확정으로 구분.

5. 반환 규격
   - 반환 타입과 의미.
   - 정상 결과, 빈 결과, 부분 처리의 구분.
   - 반환값이 없는 경우 None/void와 부작용을 명시.

6. 오류와 예외
   - 실패 종류.
   - 재시도 가능 여부.
   - 검수 필요 상태와 시스템 오류의 구분.

7. 부작용과 의존성
   - 외부 호출, 파일·DB 변경 여부.
   - 필요한 모듈과 설정.
   - 중복 실행 시 동작은 확정 여부를 포함하여 설명.

8. 사용 예시
   - 구현된 호출과 예정 호출을 명확히 구분.
   - 가상의 정책 예시는 반드시 예시 데이터라고 표시.
   - 존재하지 않는 함수를 실행 가능한 코드처럼 소개하지 않음.

9. 테스트와 검증
   - 테스트 범위.
   - 실행 명령과 기준 디렉터리.
   - 아직 테스트가 없으면 없다고 명시.

10. AI 후속 작업 안내
    - 먼저 읽을 공통 문서.
    - 수정 시 함께 확인할 계약·호출자·테스트.
    - 변경하면 안 되는 경계와 현재 미구현 사항.

프론트엔드 UI 모듈은 함수 반환값을 억지로 정의하지 않는다.
대신 입력 속성, 사용자 이벤트, 콜백, 화면 상태, API 연결을 설명한다.

설명은 한국어로 작성하고, 코드 식별자와 경로는 영어를 사용한다.

## 7. 공통 문서 작성 기준

### backend/docs/project-structure.md

전체 구조와 공통 개발 규칙의 기준 문서로 작성한다.

폴더 책임, 모듈 경계, 의존 관계, 문서 위치, 백엔드·프론트엔드 분리 원칙을 포함한다.
현재 생성된 구조와 향후 계획을 구분한다.

### backend/docs/data-contracts.md

데이터 계약 v0.1 초안 문서로 작성한다.

원본·정제 초안·검증 결과·공개 데이터의 구분과 다음 원칙을 포함한다.

- 원본과 출처를 보존한다.
- 모름, 원문에 미기재, 명시적으로 제한 없음은 구분한다.
- 추출한 값과 근거를 연결할 수 있어야 한다.
- 스키마·추출기·프롬프트 등의 버전을 추적할 수 있어야 한다.
- 내부 초안과 외부 공개 응답을 구분한다.
- 미확정 사항은 결정된 사실처럼 작성하지 않는다.

### backend/docs/module-readme-template.md

기능별 readme.md 작성 양식의 기준 문서로 만든다.
프론트엔드에서도 이 문서를 참조하고 동일한 양식을 복제 관리하지 않는다.

### backend/docs/api/readme.md

공개 API 명세의 관리 위치와 변경 절차를 설명한다.
현재 비즈니스 API가 미구현임을 명시한다.

구현하지 않은 엔드포인트를 실제 API처럼 문서화하지 않는다.
openapi.json은 후속 API 구현에서 실제 코드로부터 생성하도록 안내하고, 이번에는 가짜 명세를 만들지 않는다.

### 각 영역의 docs/ai-guide.md

후속 AI 작업의 문서 확인 순서와 작업 규칙을 작성한다.

공통 내용:
- 영역 readme → 공통 규칙 → 대상 기능 readme → 실제 코드와 테스트 순서로 확인.
- 코드와 문서가 다르면 실제 상태를 확인하고 불일치를 보고.
- 공개 규격 변경 시 계약, 호출자, 문서, 예제, 테스트를 함께 점검.
- 요청하지 않은 전체 리팩터링 금지.
- 미구현 기능을 구현 완료로 보고하지 않음.
- 테스트를 실행하지 않았으면 성공했다고 기록하지 않음.
- 작업 내용과 남은 사항을 해당 영역 docs/worklog.md에 기록.

프론트엔드 지침에는 백엔드 내부 구현 대신 공개 API 계약을 사용한다는 점을 추가한다.

### frontend/docs/architecture.md

웹과 Android 영역, 기능 폴더, 공통 UI와 API 클라이언트의 책임을 설명한다.
웹 프레임워크와 Android 구체 구현 방식은 미확정으로 남긴다.

### frontend/docs/api-integration.md

백엔드 공개 API 명세의 위치를 참조한다.
연결·로딩·빈 결과·오류 처리의 책임을 설명한다.

API 명세를 별도 원본처럼 복사하지 않는다.
개발용 예시 데이터와 실제 서버 응답을 구분하며, 서버 오류를 가짜 성공 데이터로 숨기지 않는 원칙을 작성한다.

### 각 영역의 docs/worklog.md

이번에 생성·수정한 내용, 실제 검증 결과, 미구현 항목, 추후 결정 사항을 기록한다.
계획과 완료 상태를 구분한다.

## 8. 설정과 스켈레톤 작성 기준

- backend/pyproject.toml은 기존 설정을 존중하여 최소한으로 작성한다.
- backend/app/main.py는 앱 시작·조립의 진입점으로만 사용한다.
- 필요한 경우 최소 FastAPI 앱 생성까지만 작성하고 비즈니스 API는 추가하지 않는다.
- 아직 없는 프론트엔드 프로젝트를 임의의 프레임워크로 초기화하지 않는다.
- Android Gradle 프로젝트나 SDK 설치를 시작하지 않는다.
- DB, LLM SDK, 브라우저 자동화, OCR, 작업 큐를 이번 단계에서 설치하거나 연결하지 않는다.
- 실제 비밀키를 읽어 출력하거나 문서·샘플 파일에 넣지 않는다.
- .env.example에는 안전한 예시와 설정 설명만 작성한다.
- 의존성 잠금 파일을 만들 경우 실제 도구가 생성한 결과만 사용한다.

.gitignore에는 실제 비밀정보, 가상환경, 캐시, 로컬 DB, 수집 원본, 로그, 빌드 산출물 등을 제외하도록 설정한다.

단, backend/data/readme.md와 .env.example 같은 안내 파일은 추적 가능하게 유지한다.
작은 합성 테스트 데이터는 추후 tests/에서 관리하도록 안내한다.

## 9. 완료 검증과 보고

완료 전에 다음을 확인한다.

- 실제 생성한 트리가 문서의 현재 구조와 일치하는지.
- 모든 직접 관리하는 기능 폴더에 소문자 readme.md가 있는지.
- 공통 문서가 backend/docs/와 frontend/docs/에 모여 있는지.
- 문서 링크가 존재하는 대상이나 명확히 표시한 예정 경로를 가리키는지.
- 미구현 인터페이스가 실제 호출 가능한 것처럼 설명되어 있지 않은지.
- 백엔드·프론트엔드 코드와 실행환경이 서로 섞이지 않았는지.
- 원치 않는 외부 호출이나 초기화 작업이 추가되지 않았는지.
- 기존 파일과 사용자 변경이 보존되었는지.
- 작성한 Python 파일과 설정 파일에 확인 가능한 문법 오류가 없는지.

백엔드 자체 검증은 프론트엔드 폴더의 존재에 의존하도록 만들지 않는다.
전체 저장소 문서 링크 검사는 별도의 구조 점검으로 취급한다.

실행할 수 없는 검증은 실행했다고 보고하지 말고 사유를 적는다.
비즈니스 로직이 미구현인 상태에서 기능 테스트 통과나 서비스 완성을 주장하지 않는다.

최종 답변에는 아래 내용만 정리한다.

1. 생성·수정한 주요 파일과 실제 프로젝트 트리.
2. 문서 진입점과 공통 규칙의 기준 위치.
3. 실제 수행한 검증과 결과.
4. 아직 구현하지 않은 기능 및 다음 단계에서 결정할 사항.

## MySQL 개발용 SQL 초안 (2026-09-18)

[backend/database/readme.md](backend/database/readme.md)에 프레임워크와 독립적인 스키마·가상 데이터·조회 예제가 있습니다. 현재 통합 서버는 Python/FastAPI이며 SQL 초안은 MySQL 8.0.44의 별도 테스트 스키마에서 검증했습니다(2026-09-21). 정책 저장 연결과 운영 마이그레이션은 후속 작업입니다. 초기 언어 검토 이력은 백엔드 작업 기록에 보존했습니다.
