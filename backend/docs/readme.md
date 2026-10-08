# 백엔드 공통 문서

- [같은 사업의 단계별 공고](notice-series.md) — 원문을 보존하는 사업/회차 묶음,
  검색 건수·페이지·상세·캘린더와 결과/후속 공지의 신규 추천 제외.

- [공고 첨부 파일 제공](policy-attachments.md) — 실제 파일 저장·PDF 보기·다운로드·공개 상태 확인과 기존 공고 보충 명령.

- [광운대·월계동 필수 검색 데이터](focus-search-data.md) — 실제 누락 원인,
  반복 가능한 공식 데이터 보충·읽기 전용 검사·지리적 인용과 검색 회귀 검증.

- [공개 공고 내용 번역](policy-translation.md) — 영어·중국어 간체·베트남어·일본어 표시 번역,
  명시적 `storage init`·기존 Codex 로그인·개정 캐시·UTC 일일 생성 한도·오프라인 테스트 범위.

- [생활 상황 상담과 부족 정보 보완](assistant-dialogue.md) — 단계별 질문·일상 누수 대응,
  동의한 사실만 지속 안내에 저장·임시 대화·범위와 한계.

- [공고 자연어 검색](policy-search.md) — 게시 기관/학교 대상 해석·지원 목적·제외 요청,
  원문 근거·관계별 결과·필터·관련성·전체 건수/페이지·캘린더.

- [사용자 상황에 따른 지속 복지 안내](proactive-guidance.md) — 주거·취업·피해 상황에서 지원 분야 도출,
  계정별 추적·진행 상태·앱 안 알림·독립 정기 확인 worker와 초기화.

- [공고 분야·기존 공고 재분류](policy-categories.md) — 농림축산·어업·사업·창업 추가,
  공유 계약, 수동 분류 보존, 읽기 시 반영, 필터·집계·검증.

- [회원가입 이메일 인증·SMTP 설정](email-signup.md) — 일반 가입 인증, 카카오 직접 입력,
  기존 회원 호환, 배포 전 회원 스키마 초기화와 테스트 전용 수신함.

- [봉규 브랜치·공고 요약·seed 확인](notice-summary-integration.md) — 선택 반영, 기존 경고의 의미, 공고체·지급 시기·검증 범위.

- [실제 공고 MySQL 저장·JSON 이관·DB 개인 안내](policy-storage.md) — 2026-10-01 구현.
- [노트북 서버 공고 수집·일일 예산·스케줄·중단 복구](server-ingestion.md) — 2026-10-02 구현. 실제 서버 적용/수집은 별도 검증.
- [백엔드 주소의 관리자 로그인·서버 설정](server-admin.md) — 최고 관리자 인증, 수집·모델·API 키 관리와 DB 재시작 적용.
- [2026-10-02 통합 보안·회귀 점검](security-review-2026-10-02.md) — 수정한 문제, 전체 검사, 미해결 공급자 취약점과 검증 범위.

- [루트 API 관리대장](../../api-management.md): 엔드포인트·응답·주소·설정·CORS·플랫폼별 연동과 변경 절차.
- [전체 문서 점검](documentation-audit.md): 기존 63개 문서의 갱신 상태·빈 문서·링크·현재 구현 대조 결과.
- [유사 복지 서비스의 반면교사와 개선 작업](../../frontend/docs/competitor-lessons-todo.md): 공개 검수·정보 정확성·모집 상태·추천 설명·화면 검증의 우선순위와 완료 기준.
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

- [상황 설명형 자연어 검색](conversational-search.md): 휴학생 지원금 요청, 배경 상황 분리, 원문 근거 순위.
