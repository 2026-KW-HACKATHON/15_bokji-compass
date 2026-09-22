# 업무 모듈 책임

| 모듈 | 현재 역할 | 미구현·후속 범위 |
|---|---|---|
| collectors | Gov24·복지로·공고·광운대 공지 수집, RawDocument 저장 연결 | 전체 자동 수집·스케줄러 |
| normalization | raw.py의 공급자별 JSON/XML 공통 입력 변환, policy.py의 기존 SQL 초안용 행 생성 | 공식 코드 매핑·필드 표준 사전·DB 저장 |
| llm | .env 모델 설정으로 Codex CLI 실행·구조화 응답 | Gemini·제한 Windows 계정·Job Object |
| validation | 상태/자료형 계약과 원문 인용·ID·그룹 참조 검증 | 모든 의미·단위·논리의 자동 검증 |
| pipeline | 원문 파일 처리·재시도·manifest/draft 파일 저장 | MySQL 트랜잭션·영속 작업 큐·공개 승인 |
| storage | RawDocument JSON 저장·조회 | 정책 MySQL 저장소 |
| presentation | Gov24 목록 콘솔 출력 | 프론트엔드·업무 API |
| metrics | 광운대 공지 건수 집계 | 운영 모니터링 |
| parsers | 후속 확장용 골격 | 이미지·PDF 등 전용 파서. 현재 JSON/XML 입력 처리는 normalization/raw.py |

[원문 파싱 사용법](../../docs/raw-parsing.md), [현재 상태·DB 연결 범위](../../docs/implementation-status.md) 기준. 새 기능은 해당 모듈 README에 실제 호출·반환·오류·검증 방법 기록. 수집·LLM 호출·DB 저장·공개 승인의 책임 분리 유지.
