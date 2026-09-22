# 추출 검증

`validate_extraction(result: PolicyExtraction, source: SourcePolicy) -> None`은 정책 ID·중복 조건/그룹 ID·그룹 참조·원문 인용을 검증. 오류 시 `ValueError`, 통과 시 None.

자료형·상태·값·범위 검증은 `app/contracts/parsing.py`에서 수행. 통과는 의미 정확성이나 신청 자격 충족을 보장하지 않음. [파싱 계약](../../../docs/raw-parsing.md).
