# 전용 파서 테스트 — 미구현

담당: 백엔드. 상위 parsers 모듈이 빈 골격이므로 이 폴더에 실행할 테스트는 없습니다. 현재 JSON/XML 입력 검증은 `backend/tests/test_raw_parsing.py` 및 수집기 테스트에 있습니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest tests/test_raw_parsing.py app/modules/collectors/tests`를 사용합니다. 실제 외부 API/LLM을 호출하지 않으며 성공 시 종료 코드 0입니다. 이미지/PDF 지원 추가 시 합성 입력과 오류·크기 제한 검증을 이 영역에 추가할 예정입니다.
