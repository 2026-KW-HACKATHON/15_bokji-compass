# 전체 문서 갱신 점검

점검일: 2026-09-22. 기준 커밋: `a158f5f` 이후 작업 트리. 문서 담당: 해당 영역 변경 담당자.

## 범위와 결론

- 기존 Git 관리 Markdown **63개**(백엔드 43, 프론트 19, 루트 1)를 전수 열거하고 본문 검색·빈 파일·상대 링크를 점검했습니다. node_modules·빌드/테스트 산출물·Git 제외 로컬 데이터는 팀 관리 문서 집계에 포함하지 않습니다.
- 이전 프론트 커밋 `a158f5f`에 프론트 문서 19개와 루트 README 갱신이 포함되어 있음을 Git 변경 목록으로 확인했습니다. 프론트 문서에는 예시 데이터, 실행법, 검증, Android/iOS 확장 경계가 기록되어 있습니다.
- 기존 빈 문서 **9개**를 발견해 보완했습니다. 구현되지 않은 parsers와 테스트가 다른 폴더에 있는 영역은 그대로 구분했습니다. 빈 폴더를 구현 완료로 표시하지 않았습니다.
- 구현된 metrics·presentation의 폴더 README가 없어 2개를 추가했습니다. 루트 API 관리대장과 이 점검 문서를 포함해 관리 문서는 **67개**가 됩니다.
- 최초 상대 파일 링크 140개에는 깨진 경로가 없었습니다. 그중 Git 제외 로컬 생성물 링크 3개는 이 PC에만 존재할 수 있으며 기존 문서의 별도 입력 준비/재현 안내를 유지합니다. 외부 웹 URL과 Markdown 앵커의 유효성은 이번 점검 범위가 아닙니다.
- API·서버 설정·프론트 HTTP 호출은 실제 코드 및 생성 OpenAPI와 직접 대조했습니다. 다른 문서의 “검색 확인”은 전수 검색을 뜻하며, 모든 업무 함수·외부 공급자 사양을 새로 실행 검증했다는 뜻이 아닙니다.

## 발견 사항과 보완

| 항목 | 확인 내용 | 조치 |
|---|---|---|
| 공통 API 관리 위치 | 서버 API, 웹 proxy, 공급자 문서가 분산 | 루트 [api-management.md](../../api-management.md) 신설 및 양쪽 문서에서 연결 |
| 빈 README | parsers 1개, 모듈 tests 7개, README 양식 1개 | 구현 상태·테스트 위치·실행 명령·호출/반환/오류 양식 보완 |
| 누락된 모듈 README | metrics, presentation은 코드만 존재 | 실제 함수 입력/반환·외부 호출·검증 문서 추가 |
| 외부 API 초안 | Gov24 영문 예시와 실제 한글 키, 복지로 미검증 표기가 이후 조사와 혼동 | 초안임을 명시하고 실제 코드/조사 시점과 요청·응답 차이 안내 |
| normalization 저장 설명 | SQL 행 변환 설명이 실제 DB 저장으로 읽힐 수 있음 | 실제 INSERT 미구현·함수 반환만 수행 명시 |
| 자동 문서/프록시 | Swagger 보조 경로와 /api 접두사의 책임이 불명확 | 자동 문서 경로, 인증 미구현, 웹 proxy의 접두사 제거 설명 |
| 루트 작업 영역 | 작업 규칙에 iOS 경로 누락 | Android/iOS 영역과 신규 문서 트리 갱신 |
| 역사 문서 | 과거 worklog/실증의 당시 미구현 상태 | 당시 기록을 최신 기능처럼 덮어쓰지 않고 유지 |

## 검증과 한계

- 실제 생성 OpenAPI의 paths: `/health`, `/health/ready`.
- 보완 후 관리 문서 67개·상대 파일 링크 266개 재점검: 빈 문서 0개, 깨진 파일 경로 0개. 로컬 생성물 링크 3개는 별도 분류했습니다. `git diff --check` 통과.
- TestClient: health 200의 status/service, DB 비활성 readiness 503의 status/database 확인.
- backend 폴더에서 `.venv/Scripts/python.exe -m pytest tests/test_bootstrap.py -q -p no:cacheprovider`: **7개 통과**, 기존 deprecation 경고 2개. DB 준비/불가 분기는 대역으로 검증합니다.
- 이번 변경은 문서만 수정합니다. API 기능·스키마·DB·수집 원문은 변경하지 않습니다. 실제 외부 API·LLM·MySQL·네이티브 기기를 이번에 재검증하지 않았습니다.

## 기존 63개 문서별 점검 목록

“갱신”은 이번 수정, “빈 문서 보완”은 초기 0바이트 문서, “검색 확인”은 기존 내용을 유지한 전수 검색 항목입니다.

| 문서 | 결과 | 점검/보완 범위 |
|---|---|---|
| [backend/app/api/readme.md](../../backend/app/api/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/contracts/readme.md](../../backend/app/contracts/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/core/readme.md](../../backend/app/core/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/modules/collectors/readme.md](../../backend/app/modules/collectors/readme.md) | 갱신 | 실제 표본 조사/회귀 대역 검증 시점 구분 |
| [backend/app/modules/collectors/tests/readme.md](../../backend/app/modules/collectors/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/llm/readme.md](../../backend/app/modules/llm/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/modules/llm/tests/readme.md](../../backend/app/modules/llm/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/normalization/readme.md](../../backend/app/modules/normalization/readme.md) | 갱신 | 행 반환과 실제 INSERT 미구현 구분 |
| [backend/app/modules/normalization/tests/readme.md](../../backend/app/modules/normalization/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/parsers/readme.md](../../backend/app/modules/parsers/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/parsers/tests/readme.md](../../backend/app/modules/parsers/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/pipeline/readme.md](../../backend/app/modules/pipeline/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/modules/pipeline/tests/readme.md](../../backend/app/modules/pipeline/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/readme.md](../../backend/app/modules/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/modules/storage/readme.md](../../backend/app/modules/storage/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/modules/storage/tests/readme.md](../../backend/app/modules/storage/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/modules/validation/readme.md](../../backend/app/modules/validation/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/app/modules/validation/tests/readme.md](../../backend/app/modules/validation/tests/readme.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/app/readme.md](../../backend/app/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/data/readme.md](../../backend/data/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/database/readme.md](../../backend/database/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/ai-guide.md](../../backend/docs/ai-guide.md) | 갱신 | 공통 API 갱신 절차 연결 |
| [backend/docs/api-data-analysis.md](../../backend/docs/api-data-analysis.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/api/bokjiro_services_api.md](../../backend/docs/api/bokjiro_services_api.md) | 갱신 | 초안과 실제 요청/응답 차이, 조사 시점 명시 |
| [backend/docs/api/gov24.md](../../backend/docs/api/gov24.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/api/gov24_services_api.md](../../backend/docs/api/gov24_services_api.md) | 갱신 | 외부 API·한글 실제 필드·현재 수집 범위 구분 |
| [backend/docs/api/readme.md](../../backend/docs/api/readme.md) | 갱신 | 루트 관리대장·자동 문서 경로·proxy 연결 |
| [backend/docs/classification-experiment.md](../../backend/docs/classification-experiment.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/data-contracts.md](../../backend/docs/data-contracts.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/development.md](../../backend/docs/development.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/git-sync.md](../../backend/docs/git-sync.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/implementation-plan.md](../../backend/docs/implementation-plan.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/implementation-status.md](../../backend/docs/implementation-status.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/module-readme-template.md](../../backend/docs/module-readme-template.md) | 빈 문서 보완 | 실제 역할/검증 위치 또는 미구현 상태 명시 |
| [backend/docs/project-structure.md](../../backend/docs/project-structure.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/raw-parsing.md](../../backend/docs/raw-parsing.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/readme.md](../../backend/docs/readme.md) | 갱신 | 관리대장·점검·README 양식 인덱스 |
| [backend/docs/schema-sample.md](../../backend/docs/schema-sample.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/docs/worklog.md](../../backend/docs/worklog.md) | 갱신 | 이번 문서 점검 이력 추가 |
| [backend/experiments/welfare_classification/readme.md](../../backend/experiments/welfare_classification/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/readme.md](../../backend/readme.md) | 갱신 | 관리대장·점검 결과 진입 링크 |
| [backend/scripts/readme.md](../../backend/scripts/readme.md) | 검색 확인 | 빈 파일·링크·구현/계획/이력 표현 검색 |
| [backend/tests/readme.md](../../backend/tests/readme.md) | 갱신 | raw 파싱/실험 테스트·HTTP 검증 위치 추가 |
| [frontend/android/readme.md](../../frontend/android/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/docs/ai-guide.md](../../frontend/docs/ai-guide.md) | 갱신 | 공통 API 갱신 절차 연결 |
| [frontend/docs/api-integration.md](../../frontend/docs/api-integration.md) | 갱신 | 루트 통합 계약 연결 |
| [frontend/docs/architecture.md](../../frontend/docs/architecture.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/docs/readme.md](../../frontend/docs/readme.md) | 갱신 | 관리대장·점검 결과 인덱스 |
| [frontend/docs/worklog.md](../../frontend/docs/worklog.md) | 갱신 | 이번 문서 점검 이력 추가 |
| [frontend/ios/readme.md](../../frontend/ios/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/readme.md](../../frontend/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/readme.md](../../frontend/web/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/app/readme.md](../../frontend/web/src/app/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/features/notifications/readme.md](../../frontend/web/src/features/notifications/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/features/policies/readme.md](../../frontend/web/src/features/policies/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/features/profile/readme.md](../../frontend/web/src/features/profile/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/features/readme.md](../../frontend/web/src/features/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/readme.md](../../frontend/web/src/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/shared/api/readme.md](../../frontend/web/src/shared/api/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/shared/readme.md](../../frontend/web/src/shared/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/src/shared/ui/readme.md](../../frontend/web/src/shared/ui/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [frontend/web/tests/readme.md](../../frontend/web/tests/readme.md) | 검색 확인 | 이전 프론트 커밋의 문서 반영 확인 |
| [readme.md](../../readme.md) | 갱신 | API 관리대장·점검 결과 링크, iOS 작업 영역·문서 트리 보완 |

## 새로 추가한 문서

| 문서 | 역할 |
|---|---|
| [api-management.md](../../api-management.md) | 루트 엔드포인트·응답·환경·클라이언트·변경 책임 관리대장 |
| [metrics/readme.md](../app/modules/metrics/readme.md) | 실제 광운대 공지 집계 진입점과 네트워크/오류/검증 |
| [presentation/readme.md](../app/modules/presentation/readme.md) | 콘솔 문자열 반환 계약과 대역 테스트 |
| [documentation-audit.md](documentation-audit.md) | 이번 전수 검색의 범위·결과·파일별 기록 |
