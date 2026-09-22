# Codex CLI 조건 추출

`extract_policy(source, settings, output, model) -> (PolicyExtraction, metadata)`는 공개 정책 한 건을 설정 모델로 추출. `output`은 새 시도 폴더이며 반환값은 pipeline의 근거 검증 후 사용.

`resolve_codex_executable(configured) -> Path`는 native Windows 실행 파일 탐색. CLI 실패는 `CodexRunError`, 구조화 출력 오류는 `ValueError` 계열 반환. 비밀 설정을 오류 메시지에 포함하지 않음.

모델·reasoning·재시도·실행 방법: [사용법](../../../docs/raw-parsing.md).
