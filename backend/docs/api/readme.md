# 공개 API

엔드포인트별 입력·응답 예시, 접속 주소, 프록시/CORS, 담당 파일과 변경 절차는 루트 [API 관리대장](../../../api-management.md)에서 통합 관리합니다. 이 문서는 백엔드 HTTP 계약과 외부 공급자 문서의 진입점입니다.

[실제 응답·가공 검토](../api-data-analysis.md): 2026-09-21 복지로·행안부 소량 실조회 결과. 기존 원천 API 초안과 실제 응답의 차이, 파서 한계 포함.

서버의 `/docs`, `/redoc`, `/openapi.json`에서 실제 코드로 생성한 명세를 확인합니다. 실행은 [개발환경 문서](../development.md)를 따릅니다.

FastAPI의 `/docs/oauth2-redirect`는 Swagger UI 보조 경로이며 인증 구현을 뜻하지 않습니다. 자동 문서 경로들은 자체 구현한 아래 두 엔드포인트와 구분합니다. 백엔드에 `/api` 접두사는 없으며 웹 개발 프록시가 `/api/health`를 `/health`로 변환합니다.

| 경로 | 성공 | 실패 |
| --- | --- | --- |
| GET `/health` | 200: 서버 응답 | 프로세스 중지 시 연결 불가 |
| GET `/health/ready` | 200: status=ready, database=reachable | 503: status=not_ready, database=disabled 또는 unavailable |

현재 readiness는 MySQL 연결 검사이며 업무 테이블·정책 유효성 검사가 아닙니다. 비즈니스 API와 인증은 없습니다. 변경 시 라우터·테스트·이 문서·호출자를 함께 점검하며 별도 가짜 OpenAPI 파일을 유지하지 않습니다.

`/health/ready`는 SELECT 1만 실행합니다. HTTP 200이어도 정책 스키마·적재·조회 연결이 완료된 것은 아닙니다. [원문 파싱](../raw-parsing.md)은 내부 함수/CLI로만 제공하고 JSON 파일에 초안을 저장합니다. 업로드·분석 요청·정책 조회·사용자 자격 판정 API는 아직 없습니다. [현재 상태](../implementation-status.md).

## 외부 수집 API

[Gov24 원천 API 참고](gov24_services_api.md)는 수집기가 호출하는 외부 API 문서입니다. 이 프로젝트 서버가 해당 엔드포인트를 제공하는 것은 아닙니다. 팀원 명세와 [2026-09-21 실제 응답 조사](../api-data-analysis.md)를 함께 확인합니다.

[복지로 원천 API 참고](bokjiro_services_api.md): 중앙부처 복지서비스 목록·상세 조회. 2026-09-21 실제 API 표본 확인, 2026-09-22 XML 반복·중첩 보존 및 저장된 원문 기반 파싱 검증. 전체 데이터·현재 접수 가능 여부 검증과 구분.
