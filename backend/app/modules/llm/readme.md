# Codex CLI 조건 추출

`extract_policy(source, settings, output, model) -> (PolicyExtraction, metadata)`는 공개 정책 한 건을 설정 모델로 추출. `output`은 새 시도 폴더이며 반환값은 pipeline의 근거 검증 후 사용.

`resolve_codex_executable(configured) -> Path`는 Windows에서 `codex.exe`, macOS/Linux에서
`codex` native 실행 파일을 탐색한다. CLI 실패는 `CodexRunError`, 구조화 출력 오류는
`ValueError` 계열로 반환한다. 비밀 설정은 오류 메시지에 포함하지 않는다.

실행 전 Codex CLI 인증이 필요하다.

```sh
codex login
codex login status
```

모델·reasoning·재시도·실행 방법: [사용법](../../../docs/raw-parsing.md).

## 실제 연동 확인

2026-09-23 macOS에서 `codex-cli 0.156.1`로 실제 Gov24 API 원문 1건을
수집하고 LLM 파이프라인을 실행했다.

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
