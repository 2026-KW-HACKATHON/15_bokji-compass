# 백엔드 공통 문서

- [실제 공고 MySQL 저장·JSON 이관·DB 개인 안내](policy-storage.md) — 2026-10-01 구현.

- [루트 API 관리대장](../../api-management.md): 엔드포인트·응답·주소·설정·CORS·플랫폼별 연동과 변경 절차.
- [전체 문서 점검](documentation-audit.md): 기존 63개 문서의 갱신 상태·빈 문서·링크·현재 구현 대조 결과.
- [모듈 README 양식](module-readme-template.md): 역할·입력/반환·외부 호출·검증·후속 작업 작성 기준.

- [현재 구현 상태·DB 연결 범위](implementation-status.md): 공고 MySQL 저장·조회 및 계정/API 범위 구분. 현재 상태의 기준 문서.
- [개발환경](development.md): 설치·실행·DB·테스트·의존성 갱신.
- [macOS 개발환경](macos-development.md): Mac 팀원 설치·Codex 로그인·API·파싱 실행·오류 확인.
- [프로젝트 구조](project-structure.md): 현재 구성과 협업 경계.
- [구현 계획](implementation-plan.md): 후속 정제·검색·저장 설계.
- [API](api/readme.md): 현재 HTTP 계약.
- [실제 API 데이터·가공 계획](api-data-analysis.md): 복지로·행안부 응답 구조, 파서 한계, 정규화 순서.
- [코드·Codex CLI 실증](classification-experiment.md): 실제 정책 6개 분류·조건 후보 비교와 한계.
- [스키마 적용 샘플](schema-sample.md): 실제 정책 6개를 상태·값·주체·조건 그룹으로 정렬한 예시.
- [Rawdata 파싱·모델 설정](raw-parsing.md): JSON/XML 입력, Codex CLI 추출·검증·초안 저장.
- [코드 우선 조건·공식 지역 분류](condition-classification.md): v2 필드 사전·논리·실제 행정코드·갱신·오프라인 점검.
- [소득·재산 산정 규칙](financial-rules.md): 2026 공식 기준·사업별 산식 차이·지원 범위·추가 확인 사항.
- [소득 입력과 실제 공고의 차량 기준 조사](finance-input-evidence-2026.md): 세전·경비·자료 기간, 영업용·생업용·공동명의·리스·보조금 근거와 미지원 범위.
- [금융 계산·계정 저장 모듈](../app/modules/finance/readme.md): 비회원 계산, 회원 원입력 저장·삭제, 세션·DB 초기화·검증·정책 연결 경계.
- [작업 기록](worklog.md): 실제 변경·검증.

현재 계약·기능은 각 문서에 기록하며, 빈 기능 골격과 후속 계획은 구현 완료로 취급하지 않습니다.
