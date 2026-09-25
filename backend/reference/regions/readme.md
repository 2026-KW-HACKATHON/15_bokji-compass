# 공식 지역코드 스냅샷

출처: [행정안전부 2026-07-20 시행 행정기관·관할구역 변경 자료](https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000052&nttId=127979).
2026-09-25 게시판 확인 기준 최신 주소코드 게시물. `jscode20260720(말소코드포함).zip`의 `KIKcd_H`와 `KIKcd_B`를 CP949 고정폭으로 읽어 UTF-8 CSV 변환.

- ADMIN 9,609행, LEGAL 53,391행. 총 63,000행.
- 기준일 유효 행정코드 3,924건, 법정동코드 20,570건. 시도·시군구 등 상위 지역 포함.
- `code`는 10자리 문자열. 상태값 0/1/9와 별도.
- `valid_from`은 생성일, `valid_to`는 말소일(해당일부터 비활성). 시점 기준은 manifest의 effective_date로 고정.
- 원본 날짜 역전 3건은 수정하지 않고 manifest.source_anomalies에 기록. 활성 지역 조회 제외.
- 원본 ZIP·변환 CSV SHA-256과 게시물·다운로드 URL은 manifest에 보존. 실행 중 CSV 해시 검사.
- `KIKmix` 관계표는 이번 스냅샷에서 사용하지 않음. 행정동과 법정동 간 자동 변환·공간 경계 추정 없음.

공개 기준 데이터만 포함. API 수집 결과·계정·사용자 주소는 이 폴더에 저장하지 않음.
갱신 방법과 이름 해석 제한은 [조건·지역 분류 사용법](../../docs/condition-classification.md) 참조.
