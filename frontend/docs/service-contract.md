# 공고·개인비서 HTTP 계약 제안
상태: **프론트 호출자용 제안, 서버 미구현·미확정** (2026-09-22). 담당: 프론트·백엔드 공동 확정. 실제 구현은 [루트 관리대장](../../api-management.md)을 기준으로 구분합니다.

서버는 검토된 공개 공고를 공급하고 사용자 정보에 따라 LLM 추천을 수행합니다. 내부 파싱 초안이나 matching_enabled=false 자료를 공개 API로 그대로 반환하지 않습니다. 추천 이유는 자격 판정 결과가 아닙니다. 웹·Android·iOS가 같은 계약을 사용합니다.

## 공고 목록: GET /v1/policies
웹 기본 요청: /api/v1/policies (proxy가 /api 제거).
쿼리: q(공백 구분 AND 검색), tag(정확한 태그), category, region, audience, sort(recent/name), limit(1 또는 6), cursor(불투명 문자열).
전체 필터는 생략. 지역 선택 시 전국 공고도 포함. 검색·태그·필터는 AND, 최근순 동률은 고정 ID로 안정적으로 처리. 서버는 필터 변경 시 cursor를 재사용하지 않는다고 가정합니다.
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
분야: 생활·금융, 주거, 일자리, 교육, 건강·돌봄, 문화. 지역은 현재 표시명으로 공식 행정 코드 미확정. 날짜/지역 코드 및 대상 확장 정책은 서버 확정 시 어댑터를 함께 수정.
별도 상세 endpoint는 아직 제안하지 않음. 현재 목록이 상세 표시에 필요한 정보를 포함하며 저장은 해당 스냅샷. 최신 신청 조건은 sourceUrl로 확인.

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
미선택 항목은 null, 관심 분야는 중복 없는 배열. 프론트는 위 필드만 전송하며 이메일·비밀번호·임의 추가 속성을 제외합니다. 정밀 소득·진단·주민번호·정확한 주소를 받지 않습니다.
연령대: 19세 미만 / 19~34세 / 35~49세 / 50~64세 / 65세 이상.
상황: 학생 / 취업 준비 중 / 직장인 / 자영업자 / 은퇴 후 / 기타.
가구: 혼자 살아요 / 가족과 살아요.

응답: { "summary": "짧은 추천 요약", "items": [{ "policy": "위 공고 객체", "reason": "사용자에게 설명할 추천 이유" }] }.
policy 값은 실제 JSON 객체입니다. 최대 3개, 중복 ID 불가, 각 reason은 비어 있지 않은 문자열. items=[]는 추천 없음.
서버가 공고 조회·LLM 추론·추천 검증을 수행하고 키를 보관합니다. 쉬운 화면에서도 요청은 최대 3개이며 표시만 한 개씩 넘깁니다. UI가 이유를 임의 생성하거나 자격 확률을 만들지 않습니다.

## 실패·운영 책임
HTTP 4xx/5xx, 네트워크, 잘못된 JSON/스키마, 시간 초과를 실패로 처리하고 사용자가 재시도합니다. 404는 아직 서비스 준비 중이라고 표시. 추천 POST 자동 재시도 없음. 요청 교체/화면 종료 시 취소. 서버 오류 본문을 그대로 사용자에게 보여주지 않음.
현재 credentials=omit, 인증 미연결. 배포 전 서버 인증·인가, rate limit, 비용 제한, 프로필 보관/로그 정책, 최종 스키마/OpenAPI를 확정해야 합니다. 웹 폼 구현이 인증을 대신하지 않습니다.
