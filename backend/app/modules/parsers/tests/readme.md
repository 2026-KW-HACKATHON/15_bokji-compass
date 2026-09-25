# 조건 파서 테스트

담당: 백엔드. 코드 조건 분류·LLM 전환·v2 정규화는 `backend/tests/test_condition_normalization.py`, 공식 지역은 `backend/tests/test_official_regions.py`에서 검증. 이 폴더는 이미지/PDF 전용 테스트의 후속 위치.

backend에서 `python -m pytest tests/test_condition_normalization.py tests/test_official_regions.py tests/test_raw_parsing.py` 실행. 외부 API·LLM·DB 호출 없이 합성 경계 사례와 공개 회귀 자료 검사. 성공 시 종료 코드 0.
