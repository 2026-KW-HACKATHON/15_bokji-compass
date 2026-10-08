# 광운대학교 공지 자동 수집

2026-10-07 확인·수정. 관리자 자동 수집은 기존에 정부24·복지로만 호출했으며,
광운대 수집 함수는 수동 호출용으로 남아 있었다. 실제 운영 DB에도 광운대 관측 기록이 없었다.

## 동작과 설정

`INGESTION_KWANGWOON_ENABLED=true`가 기본이다. 관리자 **서버 설정**의 광운대학교
수집 항목에서 변경한다. API 키나 `INGESTION_DISCOVERY_ENABLED` 없이
`https://www.kw.ac.kr/ko/life/notice.jsp?srCategoryId=4`의 등록/장학 목록을 확인한다.
설정은 새 목록 탐색을 제어하며, 이미 등록된 상세·분석 대기 작업은 유지한다.

`python -m app.modules.ingestion tick --live`와 관리자 **수집 실행**은 같은
`run_tick`을 사용한다. 목록은 정부24·복지로와 순환하며 공통 페이지·시간·HTTP·대기열
한도를 따른다. 광운대는 일반 공지 10건과 별도 상단 고정 공지를 읽고 실제 상세 링크만
대기열에 등록한다. DUID 범위를 전부 요청하지 않는다. 고정 공지와 기존 원문의 URL은
중복 제거하며, 기존 notice 식별자가 있으면 그대로 재사용한다.

`collectors.kwangwoon_pages.fetch_kwangwoon_page(page=1)`은 `CollectionPage`를 반환한다.
`per_page`는 사이트의 일반 공지 개수인 10만 허용한다. `total_count`는 고정 공지를 제외한
번호 있는 공지 개수다. 잘못된 페이지·부분 목록·분류 변경은 오류로 처리하고 cursor를
성공 상태로 이동하지 않는다. `timeout`, `deadline`, `max_response_bytes`로 요청을 제한한다.

`fetch_kwangwoon_notice_detail(url, domains, http_budget)`은 `(row, raw_bytes)`를 반환한다.
광운대 공식 호스트·공지 경로·DUID·등록/장학 분류를 전용 허용 목록으로 검증한다.
본문 영역의 제목·작성일·수정일·텍스트·첨부 링크·이미지 링크를 보존하고 조회수는
내용 비교에서 제외한다. 목록과 상세는 `INGESTION_DAILY_NOTICE_CALLS` 예산을 공유한다.
다운로드 JSP 링크도 첨부로 인식한다. 이미지/PDF/HWP 본문 추출은 현재 제공하지 않으며
`attachment_status/image_status=not_parsed`로 남긴다.

목록·원문·AI 분석은 단계별로 처리된다. 관리자 **원문 수집 · AI 호출 없음** 모드는
`max_jobs=0`이므로 광운대 목록과 상세 대기 작업을 저장한다. 본문 확보까지 진행하려면
**평상시 지속 수집** 등 상세 작업을 처리하는 회차를 실행한다. 확보한 본문은 **공고 DB 편집**의
원문 확보 상태에서 확인할 수 있다. AI 분석·검증·공개는 기존 파이프라인을 따른다.

AI 회차/일일 호출 또는 토큰 한도를 소진하면 분석 checkpoint를 유지하고,
남은 HTTP·시간·작업 예산으로 원문 수집을 계속한다. 보고서는 `budget_reached`와 분석
한도 사유를 유지한다. 대기열이 이미 상한을 초과하면 새 목록은 여전히 대기한다.

## 실제 확인

2026-10-07 운영 설정은 대기 작업 335건에 대기열 상한 200건이어서 새 목록도 막혀 있었다.
상한만 500건으로 조정했고 AI 일일 한도는 변경하지 않았다. 제한된 검증 회차에서 광운대
목록 1페이지의 17건과 상세 원문 4건이 실제 MySQL에 저장됐다. HTTP 5회, 모델 0회,
오류 0건이었다. 이 검증은 분석·공개 또는 전체 914개 일반 공지 수집 완료를 의미하지 않는다.

검증 회차는 프로세스 내 설정으로 공급자 API 키를 비우고 `steady`, 페이지 1,
작업 4, HTTP 5, 모델 0, 60초를 적용했다. 저장된 API 키·모델 예산·운영 모드는 변경하지 않았다.
실제 수집의 HTML 바이트는 기존 `data/collection/raw` 저장 규칙을 따르며 DB에
원문 snapshot과 분석 대기 작업을 함께 기록한다.

## 회귀 검증

backend에서 실행한다. 외부 HTTP·모델·실제 DB를 사용하지 않는다.

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider app/modules/collectors/tests app/modules/ingestion/tests
```

새 테스트는 페이지 종료·고정 공지·상세 링크·날짜·첨부·공식 URL 경계,
자동 수집 연결·트랜잭션 재개·기존 식별자 재사용·공급자별 대기열 공간과
AI 한도 이후 원문 수집을 검증한다.
