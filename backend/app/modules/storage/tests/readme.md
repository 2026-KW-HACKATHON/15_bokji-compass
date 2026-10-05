# 원문 저장소 검증 위치

담당: 백엔드. `test_catalog_raw_documents.py`는 광운대 원문 공고의 조회 카드·검색·일정 추출을 검사합니다. `collectors/tests/test_public.py` 및 `test_kwangwoon_notices.py`는 임시 디렉터리에서 RawDocument 저장·조회를 검사합니다.

backend 폴더에서 `.\.venv\Scripts\python.exe -m pytest app/modules/collectors/tests`를 실행합니다. 성공 시 종료 코드 0이며 실제 운영 파일·DB를 사용하지 않습니다. 정책 MySQL 저장소·트랜잭션 테스트는 저장소 구현 이후 추가할 예정입니다.
