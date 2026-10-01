# Codex CLI 조건 추출

`extract_policy(source, settings, output, model) -> (PolicyExtraction, metadata)`는 공개 정책 한 건의 조건을 추출합니다. `extract_policy_overview(source, settings, output, model) -> (PolicyOverview, metadata)`는 웹과 같은 6개 분야 중 하나로 분류하고 한국어 요약을 생성합니다. 두 결과는 새 시도 폴더에 저장되며 요약·분야 인용은 원문 부분 문자열 검증 후 사용합니다. 분류 근거가 부족하거나 6개 분야에 맞지 않으면 category는 null이며 draft 검토 대상으로 남습니다.

`resolve_codex_executable(configured) -> Path`는 Windows의 native `codex.exe` 또는 macOS/POSIX의 PATH `codex` 탐색. 명시한 실행 파일은 절대 경로·실행 권한 확인. CLI 실패는 `CodexRunError`, 구조화 출력 오류는 `ValueError` 계열 반환. 비밀 설정을 오류 메시지에 포함하지 않음.

`cli_environment()`는 OS·로그인 경로만 전달하며 앱 비밀정보 제외. `stop_codex_process(process)`는 Windows에서 해당 PID의 프로세스 트리, POSIX에서 새 세션의 프로세스 그룹 종료. 호출 제한시간 초과·사용자 중단 시 적용. [macOS 설치·사용법](../../../docs/macos-development.md).

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
