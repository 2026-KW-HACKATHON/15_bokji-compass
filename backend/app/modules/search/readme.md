# 공고 자연어 검색

2026-10-08: `화도` 같은 짧은 고유명사의 끝 글자를 조사로 지우지 않으며 `있는` 요청
표현과 `월계!동` 입력을 정리한다. 공개 어휘에 없는 학교도 명시적 게시기관 요청에서는
원래 기관명을 보존하고 데이터 확인 경고를 반환한다. `geography.regions_for_term(term)`은
공식 지역 후보들을, `geography.region_evidence(record,term,facts)`는 실제 범위 인용에
기반한 상위 지역 서비스 일치 또는 None을 반환한다. 동명이 있는 지역을 임의로 결정하거나
특정 행정동을 다른 법정동에 연결하지 않는다. [필수 데이터·검증](../../../docs/focus-search-data.md).

담당: 백엔드. 사용자의 문장과 전체 최신 공개 공고 스냅샷을 로컬에서 해석하고,
게시 기관·학교 대상·학교 문맥·지원 목적을 원문 근거로 구분합니다.
외부 모델·계정 정보·대화 이력·DB 변경·검색어 영속 저장은 사용하지 않습니다.
[전체 계약·예시·검증·한계](../../../docs/policy-search.md).

## 공개 함수

`public.search_records(records,query,sort="relevance",institutions=(),relation=None)`는
최신 공개 개정과 기존 분야/지역/대상 필터를 통과한 **전체** 후보를 입력받습니다.
`institutions`는 필터와 독립된 전체 최신 공개 원문에서 읽은 기관/학교 어휘입니다.
반환은 `([(record,searchMatch),...],search)`이며 건수와 페이지는 호출자가 이 결과로 계산합니다.
`relation="publisher"/"related"`는 자연어 해석을 유지하여 관계 결과만 좁힙니다.
정렬은 `relevance/popular/recent/name`이고, 각 결과의 원문 근거는 최대 3개·각 250자입니다.
`search`는 `mode/summary/originalQuery/interpretedQuery/corrections/alternatives/warnings`,
`searchMatch`는 `relations/reason/evidence`입니다. 정정은 `{from,to}`, 해석별 결과는
`{scope,label,count}`, 인용은 `{field,quote}`입니다.

`interpretation.interpret_query(query,institutions=()) -> SearchPlan`은 최대 200자의 검색 문장,
실제 공개 기관 이름에서 약칭·오타·지원 개념·제외 요청·대상 표현·관계 의도를 해석합니다.
명시적 `X대생/X대학교 학생/X대 다니는데`는 공개 원문에서 학교가 확인되지 않아도 입력 이름을
그대로 보존해 일반 대학생 지원을 찾고, 미확인 학교 경고를 반환합니다. 다른 학교로 정정하지
않습니다. 알려지지 않은 학교 이름만 입력한 경우와 `우리학교`는 임의로 기관에 연결하지 않습니다.
`relations.source_facts(record) -> list[TextFact]`는 주요 원문·관리자 수정·검증된 개요 인용을
읽고 문의처·URL·JSON 키 등 메타데이터는 제외합니다.
`relations.institution_names(records) -> tuple[str,...]`는 공개 원문 기관·학교 어휘를 반환합니다.
`retrieval.rank_records(records,plan,sort="relevance")`는 모든 후보를 검사하고 전체 관련 순위를
반환합니다. 인기순 일부만 재정렬하거나 후보를 임의로 자르지 않습니다.
각 함수를 독립 호출할 때 공개 상태·필터·인자의 보장은 호출자 책임입니다.
잘못된 해석 입력은 `ValueError`이며 모듈 자체는 DB나 외부 API에 연결하지 않습니다.

## HTTP 연결과 검증

`GET /v1/policies?q=광운대생 받을 돈`과 `/v1/policies/calendar?month=2026-10&q=...`는
기본 자연어 검색을 사용합니다. 학교 대상 안내는 신청 자격 확정을 뜻하지 않습니다.
`search_mode=literal`과 명시적 `search_scope=organization/content`는 기존 단어 검색입니다.
관계 인자는 자연어 검색에만 적용합니다. 목록 해석 건수는 전체 필터 결과,
캘린더 해석 건수는 선택 월의 날짜가 있는 공고이며 미확인 날짜는 따로 셉니다.

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/test_smart_search.py tests/test_policy_search.py tests/test_policy_calendar.py
.\.venv\Scripts\python.exe -m ruff check --no-cache app/modules/search
```

전체 읽기 방식은 공고 수가 커지면 별도 검색 투영·색인이 필요합니다. 공백·Unicode 정리는
필드별로 적용하며 원문 인용 위치도 실제 일치 문구 주변에서 찾습니다. 반복된 본문 줄과 필드의
정규화는 한 조회 내에서 재사용하고, 공개 상태와 최신 개정은 매 요청마다 DB에서 재확인합니다.

성능 확인(2026-10-07, 로컬 Python 3.13): 합성 공개 공고 2,000개와 공고당 약 2KB의
반복된 본문에서 `광운대생 학비 지원 근로 말고` 전체 해석·검색을 비교했습니다.
최적화 전 23.564초, 같은 입력의 최적화 후 1.902초이며 두 경우 모두 2,000개를 반환했습니다.
500개 cProfile에서 377,000번의 공백/Unicode 정리가 주된 비용이었으며,
기관 별칭의 반복 정리·동일 본문 줄의 재검사를 줄이고 필드별 정규화를 재사용했습니다.
DB 시간은 포함하지 않은 합성 측정이며 서로 다른 긴 본문·기관 수·동시 요청의 운영 성능을
보장하지 않습니다. 후보 축소나 결과 누락으로 시간을 줄이지 않습니다.
현재 로컬 DB의 공개 공고 437개를 읽기 전용으로 조회한 시간은 빈 검색 0.104초,
등록금 지원 23건 0.224초, 월세 지원 7건 0.204초, 병원비 요청 78건 0.204초였습니다.
그 DB에는 광운대 기관 원문이 없으므로 학교별 직접 관계는 합성·격리 DB 검증으로 확인하며,
명시적 광운대 소속 표현의 일반 대학생 지원은 미확인 학교 경고와 함께 조회합니다.
같은 실제 DB에서 `광운대생 받을 돈`, `광운대생 장학금`, `광운대학교 학생 학비 지원`은
각각 일반 대학생 지원 1건을 반환했고, 학교 미확인 경고 1개·오타 정정 0개를 유지했습니다.
읽기 전용 측정 시간은 0.216~0.250초이며 직접 학교별 관계나 개인 자격을 판정한 결과는 아닙니다.

상황 설명형 문장의 조사·연결 어미와 배경 상황을 분리합니다. SearchPlan의 contexts/background_concepts를 순위에 참고하며 휴학생 제외 근거를 표시합니다. 함수·검증 범위는 [자연어 상황 검색](../../../docs/conversational-search.md)을 참고하세요.
