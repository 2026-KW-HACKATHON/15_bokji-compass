# 복지나침반

공공기관의 복지·혜택·지원사업 정보를 수집·정제하여 사용자에게 맞춤 안내하는 프로젝트입니다.

현재는 폴더와 빈 파일만 준비한 상태이며 각 기능부분을 구현하면서 알맞게 사용하면됩니다.



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
3. 공통 문서는 `backend/docs/`와 `frontend/docs/`에서 관리합니다. 아래 문서들은 현재 빈 파일이며, 협의 후 내용을 작성합니다.
4. 프론트엔드는 백엔드 공개 API로 연결합니다. 서로의 내부 소스, DB 또는 수집 원본을 직접 참조하지 않습니다. 각 영역의 의존성과 실행환경도 분리합니다.
   <br>특히 백엔드와 프론트엔드 구현간에 배포를 고려하여 작성해야합니다.
5. 환경변수가 필요해지면 `backend/.env.example`에 비밀정보 없는 설정 예시를 작성하고, 복사한 `backend/.env`에 개인 설정을 넣습니다. 다른 영역의 `.env`도 Git에서 제외됩니다.
6. 수집 원본과 로컬 데이터는 `backend/data/`에 둡니다. 이 폴더는 `readme.md`만 추적합니다. 추후 작은 합성 테스트 데이터는 해당 `tests/`에서 관리합니다.
7. 커밋 전 `git status --short`와 `git diff --cached`로 포함될 파일을 확인합니다. 실제 키나 개인정보를 코드·문서·샘플에 넣지 않습니다. `.gitignore`는 이미 추적 중인 파일에는 적용되지 않습니다.

## 문서 위치

| 용도 | 작성할 위치 |
| --- | --- |
| 전체 구조와 공통 개발 규칙 | [backend/docs/project-structure.md](backend/docs/project-structure.md) |
| 데이터 계약 | [backend/docs/data-contracts.md](backend/docs/data-contracts.md) |
| 기능별 README 작성 양식 | [backend/docs/module-readme-template.md](backend/docs/module-readme-template.md) |
| 공개 API 명세 | [backend/docs/api/readme.md](backend/docs/api/readme.md) |
| 프론트엔드 구조와 API 연결 | [architecture.md](frontend/docs/architecture.md), [api-integration.md](frontend/docs/api-integration.md) |
| AI 협업 안내 | [백엔드](backend/docs/ai-guide.md), [프론트엔드](frontend/docs/ai-guide.md) |
| 영역별 작업 기록 | [백엔드](backend/docs/worklog.md), [프론트엔드](frontend/docs/worklog.md) |

백엔드는 Python + FastAPI, Android는 향후 Java 기반 개발을 예정합니다. 웹 프레임워크, DB, LLM 공급자, 배포 환경, 최종 데이터 스키마는 협업 과정에서 결정합니다. `pyproject.toml`, `main.py`, `public.py`도 현재 빈 파일이므로 실행 가능한 프로젝트 설정이나 기능을 제공하지 않습니다.

## 폴더 트리

아래는 현재 저장소 구조입니다. `.git/`은 생략했습니다. 빈 폴더도 Git에 남도록 각 폴더에 빈 `readme.md`를 두었습니다.

또한 해당 내용은 작업간에 변경하여도 되며, 변경시 해당 파일에서 수정해주시면 감사하겠습니다.

```text
15_bokji-compass/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   |-- __init__.py
|   |   |   `-- readme.md
|   |   |-- contracts/
|   |   |   |-- __init__.py
|   |   |   `-- readme.md
|   |   |-- core/
|   |   |   |-- __init__.py
|   |   |   `-- readme.md
|   |   |-- modules/
|   |   |   |-- collectors/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
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
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
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
|   |-- docs/
|   |   |-- api/
|   |   |   `-- readme.md
|   |   |-- ai-guide.md
|   |   |-- data-contracts.md
|   |   |-- module-readme-template.md
|   |   |-- project-structure.md
|   |   |-- readme.md
|   |   `-- worklog.md
|   |-- tests/
|   |   `-- readme.md
|   |-- .env.example
|   |-- pyproject.toml
|   `-- readme.md
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
|-- plan.md
`-- readme.md
```
