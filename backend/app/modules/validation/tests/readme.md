# 추출 검증 테스트 위치

담당: 백엔드. 이 폴더에 개별 테스트 파일은 없으며 `backend/tests/test_raw_parsing.py`에서 상태/값·0/false·범위 경계·원문 근거·적용 범위 검증을 확인합니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest tests/test_raw_parsing.py`를 실행합니다. 외부 DB·모델 호출은 없고 성공 시 종료 코드 0입니다. 계약 검증 통과는 의미 해석의 완전성이나 사용자 자격 충족을 보장하지 않습니다.
