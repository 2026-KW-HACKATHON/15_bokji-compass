# 개인비서 추천

현재 공고 조회 API와 회원 공고 질문 API를 연결했습니다. 추천 API는 후속입니다.
PolicyQuestion({revisionId,user})는 공고 상세의 단일 질문/답변 화면입니다.
createQuestionApi()가 반환한 함수를 `ask(revisionId,question,{signal})`로 호출합니다.
POST /v1/assistant/questions에 쿠키와 X-Auth-Request를 전송합니다. 질문/답변은 메모리에만 두며
계정·개정 변경과 상세 닫기에서 제거하고 진행 요청을 취소합니다. 모델에 전달하는 지역/연령대는
서버 계정 정보에서 구성합니다. 답변 개정·공개 여부·인용 형식을 확인한 뒤 일반 텍스트로 표시합니다.

담당: 프론트엔드.
createRecommendationRepository({mode,request,path?}).recommend(profile,{signal?}) → Promise<{items:[{policy,reason}],summary,source}>.
api 모드는 POST /v1/recommendations로 whitelist 프로필과 limit:3 전송, 30초 제한. 중복·설명 누락·잘못된 공고는 오류입니다. demo 런타임 경로는 제거했으며 직접 요청하면 설정 오류를 반환합니다.
AssistantHome({profile,result,state,error,onRetry,onProfile,onExplore,easy,saved,onSave,onOpen,onTag,mode}) → React 홈. 로딩/빈/오류와 추천 이유를 표시합니다. 쉬운 화면은 중복 안내를 합치고 최초 추천을 위한 ‘맞춤 공고 찾기’ 하나를 주 행동으로 강조합니다. 추천 후에는 한 열에 공고 3개를 표시하며 정보 수정·재추천을 보조 행동으로 제공합니다.
실제 LLM/수집/공고 공급은 서버 책임이며 추천 서버 API 연결은 후속 작업입니다. 공고 조회·회원 질문은 서버에 연결했습니다. Node 계약 테스트와 브라우저 추천 흐름의 현재 확인 범위는 [쉬운 화면 문서](../../../../docs/senior-mode.md)에 기록합니다.

메인 로고는 사용자 제공 public/brand-logo.png를 사용합니다. 쉬운 화면은 정보 위계와 주 행동을 우선하며 장식 로고는 좁은 화면에서 생략합니다. 대상·지원 내용·신청 기간과 미확인 정보 안내는 공고를 판단하는 데 필요하므로 유지합니다.
