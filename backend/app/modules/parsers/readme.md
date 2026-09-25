# 코드 우선 조건 파서

담당: 백엔드(개인 담당 미정). `public.extract_conditions(source: SourcePolicy) -> CodeExtraction` 구현.
반환값은 extraction(추출 가능 조건 또는 None), logic(조건 트리), unresolved_fields(미해결 원문 필드), complete(전체 코드 추출 여부) 포함.

이 모듈은 네트워크·DB·LLM 호출 없음. 확정 가능한 전체 절만 분류하고 복합·예외·나열 관계는 추측하지 않음. pipeline에서 미해결 원문을 LLM에 연결.
JSON/XML·RawDocument 입력은 `normalization/raw.py`, 복지로 XML 해석은 `collectors/bokjiro_services.py` 사용. 이미지/PDF 전용 파서는 후속.

backend에서 `python -m app.modules.parsers --input 공개원문.json`으로 LLM 없이 분류 가능 범위 확인. [전체 사용법](../../../docs/condition-classification.md).
검증: `python -m pytest tests/test_condition_normalization.py tests/test_official_regions.py tests/test_raw_parsing.py`.
