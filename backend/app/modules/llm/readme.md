# Codex CLI 조건 추출

2026-10-06 묶음 최적화: `extract_policy_batch(requests, settings, output, model)`은
최대 8건의 transport를 지원하며 운영 프리셋은 4건/24,000글자로 시작한다. 지시문·스키마를
공유하고 요약+조건을 통합한다. 결정 가능한 제목·URL·중첩 ID는 서버에서 채운다.
최종 스키마는 CLI에 제공하되 응답 검증은 pipeline/batching.py에서 공고별 수행한다.
이웃 성공 결과가 한 공고의 실패로 유실되지 않는다. [예산·조사 근거](../../../docs/ingestion-tuning.md).

2026-10-06 공고 문체 보완: 혜택·조건의 설명 text는 `장학생 선발`, `장학금 지급 예정` 같은
짧은 명사형으로 요약합니다. 인용 quote와 policy_requirements.evidence_text는 원문 그대로
유지하며 아래의 원문 발췌 원칙은 인용·신청 기간·신청 방법·URL·문의처·게시/수정일에 적용합니다.
없는 사실이나 날짜를 보충하지 않으며 지급 시기를 신청 기간과 혼동하지 않습니다.

`extract_policy(source, settings, output, model) -> (PolicyExtraction, metadata)`는 공개 정책 한 건의 조건을 추출합니다. `extract_policy_overview(source, settings, output, model) -> (PolicyOverview, metadata)`는 요약 필드, `policy_requirements` 행 후보, 인용 근거가 있는 신청 기간·방법·URL·문의처·게시일·수정일을 함께 생성합니다. 원문 발췌 그대로 반환하고 추측하거나 정규화하지 않습니다. 공지 수집기는 링크 문구/URL 및 명시적인 게시/수정 메타데이터를 `SourcePolicy.fields`로 제공합니다. 파이프라인은 모든 인용을 원문 대조하며 날짜 형식이 명확한 신청 기간만 `policies.application_start/application_end`로 매핑합니다. 행의 `condition_type`, `information_state`, `evidence_text`는 001 SQL의 `policy_requirements` 계약을 따릅니다. 성별은 001에 전용 타입이 없으므로 `other`와 원문 인용으로 보존합니다. 출처 URL은 입력에서 복사하며 모델이 만들지 않습니다. 이 출력은 검토용 후보이며 DB 저장·승인·자격 판정이 아닙니다.

`resolve_codex_executable(configured) -> Path`는 Windows의 native `codex.exe` 또는 macOS/POSIX의 PATH `codex` 탐색. 명시한 실행 파일은 절대 경로·실행 권한 확인. CLI 실패는 `CodexRunError`, 구조화 출력 오류는 `ValueError` 계열 반환. 비밀 설정을 오류 메시지에 포함하지 않음.

`cli_environment()`는 OS·로그인 경로만 전달하며 앱 비밀정보 제외. `stop_codex_process(process)`는 Windows에서 해당 PID의 프로세스 트리, POSIX에서 새 세션의 프로세스 그룹 종료. 호출 제한시간 초과·사용자 중단 시 적용. [macOS 설치·사용법](../../../docs/macos-development.md).

구조화 출력이 잘못된 경우 `CodexOutputError(ValueError)`의 metadata에 완료 event 사용량을
보존합니다. 서버 worker는 이 정보로 실패한 출력의 모델 호출·토큰 예산도 계산합니다.

실행 중 0.2초마다 출력 파일을 검사합니다. 이벤트 2MB·stderr 256KB·결과 2MB 및
이벤트 한 줄 256KB를 넘거나 허용하지 않은 도구 이벤트가 나오면 해당 프로세스 트리를
중단합니다. 종료 직후에도 같은 상한과 이벤트 형식을 검사한 뒤 JSON을 읽습니다.

모델·reasoning·재시도·실행 방법: [사용법](../../../docs/raw-parsing.md).

요약·분야 생성은 조건이 코드 규칙으로 완결되는 정책에도 별도 LLM 호출을 합니다. 따라서 파싱당 추가 모델 호출 비용·시간이 들 수 있으며, 요약은 검토용 안내이지 자격 판정이 아닙니다.

## 실제 연동 확인

팀원 `bonggyu`의 커밋 `cc13a04`에 기록된 2026-09-23 macOS 실증 결과.
`codex-cli 0.156.1`로 Gov24 원문 1건 수집·LLM 파이프라인 실행 확인 기록 보존.
아래 결과는 팀원 브랜치 기준이며 현재 통합본의 Mac 재실행 결과와 구분.

- 대상: `유아학비 (누리과정) 지원`
- 입력: Gov24 API 원문 -> `SourcePolicy`
- 모델: `gpt-5.6-luna`, reasoning `medium`
- 결과: `needs_review`, `method=codex_cli`
- 추출: 조건 29개, 그룹 10개, 미해결 2개
- 모델 보고 coverage: `complete`
- 검증 후 coverage: `partial`
- 처리 시간: 약 108.69초

구조화 JSON과 근거 검증은 통과했지만 미해결 조건이 남아 자동 공개나 자격
판정으로 처리하지 않고 검수 대상으로 보류한다. 이는 파이프라인의 의도된
동작이다.

재현하려면 먼저 인증한다.

```sh
codex login
codex login status
```

그 다음 `backend` 디렉터리에서 Gov24 수집 결과를 `normalize_record`로 변환하고
`pipeline.parse_policy`에 전달한다. 실제 외부 API 키와 Codex 로그인 세션이
필요하며, 기본 테스트는 외부 API나 LLM을 호출하지 않는다.


## 2026-10-01 개인 공고 안내

`answer_policy_question(source, question, profile, settings, output)` → `(PolicyAnswer, metadata)`.
DB에서 조회한 SourcePolicy와 GuidanceProfile(region/age_band/interests), 질문을 설정 모델에
전달한다. 문맥을 공유하거나 저장하지 않는다. 호출자는 답변의 근거를 원문과 대조해야 하며
assistant.public이 이 책임을 수행한다. 재시도/프로필 저장/도구 실행/자격 판정은 수행하지 않는다.
