# 공개 API

서버의 `/docs`, `/redoc`, `/openapi.json`에서 실제 코드로 생성한 명세를 확인합니다. 실행은 [개발환경 문서](../development.md)를 따릅니다.

| 경로 | 성공 | 실패 |
| --- | --- | --- |
| GET `/health` | 200: 서버 응답 | 프로세스 중지 시 연결 불가 |
| GET `/health/ready` | 200: status=ready, database=reachable | 503: status=not_ready, database=disabled 또는 unavailable |

현재 readiness는 MySQL 연결 검사이며 업무 테이블·정책 유효성 검사가 아닙니다. 비즈니스 API와 인증은 없습니다. 변경 시 라우터·테스트·이 문서·호출자를 함께 점검하며 별도 가짜 OpenAPI 파일을 유지하지 않습니다.

## 외부 수집 API

[Gov24 원천 API 참고](gov24.md)는 수집기가 호출하는 외부 API 문서입니다. 이 프로젝트 서버가 해당 엔드포인트를 제공하는 것은 아닙니다. 팀원이 작성한 원천 API 설명은 보존했으며, 이번 병합에서 실제 외부 호출이나 명세 재검증은 수행하지 않았습니다.
