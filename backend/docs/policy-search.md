# 공고 자연어 검색

2026-10-08 보완: 짧은 고유명사 `화도`의 끝 글자를 조사로 지우지 않으며 요청 표현과
`월계!동` 입력을 정리한다. 공개 데이터가 없는 학교의 명시적 게시기관 요청도 기관명을
보존하고 수집 상태 경고를 반환한다. 지리적 검색은 공식 지역 계층과 실제 원문 범위
인용으로 상위 지역 서비스를 찾는다. [광운대·월계동 필수 공개 데이터 적재와 실제 검증](focus-search-data.md).

2026-10-07. 문장으로 적은 요청에서 게시 기관·학교 소속·지원 목적·제외할 지원 형태를 해석하고 공개 공고의 원문 근거로 검색합니다. 검색 범위 선택 없이 `광운대에서 올린 장학 공고`, `광운대생 받을 돈`, `알바 말고 등록금 도와주는 거`를 서로 다르게 처리합니다. 외부 모델·계정 정보·대화 이력·새 DB 스키마를 사용하지 않습니다.

## 호출 계약

`GET /v1/policies?q=광운대생 받을 돈`과 `GET /v1/policies/calendar?month=2026-10&q=광운대생 받을 돈`은 기본으로 자연어를 해석합니다.

| 인자 | 기본값과 동작 |
| --- | --- |
| `q` | 최대 200자. 빈 검색은 기존 전체 공고 조회 |
| `search_mode` | `smart` 기본. `literal`은 입력한 단어를 그대로 검색 |
| `search_scope` | `all` 기본. `organization`·`content`는 명시적인 단어 검색 범위 재정의 |
| `search_relation` | 생략 기본. `publisher/related`는 자연어 해석을 유지하고 기관 관계 결과만 좁힘 |
| `sort` (목록) | 생략 시 자연어 검색은 `relevance`, 빈 검색·명시적 단어 검색은 `popular` |
| `sort` 명시 | `relevance/popular/recent/name`. 사용자가 지정한 정렬 유지 |

기존 분야·태그·지역·대상 필터와 limit/cursor를 유지합니다. 자연어의 나이·지역 표현으로 이 명시적 필터나 회원 프로필을 바꾸지 않습니다. 목록은 `{items,total,nextCursor}`, 캘린더는 `{month,items,total,truncated,undatedItems,undatedTotal}`에 검색 메타데이터를 추가합니다. 빈 검색에는 메타데이터를 추가하지 않습니다. 잘못된 범위·방식·정렬은 HTTP 422입니다.

Python 호출은 `catalog.list_policies(repository,q=...,search_mode="smart",search_scope="all",search_relation=None,sort=None,limit=20,offset=0,category="",region="",audience="",tag="")`와 `catalog.list_calendar(repository,month=...,q=...,search_mode="smart",search_scope="all",search_relation=None,...)`입니다. 잘못된 방식·범위는 `ValueError`, DB 실패는 기존 SQLAlchemy 오류입니다. 단어 검색 모드·명시적 단어 범위·빈 검색에서 `search_relation`은 적용하지 않습니다.

## 해석과 원문 관계

`contracts.search.SearchPlan`은 기관·관계 의도·지원 개념·제외 개념·남은 검색 단어·대상 표현·정정·불확실한 해석을 보존합니다. `search.interpretation.interpret_query(query,institutions=())`는 공개 기관과 공고에 명시된 학교 이름으로 구성한 실제 어휘에서 약칭·명확한 오타를 해석합니다. 이 어휘는 분야·지역 필터와 독립된 최신 공개 개정에서 읽습니다. 필터 때문에 광운대 공고가 사라져도 광운대 소속 요청의 전국 대학생 지원은 해석할 수 있습니다.

대소문자·Unicode 표기·공백을 정리하고 등록금·학비, 월세·집세·임차료 등 지원 목적 표현을 확장합니다. 공개 기관 어휘에 없는 이름도 `X대생/X대학교 학생/X대 다니는데`처럼 소속을 명시한 문장은 입력한 학교 이름을 그대로 보존하여 학교를 특정하지 않은 대학생 지원을 찾습니다. 이 경우 학교가 공개 원문에서 확인되지 않았다는 경고를 반환하며 다른 학교로 오타 정정하지 않습니다. 알려지지 않은 학교 이름만 입력한 경우는 남은 단어 검색으로 처리합니다. `우리학교`를 임의로 광운대에 연결하지 않습니다. 대상 표현은 관련성을 보강하며 일반 지원을 신청 자격 판정으로 차단하지 않습니다. 학교별 대상 공고에는 원문 관계 근거를 요구합니다. 모든 한국어 문장을 이해하는 모델이 아니라 코드의 개념·문장 규칙으로 동작합니다.

`search.relations.source_facts(record)`는 제목과 `text/purpose_summary/eligibility/selection/benefits`, 원문에 저장된 관리자 `summary/benefits/region/age/gender/other` 수정 문구를 읽습니다. 개요 인용은 원문에 실제로 있을 때만 사용합니다. JSON 키·문의처·URL·첨부 메타데이터를 지원 내용으로 사용하지 않고, 본문의 문의처도 학교 대상 근거에서 제외합니다.

| 관계 | 근거와 해석 |
| --- | --- |
| `publisher` | 원문의 게시 기관. 수혜 대상 학교라는 뜻은 아님 |
| `target` | 해당 학교의 재학생·대상·신청 안내를 명시한 원문 |
| `contextual` | 대학 게시 문맥의 본교·우리대학 안내, 광운대 문맥의 KLAS 안내 |
| `student_general` | 다른 학교로 제한하지 않은 전국·국내 대학생 대상 원문 |
| `mention` | 대상·신청 근거를 확인하지 못한 기관 본문 언급 |
| `benefit` | 요청한 지원 개념의 원문 일치 |
| `literal` | 남은 유의미한 검색 단어 또는 대상 표현의 원문 일치 |

광운대가 게시한 논산대학교 학생 전용 공고는 게시 기관 요청에는 포함하지만 광운대 소속 요청에서는 제외합니다. 외부 서강대 원문을 전재한 공고의 `우리대학`을 광운대로 바꾸지 않습니다. 학교 소속 요청은 학교별 공고와 학교를 특정하지 않은 전국 대학생 지원을 함께 찾습니다.

`근로 말고/갚기 싫어` 등 제외 요청은 실제 근로·대출·상환 지원 내용과 부정 표현을 확인합니다. `근로 의무 없음/상환 의무 없음`을 의무가 있다고 뒤집지 않고, 다른 의무의 부정을 옮겨 적용하지 않습니다. `근로 의무와 상환 의무는 없습니다`처럼 공유하는 부정도 처리합니다.

## 관련성·건수·페이지

`search.public.search_records(records,query,sort="relevance",institutions=(),relation=None)`는 필터가 적용된 전체 공개 스냅샷을 해석하고 `(record,searchMatch)` 목록과 검색 메타데이터를 반환합니다. `search.retrieval.rank_records(records,plan,sort=...)`는 학교 대상·학교 문맥·일반 대학생 대상·게시 기관·단순 언급의 관련성과 제목·지원 내용 일치를 평가합니다. 동점은 조회수·공개 개정 생성일·공고 ID로 정렬합니다. 명시한 인기순·최신순·제목순은 검색된 결과에 적용합니다.

공개된 최신 개정을 먼저 선택하고 기존 분야/태그/지역/대상 필터를 SQL에서 적용합니다. 자연어 검색은 필터를 통과한 전체 개정을 판정한 다음 건수·정렬·페이지를 계산합니다. 인기순 상위 일부만 재정렬하지 않아 오래된 관련 공고도 누락하지 않습니다. 빈 검색·단어 검색은 기존 SQL 경로를 유지합니다. 캘린더도 같은 해석을 사용하고 명시된 신청 날짜만 사용합니다. 이전 개정·비공개 초안은 검색에 사용하지 않습니다.

`search` 응답은 `mode/summary/originalQuery/interpretedQuery/corrections/alternatives/warnings`입니다. 정정은 `{from,to}`, 불명확한 기관 검색의 해석별 결과는 `{scope,label,count}`입니다. 기관 해석 선택은 `organization`→`search_relation=publisher`, `content`→`search_relation=related`로 연결하여 원래 자연어 문장과 문맥을 유지합니다. 목록 건수는 현재 필터의 전체 자연어 결과, 캘린더 해석 건수는 선택 월의 날짜가 있는 공고만 셉니다. 미확인 날짜 공고는 `undatedTotal`로 따로 표시합니다. 카드의 `searchMatch`는 `{relations,reason,evidence}`이고, 근거는 원문 `{field,quote}` 최대 3개·각 250자 이내입니다. 검색어·인용·원문을 별도 저장하거나 외부 전송하지 않습니다.

## 검증과 한계

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/test_smart_search.py tests/test_policy_search.py tests/test_catalog_popularity.py tests/test_policy_calendar.py tests/test_policy_categories.py
$env:BOKJI_TEST_MYSQL='1'
.\.venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/test_policy_search.py tests/test_policy_database.py
```

자연어 검증은 게시 기관/학교 대상 분리·학교 문맥·전국 대학생·약칭/오타/공백·근로/상환 제외·지원 목적·필터 독립 어휘·명시적 단어 검색·전체 건수/페이지/정렬·최신 공개 개정·캘린더/미확인 날짜·HTTP를 검사합니다. 단어 검색 검증은 `%/_` 이스케이프·JSON 키/문의처/URL 오탐·필드 경계·관리자 수정도 검사합니다. 옵트인 MySQL은 격리 `bokji_compass_test`와 개발 데이터 경로를 확인합니다. 합성 검색 SELECT와 기존 통합 테스트가 만든 데이터만 사용하며 실제 공고를 변경하지 않습니다.

검색 관계 일치는 소득·나이·거주·학적 조건 충족이나 수급 확정을 뜻하지 않습니다. 원문 밖의 지역·날짜·금액을 생성하지 않습니다. 새 표현·불명확한 오타·복잡한 부정문은 해석 확인이 필요하며 단어 검색으로 재정의할 수 있습니다. 전체 원문을 읽는 구현은 공고 수가 커지면 별도 검색 투영·색인이 필요합니다.
