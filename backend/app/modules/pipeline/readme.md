# 원문 파싱 파이프라인

`parse_raw_files(paths, settings=None, output_root=None, prepare_only=False) -> (Path, manifest)`로 원본 파일 목록 처리. 기본 결과는 `backend/data/parsed_policies/`에 실행별 저장. 중복 정책 ID·지원하지 않는 입력은 실패 처리.

`parse_policy(source, settings, output, prepare_only=False) -> dict`는 공통 정책 한 건을 pending/needs_review/failed 상태로 반환. 코드 우선 추출·공식 지역 정규화가 완결되면 LLM 생략. 미해결 조건이 있으면 전체 원문을 CLI에 전달. 재시도는 설정한 다른 모델로 최대 1회이며 검증 실패에 한정.

v2 파일에는 원래 analysis와 표준화 canonical, 부분 코드 결과 code_analysis/code_canonical 포함. LLM 실패 시에도 부분 코드 결과 보존. 문서 전체의 논리 관계는 자동 합치지 않음. [조건·지역 계약](../../../docs/condition-classification.md).

Windows 진입점: `backend/scripts/parse-raw.ps1`. [설정·결과·한계](../../../docs/raw-parsing.md).
