# 정규화 테스트

담당: 백엔드. `test_policy.py`는 Gov24 한 건을 기존 SQL 초안용 정책/조건 행으로 변환하는 기능, 날짜/조건 미상 보존, 필수 제목을 검증합니다. 실제 DB INSERT나 자격 판정은 수행하지 않습니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest app/modules/normalization/tests`를 실행합니다. 신규 `raw.py`의 JSON/XML·원문 범위·해시·배치 변환은 `.\.venv\Scripts\python.exe -m pytest tests/test_raw_parsing.py`에서 검증합니다. pytest 성공은 종료 코드 0, 실패는 0이 아닌 코드이며 실제 외부 HTTP/DB 호출은 없습니다.
