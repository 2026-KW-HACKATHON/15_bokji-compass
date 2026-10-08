# 공식 확인 지역 생활 서비스 요약

`services/*.json`은 공식기관 안내를 직접 확인한 뒤 작성한 서비스 요약 배열입니다.
원문 HTML/PDF나 미검증 수집물은 이 디렉터리에 넣지 않습니다.

필수 필드:

- `id`, `category`(transport/health/care/culture), `title`, `summary`
- `coverage`: `{region,district,scope,neighborhoods,neighborhoodType}` 배열
- `focusAreas`: `{region,district,neighborhood,neighborhoodType}` 배열
- `area`, `audience`, `cost`, `usage`
- `sourceName`, `sourceUrl`, `checkedAt`, `sourcePublishedAt`, `evidence`

선택 필드 `availableUntil`은 공식 종료일(YYYY-MM-DD) 또는 null입니다. 날짜가 알려지면
서버가 Asia/Seoul 기준 종료일 다음 날부터 공개 목록과 통계에서 제외합니다. 누락/null은
종료일을 알 수 없다는 뜻이며 영구 운영을 보증하지 않습니다.

`scope`는 national/province/district/neighborhood이며 전국은 region `전국`, 시도/전국 범위는
district `""`입니다. 동네 범위는 동·읍·면 이름 배열과 administrative/legal 구분이 필수입니다.
다른 범위에는 neighborhoods `[]`, neighborhoodType `null`을 씁니다. focusAreas가 없으면
빈 배열을 유지합니다. 확인일은 YYYY-MM-DD, 확인할 수 없는 게시일은 null입니다.
`evidence`는 요약의 근거와 확인 한계를 짧게 기록하고 원문의 장문 복사를 피합니다.

운영·검증은 [지역 서비스 문서](../../docs/local-services.md)를 따릅니다.
서버는 모든 파일을 검증하고 ID/내용 중복·잘못된 범위·근거 누락을 발견하면 503을 반환합니다.
데이터가 없는 지역을 임의로 다른 지역 서비스에 연결하지 않습니다.
