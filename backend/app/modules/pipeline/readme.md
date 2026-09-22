# 원문 파싱 파이프라인

`parse_raw_files(paths, settings=None, output_root=None, prepare_only=False) -> (Path, manifest)`로 원본 파일 목록 처리. 기본 결과는 `backend/data/parsed_policies/`에 실행별 저장. 중복 정책 ID·지원하지 않는 입력은 실패 처리.

`parse_policy(source, settings, output, prepare_only=False) -> dict`는 공통 정책 한 건을 pending/needs_review/failed 상태로 반환. 원문 누락은 코드 처리, 의미 추출은 설정된 CLI 모델 사용. 재시도는 설정한 다른 모델로 최대 1회이며 검증 실패에 한정.

Windows 진입점: `backend/scripts/parse-raw.ps1`. [설정·결과·한계](../../../docs/raw-parsing.md).
