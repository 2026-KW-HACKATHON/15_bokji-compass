# 광운대 공지 집계

담당: 백엔드. 현재 진입점은 `kwangwoon.count_kwangwoon_notices(start_duid: int, end_duid: int | None = None) -> int`입니다. 별도 `public.py`는 아직 없으므로 실제 함수 위치를 사용합니다.

시작 DUID부터 끝 DUID까지 존재 여부와 category=4 공지 형식을 확인하고 통과한 개수를 반환합니다. 끝을 생략하면 수집기의 최신 DUID 조회를 사용합니다. 예: `count_kwangwoon_notices(start_duid=53017, end_duid=53030)`은 실제 외부 HTTP를 호출합니다. 원문 파일/DB 저장이나 운영 모니터링 API는 제공하지 않습니다.

잘못된 입력은 `ValueError`입니다. 순회 중 HTTPError·파싱 ValueError는 건너뛰며 그 밖의 네트워크 오류는 전파될 수 있습니다. 외부 호출 횟수는 범위에 따라 증가합니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest app/modules/collectors/tests/test_kwangwoon_notices.py`로 HTTP 대역을 이용한 집계를 검증합니다. 성공 시 종료 코드 0이며 실제 외부 페이지 변경 여부를 확인하는 검증은 아닙니다.
