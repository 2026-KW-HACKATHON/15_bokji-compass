# 콘솔 표시

담당: 백엔드. `public.format_public_services(services: list[dict]) -> str`은 목록을 `1. 서비스명 (ID)` 형태의 줄바꿈 문자열로 반환합니다. `serviceId`/`serviceNm` 또는 `서비스ID`/`서비스명`을 사용하고 누락 시 `-`/`이름 없음`으로 표시합니다. 빈 목록은 빈 문자열입니다.

함수는 직접 출력·HTTP·파일·DB 접근을 하지 않습니다. 호출자는 유효한 dict 목록을 전달해야 하며 별도의 입력 스키마 검증은 없습니다. 예: `print(format_public_services(services))`.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest app/modules/collectors/tests/test_gov24_services.py`로 표시 문자열을 검증합니다. 프론트 UI와 정책 HTTP API는 이 모듈의 구현 범위가 아닙니다.
