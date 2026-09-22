# 후속 작업 확인 순서

1. [현재 상태·DB 연결 범위](implementation-status.md)와 [작업 기록](worklog.md) 확인.
2. [구조](project-structure.md)·[데이터 계약](data-contracts.md)·변경 모듈의 README 및 실제 코드 확인.
3. 실행은 [개발환경](development.md)과 [원문 파싱](raw-parsing.md), HTTP 계약은 [API 문서](api/readme.md) 기준.

MySQL 접속 설정·SELECT 1 성공·파일 초안 저장·정책 DB 적재를 각각 구분합니다. 현재 파이프라인은 DB 쓰기 없이 파일 초안만 저장합니다. 테이블·데이터가 이미 있다는 가정으로 SQL 초안을 재실행하지 않습니다.

구현 계획·이전 실증·스키마 샘플은 현재 기능 계약과 구분합니다. 기존 코드와 팀원 작업·비밀 설정을 보존하고 실제 검증 범위·남은 항목을 기록합니다. 전체 테스트는 `backend/scripts/test.ps1`이며 외부 DB/LLM 실제 호출과 별도입니다.
