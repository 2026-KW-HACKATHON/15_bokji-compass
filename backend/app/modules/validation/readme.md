# 추출 검증

`validate_extraction(result: PolicyExtraction, source: SourcePolicy) -> None`은 정책 ID·중복 조건/그룹 ID·그룹 참조·원문 인용을 검증. 오류 시 `ValueError`, 통과 시 None.

자료형·상태·값·범위 검증은 `app/contracts/parsing.py`에서 수행. 통과는 의미 정확성이나 신청 자격 충족을 보장하지 않음. [파싱 계약](../../../docs/raw-parsing.md).

`validate_canonical(result: CanonicalPolicy, source: SourcePolicy, catalog=None) -> None`은 v2 정규화 결과의 원문·공식 코드 존재·이름·스냅샷 버전 검사. Pydantic의 필드 사전·단위·값·논리 검증 후 호출. 오류는 ValueError.

`validate_overview(result: PolicyOverview, source: SourcePolicy) -> None`은 제목과 `source_url`이 입력과 같은지, 분야·지역·성별·나이·기타 조건·혜택·신청 기간의 모든 인용이 제목·기관명 또는 입력 필드의 실제 부분 문자열인지 확인합니다. 신청 기간 text도 인용 안에 그대로 포함되어야 합니다. 없는 인용, 다른 제목 또는 URL은 `ValueError`로 거부합니다. 인용 검증은 요약 내용의 의미 정확성·조건 누락 여부까지 보증하지 않으므로 초안 검토가 필요합니다.

`logic.evaluate_logic(node, outcomes) -> PASS | FAIL | UNKNOWN`은 이미 평가된 조건별 결과를 all/any/not으로 조합. 누락·미해결 노드는 UNKNOWN 유지. 사용자 프로필을 직접 평가하거나 정책을 공개하지 않음.
