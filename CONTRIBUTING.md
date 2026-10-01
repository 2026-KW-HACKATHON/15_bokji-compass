# 개발 및 협업 안내

> 2026-10-01 공고 저장 갱신: 파싱은 기본 MySQL이며 이전 파일 전용·DB 저장 미구현 설명은 [현재 저장 계약](backend/docs/policy-storage.md)으로 대체됩니다. 웹 더미/002 seed는 제거했고 개인 안내는 DB 기반 로컬 질의응답까지 구현했습니다.

팀 내부 작업 규칙, 구현 범위, 문서 위치를 정리한 개발 안내. 서비스 소개와 화면은 [프로젝트 README](readme.md) 참고.

공공기관의 복지·혜택·지원사업 정보를 수집·정제하여 사용자에게 맞춤 안내하는 프로젝트입니다.

프론트엔드는 React 기반 개인비서 추천 웹입니다. 내 정보 입력 → 추천 공고와 이유 확인, 태그 검색·저장, 시니어를 위한 쉬운 화면, 서버에 연결된 로그인·회원가입을 제공합니다. 소득·재산 계산은 비회원도 사용할 수 있고, 로그인 후 동의하면 입력값을 계정에 저장합니다. 공고·추천의 개발 기본값은 합성 예시이며 운영 빌드는 서버 API를 요청합니다. 실제 공고·LLM 추천 서버 API는 후속 구현입니다. [웹 실행 방법](frontend/web/readme.md), [Android/iOS 확장 구조](frontend/docs/architecture.md), [배포](frontend/docs/deployment.md), [제안 HTTP 계약](frontend/docs/service-contract.md)을 참고하세요.

백엔드 엔드포인트·응답·포트·CORS·웹/모바일 연동 현황은 루트의 [API 관리대장](api-management.md)에서 관리합니다. [전체 문서 점검 결과](backend/docs/documentation-audit.md)에는 갱신 상태와 보완 내역을 기록합니다.

Windows 백엔드 개발환경과 서버 진입점, requirements 기반 의존성 설치, 독립 개발 MySQL 구성을 제공합니다. 설치·실행은 [백엔드 사용법](backend/readme.md)을 참고하세요. 팀원의 공고 원문 수집·파일 저장, Gov24 조회·정책 행 변환과 개발 SQL도 통합했습니다. 공고 전체의 신청 자격 판정과 정규화 정책 결과의 MySQL 저장은 후속 구현 대상입니다.



**DB 접속 설정은 구현되어 있지만 파싱 결과의 MySQL 저장은 미구현입니다.** 현재 결과는 JSON 초안 파일로 저장합니다. [현재 상태](backend/docs/implementation-status.md).

macOS 팀원용 [설치·서버 실행·Codex CLI 파싱 안내](backend/docs/macos-development.md) 제공. 운영 서버는 Windows 유지.

코드 우선 조건 분류·조건 v2·공식 행정동/법정동 분류 구현. [사용법·갱신·검증 범위](backend/docs/condition-classification.md). 실제 정책 DB 저장·추천 API는 후속.

소득·재산 계산은 `/v1/finance`에서 서버 규칙으로 실행합니다. [금융 모듈·회원 저장·MySQL 초기화](backend/app/modules/finance/readme.md), [공식 산정 규칙·계산 한계](backend/docs/financial-rules.md), [웹 계산기](frontend/web/src/features/finance/readme.md)를 참고하세요. 결과는 입력값에 따른 예상치이며 공고 전체의 신청 자격 확정을 의미하지 않습니다.

## 사용언어
| 사용부분 | 언어|
| --- | --- |
| backend | 파이썬|
| front   | 웹 JavaScript/React · 모바일 TypeScript/React Native + Expo |
## 작성법
*반드시 readme.md에 함수 호출 방법 및 반환 값 및 해당 풀더의 역할에대해 정확하게 작성할것.<br>
*각 모듈별로 작업완료시 /docs/내 파일에 정리해서 다음 작업시 참고할수있도록 할것.

1. 담당 폴더에서 작업합니다. 백엔드는 `backend/`, 웹은 `frontend/web/`, Android·iOS 공통 앱은 `frontend/mobile/`, 공통 금융 모델은 `frontend/packages/core/`에 구현합니다. [모바일 실행](frontend/mobile/readme.md).
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
| 중간발표 사업계획서·PPT·차별화 참고안 | [중간발표 자료](중간발표_자료/readme.md) |
| 현재 구현·DB 연결 범위 | [접속 설정과 정책 저장 구분](backend/docs/implementation-status.md) |
| 팀원 Git 변경 통합 결과 | [Git 통합 검토](backend/docs/git-sync.md) |
| 코드·Codex CLI 분류 실증 | [표본 6개 실증 결과](backend/docs/classification-experiment.md) |
| 제안 스키마 적용 예시 | [실제 데이터 정렬 샘플](backend/docs/schema-sample.md) |
| Rawdata 파싱·모델 설정 | [JSON/XML 파싱·Codex CLI 사용법](backend/docs/raw-parsing.md) |
| 팀원 설치·서버 실행·DB·테스트 | [개발환경 사용법](backend/docs/development.md) |
| Windows·MySQL 후속 구현 계획 | [implementation-plan.md](backend/docs/implementation-plan.md) |
| 전체 구조와 공통 개발 규칙 | [backend/docs/project-structure.md](backend/docs/project-structure.md) |
| 데이터 계약 | [backend/docs/data-contracts.md](backend/docs/data-contracts.md) |
| 기능별 README 작성 양식 | [backend/docs/module-readme-template.md](backend/docs/module-readme-template.md) |
| 엔드포인트·설정·클라이언트 통합 관리 | [api-management.md](api-management.md) |
| 공개 API 상세·외부 공급자 참고 | [backend/docs/api/readme.md](backend/docs/api/readme.md) |
| 소득·재산 계산·회원 저장 | [금융 모듈](backend/app/modules/finance/readme.md), [공식 산정 규칙·한계](backend/docs/financial-rules.md), [웹 계산기](frontend/web/src/features/finance/readme.md) |
| 계산기·화면 개선 인수인계 | [기능·저장·배포·후속 추천 연결](frontend/docs/finance-calculator.md) |
| 전체 문서 갱신 점검 | [documentation-audit.md](backend/docs/documentation-audit.md) |
| 프론트엔드 구조와 API 연결 | [architecture.md](frontend/docs/architecture.md), [api-integration.md](frontend/docs/api-integration.md) |
| AI 협업 안내 | [백엔드](backend/docs/ai-guide.md), [프론트엔드](frontend/docs/ai-guide.md) |
| 영역별 작업 기록 | [백엔드](backend/docs/worklog.md), [프론트엔드](frontend/docs/worklog.md) |

백엔드는 Windows에 Python + FastAPI와 MySQL을 직접 설치해 운영하며, Android·iOS는 React Native + Expo 공통 앱으로 개발합니다. 서버 진입점·개발환경·원문 수집·파일 저장과 rawdata 파싱을 구현했습니다. `backend/scripts/parse-raw.ps1`은 `.env`에서 지정한 Codex CLI 모델로 조건을 추출하고 검증된 초안을 저장합니다. 기본 Luna·검증 실패 시 Terra 재시도이며 모델 변경 가능. Gov24 조회는 collectors/gov24_services.py, 기존 SQL 초안 행 변환은 normalization/policy.py를 사용합니다. MySQL 적재·자격 판정·HTTP 분석 API는 후속 구현 대상입니다.

## 폴더 트리

아래는 현재 프로젝트의 실제 소스 구조를 정리한 트리입니다. 로컬 환경 파일, 캐시, 비밀 설정 파일, 생성된 Python 캐시, DB 데이터는 생략했습니다.

```text
15_bokji-compass/
|-- api-management.md
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |   |-- __init__.py
|   |   |   |-- auth.py
|   |   |   |-- finance.py
|   |   |   |-- health.py
|   |   |   `-- readme.md
|   |   |-- contracts/
|   |   |   |-- __init__.py
|   |   |   |-- conditions.py
|   |   |   |-- finance.py
|   |   |   |-- parsing.py
|   |   |   |-- public.py
|   |   |   `-- readme.md
|   |   |-- core/
|   |   |   |-- __init__.py
|   |   |   |-- config.py
|   |   |   |-- database.py
|   |   |   `-- readme.md
|   |   |-- modules/
|   |   |   |-- auth/
|   |   |   |   |-- __init__.py
|   |   |   |   |-- __main__.py
|   |   |   |   |-- models.py
|   |   |   |   |-- schema.py
|   |   |   |   |-- service.py
|   |   |   |   `-- readme.md
|   |   |   |-- collectors/
|   |   |   |   |-- tests/
|   |   |   |   |   |-- readme.md
|   |   |   |   |   |-- test_bokjiro_services.py
|   |   |   |   |   |-- test_data_go_kr.py
|   |   |   |   |   |-- test_gov24_services.py
|   |   |   |   |   |-- test_kwangwoon_notices.py
|   |   |   |   |   `-- test_public.py
|   |   |   |   |-- __init__.py
|   |   |   |   |-- bokjiro_services.py
|   |   |   |   |-- data_go_kr.py
|   |   |   |   |-- gov24_services.py
|   |   |   |   |-- kwangwoon_notices.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- finance/
|   |   |   |   |-- __init__.py
|   |   |   |   |-- __main__.py
|   |   |   |   |-- public.py
|   |   |   |   |-- rules.py
|   |   |   |   |-- schema.py
|   |   |   |   |-- storage.py
|   |   |   |   `-- readme.md
|   |   |   |-- llm/
|   |   |   |   |-- tests/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- __init__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- metrics/
|   |   |   |   |-- __init__.py
|   |   |   |   |-- kwangwoon.py
|   |   |   |   `-- readme.md
|   |   |   |-- normalization/
|   |   |   |   |-- tests/
|   |   |   |   |   |-- readme.md
|   |   |   |   |   `-- test_policy.py
|   |   |   |   |-- __init__.py
|   |   |   |   |-- policy.py
|   |   |   |   |-- public.py
|   |   |   |   |-- raw.py
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
|   |   |   |   |-- __main__.py
|   |   |   |   |-- public.py
|   |   |   |   `-- readme.md
|   |   |   |-- presentation/
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
|   |   |   |-- bokjiro_services_api.md
|   |   |   |-- gov24.md
|   |   |   |-- gov24_services_api.md
|   |   |   `-- readme.md
|   |   |-- ai-guide.md
|   |   |-- api-data-analysis.md
|   |   |-- classification-experiment.md
|   |   |-- data-contracts.md
|   |   |-- development.md
|   |   |-- documentation-audit.md
|   |   |-- financial-rules.md
|   |   |-- git-sync.md
|   |   |-- implementation-plan.md
|   |   |-- implementation-status.md
|   |   |-- macos-development.md
|   |   |-- module-readme-template.md
|   |   |-- project-structure.md
|   |   |-- raw-parsing.md
|   |   |-- readme.md
|   |   |-- schema-sample.md
|   |   `-- worklog.md
|   |-- experiments/
|   |   |-- welfare_classification/
|   |   |   |-- __init__.py
|   |   |   |-- contracts.py
|   |   |   |-- readme.md
|   |   |   |-- review.py
|   |   |   |-- rules.py
|   |   |   |-- run.py
|   |   |   `-- schema_sample.py
|   |   `-- __init__.py
|   |-- scripts/
|   |   |-- common.ps1
|   |   |-- common.sh
|   |   |-- lock.ps1
|   |   |-- mysql.ps1
|   |   |-- mysql_dev.py
|   |   |-- parse-raw.ps1
|   |   |-- parse-raw.sh
|   |   |-- readme.md
|   |   |-- setup-mysql.ps1
|   |   |-- setup.ps1
|   |   |-- setup.sh
|   |   |-- start.ps1
|   |   |-- start.sh
|   |   |-- test.ps1
|   |   `-- test.sh
|   |-- tests/
|   |   |-- readme.md
|   |   |-- test_auth.py
|   |   |-- test_bootstrap.py
|   |   |-- test_classification_experiment.py
|   |   |-- test_finance_api.py
|   |   |-- test_finance_rules.py
|   |   |-- test_mysql_helper.py
|   |   `-- test_raw_parsing.py
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
|   |-- ios/
|   |   `-- readme.md
|   |-- docs/
|   |   |-- ai-guide.md
|   |   |-- api-integration.md
|   |   |-- architecture.md
|   |   |-- deployment.md
|   |   |-- senior-mode.md
|   |   |-- service-contract.md
|   |   |-- readme.md
|   |   `-- worklog.md
|   |-- web/
|   |   |-- deploy/nginx.conf
|   |   |-- deploy/readme.md
|   |   |-- public/app-config.js
|   |   |-- public/favicon.svg
|   |   |-- index.html
|   |   |-- package.json
|   |   |-- package-lock.json
|   |   |-- vite.config.js
|   |   |-- playwright.config.js
|   |   |-- src/
|   |   |   |-- main.jsx
|   |   |   |-- app/
|   |   |   |   |-- App.jsx
|   |   |   |   |-- services.js
|   |   |   |   |-- styles.css
|   |   |   |   `-- readme.md
|   |   |   |-- features/
|   |   |   |   |-- assistant/
|   |   |   |   |   |-- AssistantHome.jsx
|   |   |   |   |   |-- recommendationRepository.js
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- auth/
|   |   |   |   |   |-- AuthPage.jsx
|   |   |   |   |   |-- authApi.js
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- finance/
|   |   |   |   |   |-- CalculatorPage.jsx
|   |   |   |   |   |-- calculator.css
|   |   |   |   |   |-- financeApi.js
|   |   |   |   |   |-- financeModel.js
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- notifications/
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- policies/
|   |   |   |   |   |-- demoPolicies.js
|   |   |   |   |   |-- policyRepository.js
|   |   |   |   |   |-- policyModel.js
|   |   |   |   |   |-- PolicyExplorer.jsx
|   |   |   |   |   |-- PolicyDetail.jsx
|   |   |   |   |   |-- PolicyCard.jsx
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- profile/
|   |   |   |   |   |-- profileModel.js
|   |   |   |   |   |-- ProfileForm.jsx
|   |   |   |   |   `-- readme.md
|   |   |   |   `-- readme.md
|   |   |   |-- shared/
|   |   |   |   |-- config.js
|   |   |   |   |-- configModel.js
|   |   |   |   |-- storage.js
|   |   |   |   |-- api/
|   |   |   |   |   |-- client.js
|   |   |   |   |   |-- httpClient.js
|   |   |   |   |   `-- readme.md
|   |   |   |   |-- ui/
|   |   |   |   |   |-- Icon.jsx
|   |   |   |   |   |-- Modal.jsx
|   |   |   |   |   |-- CompassArt.jsx
|   |   |   |   |   `-- readme.md
|   |   |   |   `-- readme.md
|   |   |   `-- readme.md
|   |   |-- tests/
|   |   |   |-- finance.test.js
|   |   |   |-- finance-recommendation.test.js
|   |   |   |-- policies.test.js
|   |   |   |-- e2e/app.spec.js
|   |   |   |-- e2e/auth.spec.js
|   |   |   |-- e2e/calculator.spec.js
|   |   |   `-- readme.md
|   |   `-- readme.md
|   `-- readme.md
|-- .gitattributes
|-- .gitignore
`-- readme.md
```

## 현재 구현과 협업 경계

구현 상태의 기준은 [현재 상태·DB 연결 범위](backend/docs/implementation-status.md)입니다. 초기 빈 골격 생성 지침 대신 실제 코드와 사용법을 기준으로 관리합니다.

- DB는 MySQL로 결정. 접속 설정·독립 개발 DB 구성·readiness 연결 점검 구현. 정책 적재·조회·신규 마이그레이션은 미구현.
- 수집 원문은 collectors/storage, 공급자별 입력 변환은 normalization, 모델 호출은 llm, 근거 검증은 validation, 초안 파일 저장은 pipeline 담당.
- 현재 파싱은 Windows PowerShell 또는 macOS Bash CLI 실행. `.env` 모델 설정을 사용하고 결과는 `backend/data/parsed_policies/`에 저장. HTTP 분석·조회·사용자 판정 API는 후속 구현.
- 파싱 초안의 검증 통과와 DB 저장·검수 승인·공개를 구분. `draft`·자동 판정 비활성 유지.
- 공식 지역 코드 스냅샷과 조건 v2의 논리 구조·필드 사전 구현. 실제 공고의 전체 자격 판정 연결은 후속 작업. 기존 SQL의 합성 지역 코드를 실데이터로 사용하지 않음.
- 프론트엔드는 공개 HTTP 계약으로 연결. 현재 health/readiness·계정 인증·소득/재산 계산 및 계정별 금융정보 저장 API를 제공하며 프론트에서 로컬 파일이나 DB를 직접 참조하지 않음.
- 금융정보는 로그인한 본인의 명시적 동의로 원입력만 저장하고 조회 시 다시 계산. 개발 SQLite와 MySQL 명시적 초기화 경로가 있으며 실제 MySQL 저장 검증은 후속 작업.

## 팀원 작업 순서

1. [백엔드 설치·실행](backend/readme.md)과 [개발환경](backend/docs/development.md) 확인. 각 PC에 `.env`·DB·CLI 로그인 별도 구성.
2. 변경 영역의 README·[데이터 계약](backend/docs/data-contracts.md)·[API 계약](backend/docs/api/readme.md) 확인. 공개 함수의 입력·반환·오류·외부 호출 여부 문서화.
3. 기능 구현 시 공통 설정·수집·파싱·저장 책임 분리. 관련 없는 기능 골격이나 프론트엔드 파일을 임의로 채우지 않음.
4. 코드 변경에 필요한 테스트 실행. 전체 백엔드 검증은 `backend/scripts/test.ps1`. 실제 DB/LLM 검증 여부는 별도 기록.
5. 구조·동작 변경 시 폴더 트리·관련 문서·작업 기록 갱신. 구현된 기능과 후속 계획 구분.
6. 커밋 대상에서 `.env`·인증정보·개인정보·DB 파일·수집 원본·파싱 산출물 제외 확인. 팀원의 원격 변경을 확인하고 분리한 브랜치에서 통합·검증 후 병합.

## 후속 개발

[구현 계획](backend/docs/implementation-plan.md)은 신규 스키마·MySQL 저장소·마이그레이션·검색·사용자 판정의 목표를 설명합니다. 현재 결과는 파일 초안이며 [기존 개발 SQL](backend/database/readme.md)을 실행해도 자동으로 정책 저장 기능이 연결되지 않습니다.

담당자는 필요한 문서를 실제 코드와 함께 갱신합니다. 빈 문서·모듈은 구현 완료로 간주하지 않으며, 팀원의 기존 작업과 비밀 설정은 보존합니다.
