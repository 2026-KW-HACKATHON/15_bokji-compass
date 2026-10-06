# 봉규 브랜치 공고 seed

2026-10-06 `bonggyu@16b0337`에서 SQL·JSON 5개를 원본 바이트 그대로 선택 복원했습니다.
봉규 브랜치 전체를 병합한 것은 아니며 SQL 실행·서비스 DB 변경은 하지 않았습니다.
별도의 seed 자동 생성 스크립트는 이 브랜치에서 확인되지 않았습니다. 아래 SQL은 생성 결과물입니다.

| 파일 | 내용 |
| --- | --- |
| `collected_policies.sql` | Gov24/Bokjiro 수집 공고 7건의 공고·조건·투영·공개 이력 INSERT |
| `kwangwoon_notices.json` | 광운대 원문 190건. 표준 `load_raw_policies` 파이프라인 입력 |
| `kwangwoon_published_policies.sql` | 공개 광운대 공고 2건, 조건 27행, 공개 이력 2행, 호환 조건 8행 |
| `kwangwoon_published_policies/*.json` | 위 광운대 2건의 추출·검증 결과. JSON 자체는 초안 계약 유지 |

SQL의 전제는 올바른 대상 DB에서 기존 `python -m app.modules.storage init`을 완료한 상태입니다.
현재 초기화 경로는 004~008·010이며 이 seed에는 `raw_documents` INSERT가 없어
봉규 브랜치의 009 마이그레이션을 추가하지 않았습니다.
고정된 원본 ID를 사용하는 1회 적재용 SQL이므로 기존 공고 DB에 재실행하지 않습니다.
요청/서버 시작 시 자동 실행하지 않으며 기존 원문·개정·공개 이력을 삭제하지 않습니다.

`load_raw_policies(path) -> list[SourcePolicy]`는 원문 JSON을 정규화하는 읽기 함수이고,
`validate_draft(payload) -> dict`는 요약 JSON의 계약·인용·공식 지역 값을 검증합니다.
실제 공개 여부는 서비스 DB의 review_status 기준입니다. 파일 복원만으로 190개 공고가
공개되거나 190개 요약이 생성되었다고 표시하지 않습니다.

검증: `python -m pytest tests/test_notice_presentation.py`.
190개 입력의 정규화, 2개 개요의 인용 검증·공고체·지급 시기 표시,
공개 SQL의 예상 INSERT 행 수를 확인합니다. 이번 작업에서 SQL seed를 실행해 검증하지는 않았습니다.
