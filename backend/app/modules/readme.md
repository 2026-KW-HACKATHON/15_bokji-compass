# 업무 모듈 책임

| 모듈 | 현재 역할 | 미구현·후속 범위 |
|---|---|---|
| [auth](auth/readme.md) | 회원가입·로그인·세션·개발용 전화번호 인증, 개발 SQLite 및 MySQL 저장 경로 | 실제 SMS 공급자·계정 수정/탈퇴 |
| [finance](finance/readme.md) | 공개 소득·재산 계산, 검토된 정책별 산정 연결 함수, 로그인 계정별 원입력 저장 | 실제 MySQL 저장 검증·공고 저장소/추천 API 연결·추가 산정 규칙 |
| collectors | Gov24·복지로·공고·광운대 공지 수집, RawDocument 저장 연결 | 전체 자동 수집·스케줄러 |
| normalization | 공급자별 입력 변환·기존 SQL 행 변환·v2 표준 조건·공식 지역코드 정규화 | 정책 DB 저장·검색 인덱스 |
| regions | 공식 ADMIN/LEGAL 스냅샷·해시·활성/폐지·이름 조회·계층 포함 | 체계 간 관할 관계·과거 정책 이관 |
| llm | .env 모델 설정으로 Codex CLI 실행·구조화 응답 | Gemini·제한 Windows 계정·Job Object |
| [policy_translation](policy_translation/readme.md) | 공개 공고 표시용 4개 외국어 번역·원문 보존 검증·정책 DB 캐시·일일 생성 한도 | 번역 의미 전체의 자동 검증·AI 개인 대화 번역 |
| validation | 상태/자료형 계약과 원문 인용·ID·그룹 참조 검증 | 모든 의미·단위·논리의 자동 검증 |
| pipeline | 원문 처리·MySQL 작업/개정 저장·실패 재개 | 자동 스케줄링·공개 승인 |
| storage | 수집 원본 파일·MySQL 공고/조건/개정/작업 저장·조회 | 공개 검토·현재 개정 선택 |
| [search](search/readme.md) | 로컬 자연어 요청 해석·게시 기관/학교 대상 관계·지원 목적·전체 관련성 검색 | 대규모 검색 투영·색인, 새 표현·복잡한 부정문 확장 |
| assistant | DB 공고 원문 기반 로컬 LLM 질의응답·인용 검증 | 로그인 프로필·대화 이력·API/UI |
| presentation | Gov24 목록 콘솔 출력 | 프론트엔드·업무 API |
| metrics | 광운대 공지 건수 집계 | 운영 모니터링 |
| parsers | 코드 우선 조건 추출·미해결 원문 범위·오프라인 점검 CLI | 이미지·PDF 전용 파서 |

[원문 파싱 사용법](../../docs/raw-parsing.md), [현재 상태·DB 연결 범위](../../docs/implementation-status.md) 기준. 새 기능은 해당 모듈 README에 실제 호출·반환·오류·검증 방법 기록. 수집·LLM 호출·DB 저장·공개 승인의 책임 분리 유지.
