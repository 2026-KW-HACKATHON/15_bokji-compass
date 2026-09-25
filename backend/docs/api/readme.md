# 공개 API

엔드포인트별 입력·응답 예시, 접속 주소, 프록시/CORS, 담당 파일과 변경 절차는 루트 [API 관리대장](../../../api-management.md)에서 통합 관리합니다. 이 문서는 백엔드 HTTP 계약과 외부 공급자 문서의 진입점입니다.

[실제 응답·가공 검토](../api-data-analysis.md): 2026-09-21 복지로·행안부 소량 실조회 결과. 기존 원천 API 초안과 실제 응답의 차이, 파서 한계 포함.

서버의 `/docs`, `/redoc`, `/openapi.json`에서 실제 코드로 생성한 명세를 확인합니다. 실행은 [개발환경 문서](../development.md)를 따릅니다.

FastAPI의 `/docs/oauth2-redirect`는 Swagger UI 보조 경로이며 OAuth 구현을 뜻하지 않습니다. 백엔드에 `/api` 접두사는 없으며 웹 개발 프록시가 이를 제거합니다. `/v1/auth`는 계정 인증 경로입니다.

| 경로 | 성공 | 실패 |
| --- | --- | --- |
| GET `/health` | 200: 서버 응답 | 프로세스 중지 시 연결 불가 |
| GET `/health/ready` | 200: status=ready, database=reachable | 503: status=not_ready, database=disabled 또는 unavailable |

현재 readiness는 MySQL 연결 검사이며 업무 테이블·정책 유효성 검사가 아닙니다. `/v1/auth/phone/request`, `/phone/verify`, `/signup`, `/login`, `/logout`은 POST이며 `/v1/auth/me`는 GET입니다. [인증 계약·환경설정](../../app/modules/auth/readme.md)을 참고하세요. 변경 시 라우터·테스트·이 문서·호출자를 함께 점검하며 별도 가짜 OpenAPI 파일을 유지하지 않습니다.

소득·재산 계산과 계정별 금융정보 저장은 `finance.router`가 제공합니다. [입력·응답·초기화 방법](../../app/modules/finance/readme.md), [공식 산정 규칙·계산 한계](../financial-rules.md)를 함께 확인하세요.

| 경로 | 접근 | 역할 |
| --- | --- | --- |
| GET `/v1/finance/rules` | 공개 | 지원하는 산정 규칙 조회 |
| POST `/v1/finance/calculate` | 공개 | 입력값 계산, DB 저장 없음 |
| GET `/v1/finance/profile` | 로그인 세션 | 본인이 저장한 입력과 다시 계산한 결과 조회 |
| POST `/v1/finance/profile` | 로그인 세션·저장 동의 | 본인의 금융 원입력 저장 |
| POST `/v1/finance/profile/delete` | 로그인 세션 | 본인의 금융 원입력 삭제 |

회원 금융정보 POST는 `X-Auth-Request: 1` 헤더가 필요합니다. 공개 계산은 인증·DB 비활성 상태에서도 동작합니다. 금융 응답은 오류를 포함해 `Cache-Control: no-store`를 사용하며 검증 오류에 원입력을 포함하지 않습니다. 정책별 `evaluate_policy()`는 서버 내부 연결 지점이며 공고 추천 HTTP API에 아직 연결되지 않았습니다.

`/health/ready`는 SELECT 1만 실행합니다. HTTP 200이어도 정책 스키마·적재·조회 연결이 완료된 것은 아닙니다. [원문 파싱](../raw-parsing.md)은 내부 함수/CLI로만 제공하고 JSON 파일에 초안을 저장합니다. 업로드·분석 요청·정책 조회·공고 전체의 신청 자격 판정 API는 아직 없습니다. [현재 상태](../implementation-status.md).

## 외부 수집 API

[Gov24 원천 API 참고](gov24_services_api.md)는 수집기가 호출하는 외부 API 문서입니다. 이 프로젝트 서버가 해당 엔드포인트를 제공하는 것은 아닙니다. 팀원 명세와 [2026-09-21 실제 응답 조사](../api-data-analysis.md)를 함께 확인합니다.

[복지로 원천 API 참고](bokjiro_services_api.md): 중앙부처 복지서비스 목록·상세 조회. 2026-09-21 실제 API 표본 확인, 2026-09-22 XML 반복·중첩 보존 및 저장된 원문 기반 파싱 검증. 전체 데이터·현재 접수 가능 여부 검증과 구분.
