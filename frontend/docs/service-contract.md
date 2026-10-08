# 공고·개인비서 HTTP 계약

2026-10-08 `sourceFields`의 JSON 객체/배열 문자열은 서버가 법령명·기관과 전화번호·
신청 단계·파일명과 주소를 줄별로 정제해 반환합니다. `dict[str,str]` 계약과 원천 키는
유지하고 `contact`/`applicationMethod`도 정제합니다. 웹/모바일은 표시 문자열을 그대로
사용하며 원문 근거와 신청 날짜는 변경하지 않습니다. [변환·검증](../../backend/docs/notice-source-fields.md).

2026-10-07 공개 상세 `/v1/policies/{id}`는 content, sourceFields, gender, otherConditions,
applicationMethod, applicationUrl, contact, publishedDate, modifiedDate를 선택 필드로 반환합니다.
관리자 편집은 [전용 서버 콘솔 계약](../../api-management.md)을 사용합니다. 같은 공개 개정을
목록·상세·캘린더가 조회하며 웹은 활성 상태 30초 및 화면 복귀/포커스 시 갱신합니다.

상태: **공고 조회·조건 비교 추천 서버 구현** (2026-10-06). 담당: 프론트·백엔드 공동.
회원 DB 연결·추가 반환값은 [현재 매칭 계약](../../backend/docs/member-policy-matching.md),
인증·금융 계산·회원 저장 API는 [연동 현황](api-integration.md)과 [루트 관리대장](../../api-management.md) 참고.

서버는 공개 공고를 공급하고 사용자 정보와 정규화 조건을 비교합니다. 내부 파싱 초안은 공개
API에 노출하지 않습니다. matching_enabled=false 공고는 조건 비교와 확인사항만 안내하며
신청 자격을 확정하지 않습니다. 웹·Android·iOS가 같은 API 계약을 사용할 수 있습니다.

## 공고 목록: GET /v1/policies
웹 기본 요청: /api/v1/policies (proxy가 /api 제거).
쿼리: q(최대 200자), search_mode(smart/literal, 기본 smart), search_scope(all/organization/content, 기본 all), search_relation(publisher/related, 자동 해석 결과의 선택), tag(정확한 태그), category, region, audience, sort(relevance/popular/recent/name), limit(1~100, 웹 일반 6/쉬운 화면 3), cursor(숫자 offset 문자열).
전체 필터는 생략. 지역 선택 시 전국 공고도 포함. 검색·태그·필터는 AND로 적용합니다. 인기순은 확인된 정부24/복지로 누적 조회수 내림차순이며 미제공 공고는 뒤에 표시합니다. 동률은 최근 등록일·고정 ID로 처리하고 전체 결과를 정렬한 뒤 페이지를 나눕니다. 서버는 필터·정렬 변경 시 cursor를 재사용하지 않는다고 가정합니다.
기본 `smart + all`에서는 게시기관·지원 대상 관계, 지원 목적, 제외 조건과 확인된 기관명 오타를 해석합니다. 검색어가 있으면 `sort` 생략 시 관련도순, 검색어가 없으면 인기순이며 명시한 정렬을 우선합니다. `광운대생 받을 돈`은 광운대 대상·학교 신청 안내와 전국 대학생 지원을 함께 찾습니다. `광운대`만 입력하면 게시기관과 직접 관련 공고를 함께 안내합니다. 회원 학교·신청 자격을 추정하지 않습니다.

직접 입력한 학교 소속에 해당하는 공고가 없으면 입력 학교명을 유지하고 전국 대학생 지원 근거를 찾으며 `warnings`로 학교가 공고에서 확인되지 않았음을 안내합니다. 이름을 임의로 확정하거나 다른 학교 전용 지원으로 대체하지 않습니다. 학교가 지정되지 않은 `우리학교`도 임의 학교에 연결하지 않습니다.

선택 페이지 필드 `search`는 `{mode,summary,originalQuery,interpretedQuery,corrections:[{from,to}],alternatives:[{scope,label,count}],warnings?}`입니다. 선택 카드 필드 `searchMatch`는 `{relations,reason,evidence:[{field,quote}]}`이며 관계는 publisher/target/contextual/student_general/mention/benefit/literal입니다. 인용은 원문에 있는 문자열로 최대 250자·3개입니다. 웹·모바일은 입력 원문을 유지하고 해석·대안·근거를 표시합니다. 보정 되돌리기는 원문으로 literal 검색합니다. 잘못된 선택 메타데이터는 버리고 기본 카드·페이지를 유지하며 HTML을 렌더링하지 않습니다.

해석 대안 버튼은 `organization → search_relation=publisher`, `content → search_relation=related`로 좁히고 원래 검색어·smart/all을 유지합니다. 같은 선택을 누르면 해제합니다. 추가 옵션의 literal 검색 범위와 구분하며 학교 문맥·전국 대학생 근거를 단어 검색으로 잃지 않습니다. 새 검색·단어 검색 전환·검색 범위 변경은 관계 선택을 초기화하고 쉬운 화면 전환은 유지합니다. 대안 건수는 관계 선택 전 전체 해석 결과의 건수입니다. 캘린더는 요청한 월과 접수 기간이 겹치는 공고를 세며 일정 미확인 공고는 기존 undatedTotal로 따로 안내합니다.

`literal` 또는 명시한 `organization`/`content` 범위에서는 공백 구분 AND 키워드 검색을 사용합니다. `organization`은 게시기관 이름, `content`는 제목·본문·사업 목적·지원 대상·선정 기준·혜택과 관리자 수정 내용입니다. 대학 약칭·정식 표기를 함께 찾으며 원문 URL·문의처 필드만 일치하는 결과는 포함하지 않습니다. 범위·모드 변경 시 cursor를 초기화하고 쉬운 화면 전환 시 유지합니다. 캘린더 API도 같은 `search_scope`와 `search_mode`, 선택 메타데이터를 받습니다. [검색 계약·검증](../../backend/docs/policy-search.md).
```json
{
  "items": [{
    "id": "policy-example",
    "title": "공고 제목",
    "summary": "검토된 공고의 짧은 설명",
    "category": "주거",
    "region": "서울",
    "audience": "청년",
    "organization": "담당 기관",
    "benefit": "지원 내용",
    "tags": ["주거", "청년"],
    "date": "2026-09-22",
    "applicationPeriod": "공식 모집 일정",
    "sourceUrl": "https://example.org/notice"
  }],
  "total": 1,
  "nextCursor": null
}
```
id/title/summary/tags 필수. total은 현재 필터의 전체 수, nextCursor는 다음 페이지의 문자열 또는 null(끝). ID 중복·누락된 페이지 정보는 오류. 나머지 필드는 누락 시 안전한 안내문으로 표시. sourceUrl은 HTTP(S)만 허용하며 사용자명/비밀번호 URL 차단. icon/tone은 클라이언트에서 정하고 서버 HTML은 렌더링하지 않음.
분야: 생활·금융, 주거, 일자리, 교육, 건강·돌봄, 문화, 농림축산·어업, 사업·창업, 기타. 기존 넓은 분류도 서버에서 공고의 지원 내용에 따라 재분류하며 관리자 수동 분류를 우선합니다. 목록·상세·캘린더와 분야/태그 필터에 동일한 분류를 적용합니다. [분류 기준](../../backend/docs/policy-categories.md).
`GET /v1/policies/{id}`는 최신 공개 상세를 반환합니다. 목록·상세는 선택 `popularity: {views,source,basis:"provider_cumulative_views",asOf} | null`로 정렬 근거를 전달합니다. 최신 신청 조건은 sourceUrl로 확인합니다.

## 개인비서: POST /v1/recommendations
```json
{
  "profile": {
    "region": "서울",
    "ageBand": "65세 이상",
    "occupation": "은퇴 후",
    "household": null,
    "interests": ["건강·돌봄", "문화"]
  },
  "limit": 3
}
```
기본 `profile`의 미선택 항목은 null, 관심 분야는 중복 없는 배열입니다. 기본 프로필에는 지역·연령대·상황·가구·관심 분야만 전송하며 이메일·비밀번호·임의 추가 속성을 제외합니다. 소득·재산 원자료는 기본 프로필에 합치지 않고 사용자가 별도로 선택했을 때 아래 `financialProfile` 확장 필드로 전달합니다. 진단·주민번호·정확한 주소는 받지 않습니다.
연령대: 19세 미만 / 19~34세 / 35~49세 / 50~64세 / 65세 이상.
상황: 학생 / 취업 준비 중 / 직장인 / 자영업자 / 은퇴 후 / 기타.
가구: 혼자 살아요 / 가족과 살아요.

응답: { "summary": "짧은 추천 요약", "items": [{ "policy": "위 공고 객체", "reason": "사용자에게 설명할 추천 이유", "matching": "조건 비교 객체" }], "mode": "personalized | popular | general | profile_required", "profile_sufficient": false, "guidance": "정보 충분성 안내", "missing_fields": [] }.
policy 값은 실제 JSON 객체입니다. 최대 3개, 중복 ID 불가, 각 reason은 비어 있지 않은 문자열. items=[]는 추천 없음.
서버가 공고 조회·조건 비교·원문 검증을 수행합니다. 추천에는 LLM을 호출하지 않습니다.
쉬운 화면에서도 요청은 최대 3개입니다. UI가 이유를 임의 생성하거나 자격 확률을 만들지 않습니다.

2026-10-07: 프로필을 생략한 비회원 요청도 지원합니다. 공고별 필수 조건을 확인할 수 있을
때만 `personalized`와 `profile_sufficient=true`를 반환합니다. 정보가 부족하면 지원 대상
제한이 없다는 원문 근거와 현재 접수 기간이 확인된 일반 후보를 반환하며, 실제 정부24·복지로
누적 조회수 근거가 있으면 `popular`로 안내합니다. 안전한 후보가 없으면 `profile_required`와
정보 입력 안내를 제공합니다. `policy.popularity`, `policy.budget`, `policy.budgetNotice`는
실제 출처 데이터가 있을 때만 있는 선택 필드입니다. [필드와 검증](../../api-management.md).

### 선택 확장: financialProfile

추천 요청 본문의 형식은 `{profile, limit:3, financialProfile?: FinancialProfile}`입니다. `financialProfile`의 전체 스키마는 실제 계산 API가 사용하는 [FinancialProfile](../../backend/app/contracts/finance.py)이며 `schema_version`, `reference_year`, 가구·가구원 소득, 재산·부채·차량 원자료를 포함합니다. 전월세 보증금과 소유 주택 가액, 일반 기타소득과 사적이전소득은 각각 분리합니다. 빈 금액을 0으로 바꾸지 않습니다. 기준표·공제율·계산된 소득인정액은 요청에서 신뢰할 입력으로 보내지 않습니다.

계산 결과에서 사용자가 ‘관련 공고 살펴보기’를 눌러 금융정보 사용을 선택했을 때만 이 선택 필드를 활성화합니다. 기본 추천은 필드를 생략하고 금융정보 계산·계정 저장·불러오기만으로 자동 활성화하지 않습니다. 계산·회원 저장·불러오기·삭제로 상위 금융 원자료를 갱신하거나 로그인/로그아웃하면 선택 상태를 해제합니다. 활성화 후 같은 정보로 재추천할 수 있지만 새로고침을 넘어 선택 상태를 보관하지 않습니다. 공고 demo는 이 필드를 전송하거나 금융조건으로 예시 공고를 판정하지 않으며, 홈 전환 후 실제 금융 맞춤 추천은 준비 중이라는 안내를 표시합니다.

`financialProfile` 입력은 구현했지만 금액 조건 매칭은 후속입니다. 공고의 소득 기준
(중위소득 단순 비교·사업별 소득인정액·도시근로자 평균), 심사 가구 범위, 차량 포함 여부,
기준 연도, 공제와 공식 근거를 검토된 데이터에 연결해야 합니다. 서버 내부의 `evaluate_policy`
확장 지점은 공개 엔드포인트가 아니며 호출자가 ‘검토 완료’를 주장한 조건을 그대로 적용하지
않습니다. 미확인 사실·미지원 산식은 추가 검토로 남기고 임의로 통과/탈락으로 바꾸지 않습니다.

## 실패·운영 책임
HTTP 4xx/5xx, 네트워크, 잘못된 JSON/스키마, 시간 초과를 실패로 처리하고 사용자가 재시도합니다. 404는 아직 서비스 준비 중이라고 표시. 추천 POST 자동 재시도 없음. 요청 교체/화면 종료 시 취소. 서버 오류 본문을 그대로 사용자에게 보여주지 않음.
공개 공고 조회는 credentials=omit, 웹 추천은 credentials=include와 X-Auth-Request:1을 사용합니다.
추천은 비회원 프로필과 회원 세션을 구분하며 회원은 분당 20회 요청 제한을 적용합니다.
오류 응답은 원입력을 반영하지 않고 모든 추천 응답은 no-store입니다. OpenAPI는 실제 코드에서 생성합니다.
# 2026-10-06 실제 추천 구현

`POST /v1/recommendations`는 서버에 구현되어 있습니다.
웹 추천 호출은 credentials=include/X-Auth-Request:1, 앱은 Bearer 인증을 사용합니다.
회원 기본정보는 서버 DB가 우선하고 비회원은 요청 프로필로 비교합니다. 원입력 금융정보 사용은
기존처럼 명시적인 선택입니다. `use_saved_financial_profile:true`는 로그인 본인의 저장 JSON을
사용하는 추가 선택이며 직접 financialProfile과 동시에 보낼 수 없습니다.
응답 policy/reason 계약을 유지하고 items마다 matching(상태/조건별 근거/확인사항)을 추가합니다.
LLM 없이 정규화 조건을 비교하며 모든 결과의 eligibility_decided는 false입니다.
[현재 저장·매칭 계약](../../backend/docs/member-policy-matching.md).
