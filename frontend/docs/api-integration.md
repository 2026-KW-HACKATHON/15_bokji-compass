# 백엔드 API 연동 현황

기준: 2026-09-22. 현재 백엔드 공개 경로는 GET /health, GET /health/ready입니다. [HTTP 계약](../../backend/docs/api/readme.md)과 [전체 구현 상태](../../backend/docs/implementation-status.md)를 기준으로 연결합니다.

- health 200: 서버 응답 확인.
- readiness 200: MySQL SELECT 1 연결 점검 성공. 정책 테이블·조회 API 준비 완료 의미 아님.
- 정책 목록·상세·검색·사용자 자격 판정·원문 업로드/분석·인증 API: 미구현.
- 원문 파싱은 백엔드 내부 CLI이며 결과는 로컬 검토용 JSON. 프론트엔드가 결과 폴더·DB·백엔드 내부 모듈을 직접 참조하지 않음.

업무 API 추가 시 요청·응답·오류·인증 계약을 확정하고 실제 OpenAPI와 호출자를 함께 갱신합니다. 현재 없는 엔드포인트를 구현된 API로 안내하지 않습니다.
