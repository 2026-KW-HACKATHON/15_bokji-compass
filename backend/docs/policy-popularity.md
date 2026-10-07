# 공개 공고의 출처 조회수

2026-10-07. 공고 추천에는 수집된 Gov24 목록의 `조회수`와 복지로 목록의 `inqNum`을
사용할 수 있다. 두 필드는 [실제 저장 표본](api-data-analysis.md)에 있으며,
공급자 목록 원문은 기존 `collection_records.listing_json`에 저장한다.
조회수는 출처 사이트의 누적 조회수이며 현재 접속자 수, 신청자 수 또는 최근 관심 증가량이 아니다.

전체 공고 GET `/v1/policies`는 `sort=popular`가 기본이며 `recent`와 `name`도 허용한다.
공개된 최신 개정과 검색·분야·지역·대상·태그 조건을 적용한 전체 결과에 현재 수집 목록을
LEFT JOIN하고 유효한 조회수를 SQL에서 내림차순 정렬한 뒤 `limit`/`cursor`를 적용한다.
한 페이지를 받은 뒤 정렬하지 않는다. 확인된 0회는 미확인 값보다 앞에 온다. 동점은 공개 개정
생성일 내림차순과 정책 ID 오름차순으로 결정하며 미확인 공고도 같은 최신순으로 이어진다.
수집 테이블이 없는 기존 저장소는 조회수 `null`과 최신순으로 동작한다.

목록·상세·캘린더 카드의 `popularity`는 `{views,source,basis,asOf}` 또는 `null`이다.
관리자 공개 미리보기처럼 수집 목록을 조회하지 않는 내부 카드도 `null`로 표시한다.
현재 목록의 조회수가 갱신되면 새 정책 개정이나 재분석 없이 다음 조회의 정렬·표시에 반영된다.

`app.modules.ingestion.public.load_popularity(repository, policy_keys)`는 요청한 정책 ID의
현재 목록만 한 번에 조회한다. 반환은 `{policy_key: {views, source, basis, asOf}}`이며,
`source`는 `gov24` 또는 `bokjiro`, `basis`는 `provider_cumulative_views`다.
조회수는 음수·소수·불리언을 거절하고 JavaScript 안전 정수 범위인 0~9,007,199,254,740,991만
허용한다. 숫자 문자열과 올바른 세 자리 쉼표 구분 문자열도 허용한다.

`ingestion.popularity.listing_popularity(provider, listing) -> dict | None`은 DB 접근 없는
공통 신호 파서다. `view_count_expression(table, dialect="mysql")`는 같은 숫자·자료형·범위
규칙을 SQL 표현식으로 반환한다. 운영 MySQL은 JSON 자료형과 정수 문자열을 검사한 뒤
정수로 변환하며, SQLite 구현은 격리 테스트용이다. 외부 호출·DB 쓰기·마이그레이션은 없다.

목록 관측 시 원본 행을 수정하지 않고 DB용 복사본에 `_views_observed_at`을 기록한다.
새 스캔은 내용이 동일해도 조회수와 이 시각을 갱신하며, 조회수·관측 시각을 내용 해시에서
제외하므로 정책 개정이나 모델 분석 작업을 추가하지 않는다. `asOf`는 이 내부 시각의 UTC ISO
문자열이다. 기존 목록에 이 시각이 없으면 `null`이며, 상세·조건 확인 때도 갱신되는
`last_seen_at`을 조회수 관측 시각으로 대신 사용하지 않는다.

수집 테이블이 없는 기존 개발·테스트 저장소는 조회수 없이 동작한다. 그 외 DB 조회 실패는
호출자에 전달한다. 이 함수는 테이블을 생성하거나 외부 API·모델을 호출하지 않는다.

현재 Gov24·복지로 실제 표본에는 공고별 잔여 예산이나 예산 소진율이 없다.
[공식 문화누리 안내](https://www.mnuri.kr/card/cardMain/cardIssue_step00.do)는 예산 소진에 따른
조기 마감 가능성을 알리지만 현재 소진율을 제공하지 않는다. 원문에 명시된 예산 마감 경고와
검증 가능한 수치만 표시하고, 조회수나 신청 기간을 예산 소진율로 변환하지 않는다.

검증: `python -m pytest -p no:cacheprovider tests/test_catalog_popularity.py tests/test_policy_popularity.py`
(격리 SQLite, 실제 공급자·운영 MySQL 호출 없음).
전체 페이지 정렬·동점·0/미확인·필터/건수·최신 공개 개정·목록 갱신·수집 테이블 없는
기존 스키마·상세/캘린더 표시·HTTP 기본값과 허용 정렬을 확인한다.
SQL 숫자 검증은 공통 파서와 비교하고 MySQL 표현식은 별도로 컴파일한다.
`BOKJI_TEST_MYSQL=1`이면 설정된 MySQL에서 매개변수로 전달한 합성 JSON만 SELECT하여
실제 JSON INTEGER/UNSIGNED INTEGER/STRING·Boolean/소수·상한·공백·쉼표 검증도 수행한다.
테이블 생성·실제 행 쓰기는 없다. 2026-10-07 읽기 전용 실검증에서 이 48개 사례와
공개 공고 378개 전체 4페이지의 인기순·응답 조회수 일치를 확인했다.
