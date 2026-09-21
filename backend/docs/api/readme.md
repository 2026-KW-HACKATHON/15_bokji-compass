# 공개 API

서버의 `/docs`, `/redoc`, `/openapi.json`에서 실제 코드로 생성한 명세를 확인합니다. 실행은 [개발환경 문서](../development.md)를 따릅니다.

| 경로 | 성공 | 실패 |
| --- | --- | --- |
| GET `/health` | 200: 서버 응답 | 프로세스 중지 시 연결 불가 |
| GET `/health/ready` | 200: status=ready, database=reachable | 503: status=not_ready, database=disabled 또는 unavailable |

현재 readiness는 MySQL 연결 검사이며 업무 테이블·정책 유효성 검사가 아닙니다. 비즈니스 API와 인증은 없습니다. 변경 시 라우터·테스트·이 문서·호출자를 함께 점검하며 별도 가짜 OpenAPI 파일을 유지하지 않습니다.
