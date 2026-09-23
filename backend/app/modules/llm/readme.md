# Codex CLI 조건 추출

`extract_policy(source, settings, output, model) -> (PolicyExtraction, metadata)`는 공개 정책 한 건을 설정 모델로 추출. `output`은 새 시도 폴더이며 반환값은 pipeline의 근거 검증 후 사용.

`resolve_codex_executable(configured) -> Path`는 Windows의 native `codex.exe` 또는 macOS/POSIX의 PATH `codex` 탐색. 명시한 실행 파일은 절대 경로·실행 권한 확인. CLI 실패는 `CodexRunError`, 구조화 출력 오류는 `ValueError` 계열 반환. 비밀 설정을 오류 메시지에 포함하지 않음.

`cli_environment()`는 OS·로그인 경로만 전달하며 앱 비밀정보 제외. `stop_codex_process(process)`는 Windows에서 해당 PID의 프로세스 트리, POSIX에서 새 세션의 프로세스 그룹 종료. 호출 제한시간 초과·사용자 중단 시 적용. [macOS 설치·사용법](../../../docs/macos-development.md).

모델·reasoning·재시도·실행 방법: [사용법](../../../docs/raw-parsing.md).
