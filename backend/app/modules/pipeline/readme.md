# 원문 파싱 파이프라인

`parse_raw_files(paths, settings=None, output_root=None, prepare_only=False) -> (Path, manifest)`로 원본 파일 목록 처리. 기본 결과는 `backend/data/parsed_policies/`에 실행별 저장. 중복 정책 ID·지원하지 않는 입력은 실패 처리.

`parse_policy(source, settings, output, prepare_only=False) -> dict`는 공통 정책 한 건을 pending/needs_review/failed 상태로 반환합니다. `prepare_only=True`는 모델 호출을 생략합니다. 일반 파싱에서는 요약·6개 분야 분류를 별도 LLM 호출로 생성하며, 코드로 조건 추출이 완결되지 않은 경우에만 조건 추출용 LLM도 호출합니다. 요약과 조건 추출은 각각 근거 검증을 거칩니다.

v2 파일 초안에는 최상위 `overview`와 `overview_status`가 추가됩니다. overview 호출 실패는 `overview=null`, `overview_status=failed` 및 시도 기록으로 남깁니다. 조건 결과에는 원래 analysis와 표준화 canonical, 부분 코드 결과 code_analysis/code_canonical이 포함됩니다. LLM 실패 시에도 부분 코드 결과를 보존하며 문서 전체의 논리 관계는 자동 합치지 않습니다. [데이터 계약](../../../docs/data-contracts.md) · [조건·지역 계약](../../../docs/condition-classification.md).

Windows 진입점: `backend/scripts/parse-raw.ps1`. [설정·결과·한계](../../../docs/raw-parsing.md).
