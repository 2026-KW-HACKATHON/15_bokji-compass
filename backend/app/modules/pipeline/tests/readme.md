# 파이프라인 검증 위치

담당: 백엔드. 이 폴더에 개별 테스트 파일은 아직 없으며 `backend/tests/test_raw_parsing.py`에서 준비 모드·원문 누락·검증 실패 재시도·시간 초과·partial/failed 상태·안전한 파일 ID와 초안 저장을 검증합니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest tests/test_raw_parsing.py`를 실행합니다. 모델 호출은 대역, 파일 출력은 임시 디렉터리이며 MySQL을 사용하지 않습니다. pytest 성공은 종료 코드 0입니다. 파일 검증 통과와 DB 적재·공개 승인은 별개입니다.
