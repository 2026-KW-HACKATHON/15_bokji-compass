# parsers — 전용 파서 확장 예정

담당: 백엔드(개인 담당 미정). 현재 `public.py`와 `__init__.py`는 빈 골격이며 호출 가능한 함수·반환값·HTTP 경로가 없습니다.

이미지/PDF 등 전용 파서 확장을 위한 영역입니다. 현재 JSON/XML·RawDocument 입력은 `normalization/raw.py`의 `load_raw_policies(path) -> list[SourcePolicy]`, 복지로 XML 해석은 `collectors/bokjiro_services.py`에서 수행합니다. 빈 모듈을 구현 완료로 취급하지 않습니다.

현재 동작과 검증은 [rawdata 파싱](../../../docs/raw-parsing.md), `backend/tests/test_raw_parsing.py`를 참고합니다. backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest tests/test_raw_parsing.py`로 실행합니다. 전용 parsers 테스트는 아직 없습니다.
