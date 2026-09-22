# 개인비서 추천

담당: 프론트엔드.
createRecommendationRepository({mode,request,path?}).recommend(profile,{signal?}) → Promise<{items:[{policy,reason}],summary,source}>.
api 모드는 POST /v1/recommendations로 whitelist 프로필과 limit:3 전송, 30초 제한. 중복·설명 누락·잘못된 공고는 오류입니다. demo는 관심 분야/지역 기반 결정적 UI 예시이며 LLM 결과가 아닙니다.
AssistantHome({profile,result,state,error,onRetry,onProfile,onExplore,easy,saved,onSave,onOpen,onTag,mode}) → React 홈. 로딩/빈/오류·추천 이유·쉬운 화면 한 개씩 표시.
실제 LLM/수집/공고 공급은 서버 책임이며 인증 및 서버 API는 미구현입니다. Node 계약 테스트와 브라우저 추천 흐름으로 검증합니다.
