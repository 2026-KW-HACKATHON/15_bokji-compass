# CLI 어댑터 검증 위치

담당: 백엔드. 이 폴더에는 아직 별도 테스트 파일이 없습니다. 실제 회귀 검증은 `backend/tests/test_raw_parsing.py`에서 CLI 인수·인증값 비포함·조건/요약 구조화 응답·6개 분야 프롬프트·제목 고정·지역/성별/나이 상태 구분·각 항목 근거 검증·시간 초과·도구 실행 이벤트 거부를 검사합니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest tests/test_raw_parsing.py`를 실행합니다. subprocess/모델 응답 대역을 사용하므로 실제 CLI 로그인·모델 호출 성공을 의미하지 않습니다. 별도 live 검증 이력은 [작업 기록](../../../../docs/worklog.md)을 참고합니다. pytest 성공은 종료 코드 0입니다.
