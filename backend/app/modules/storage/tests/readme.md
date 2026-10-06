# 원문 저장소 검증 위치

담당: 백엔드. `test_policy.py`는 기존 원문 어댑터를, `test_application_dates.py`는 신청일
추출을 검사합니다. `test_legacy_projection.py`는 DB 연결 없이 실제 MySQL SQL을 컴파일해
원문 교체 전에 승인 상태를 비교하는지 확인합니다. backend 폴더에서 다음을 실행합니다.

```powershell
.\.venv\Scripts\python.exe -m pytest app/modules/storage/tests tests/test_policy_schema_checksums.py
```

`tests/test_policy_database.py`는 별도 `bokji_compass_test`의 DB명과 데이터 경로를 확인한 뒤
마이그레이션·트랜잭션·동일 원문 승인 유지·변경 원문 승인 초기화·긴 원문과 조건 근거의
손실 없는 저장을 검사합니다. `BOKJI_TEST_MYSQL=1`에서만 실행하며 테스트가 만든 ID만 정리합니다.
