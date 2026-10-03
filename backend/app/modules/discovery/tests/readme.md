# Discovery 오프라인 테스트

담당: 백엔드. `test_discovery.py`는 CLI subprocess를 대역으로 교체하여 실제 모델·검색·DB를
호출하지 않습니다. backend에서 `.\.venv\Scripts\python.exe -m pytest
app/modules/discovery/tests -q -p no:cacheprovider`로 실행합니다. 종료 코드 0은 계약 검증 성공이며
실제 서버 CLI 로그인·모델 접근·검색 지원을 확인한 결과는 아닙니다.
