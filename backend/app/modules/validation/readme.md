# 추출 검증

`validate_extraction(result: PolicyExtraction, source: SourcePolicy) -> None`은 정책 ID·중복 조건/그룹 ID·그룹 참조·원문 인용을 검증. 오류 시 `ValueError`, 통과 시 None.

자료형·상태·값·범위 검증은 `app/contracts/parsing.py`에서 수행. 통과는 의미 정확성이나 신청 자격 충족을 보장하지 않음. [파싱 계약](../../../docs/raw-parsing.md).

`validate_canonical(result: CanonicalPolicy, source: SourcePolicy, catalog=None) -> None`은 v2 정규화 결과의 원문·공식 코드 존재·이름·스냅샷 버전 검사. Pydantic의 필드 사전·단위·값·논리 검증 후 호출. 오류는 ValueError.

`logic.evaluate_logic(node, outcomes) -> PASS | FAIL | UNKNOWN`은 이미 평가된 조건별 결과를 all/any/not으로 조합. 누락·미해결 노드는 UNKNOWN 유지. 사용자 프로필을 직접 평가하거나 정책을 공개하지 않음.
