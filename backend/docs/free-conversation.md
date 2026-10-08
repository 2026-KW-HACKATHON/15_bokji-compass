# 자유 대화 모드 (2026-10-08)

AI 비서의 `#assistant-chat` 화면은 메시지를 주고받는 대화 모드를 사용한다. 인사나
‘테스트 대화야 아무말이나 보내봐’를 공고 요청으로 처리하거나 안내 대상 설문으로
연결하지 않는다. 지원 요청이 들어오면 현재 공개 공고를 검색하고, 필요한 지역이나
공고 선택은 답변 문장 안에서 확인한다. `follow_up` 선택 폼과 `missing_fields` 패널을
표시하지 않는다. 별도 생활 상황 상담은 기존 `guided` 계약을 유지한다.

## 호출과 반환

회원은 `POST /v1/assistant/dialogue`, 비회원은 `POST /v1/assistant/chat/dialogue`에
`{ "mode": "conversation", "question": "..." }`을 보낸다. 후속 메시지는 같은 `mode`와
`continuation`, `question`을 보낸다. 대화 토큰이 이미 자유 대화로 발급된 경우 `mode`를
생략해도 자유 대화를 유지한다. 기존 요청에서 `mode`를 생략하면 단계별 상담이다.

응답은 기존 상담 필드에 `conversation_mode: "conversation"`을 추가한다.
`follow_up: null`, `missing_fields: []`, `confirmed_fields: []`, `can_save_profile: false`이며
`answer`, `candidates`, `selected_policy`, `catalog_status`, `continuation`을 사용한다.
메시지는 2,000자까지 허용하며 긴 입력도 문장과 제한된 검색 조각으로 해석한다.

`assistant.dialogue.respond()`가 내부 `dialogue_conversation.respond_conversation()`으로
분기한다. 기존 검색 해석·공개 공고 전체 정렬·조건 비교·원문 기반 상세 답변을 재사용한다.
신규 외부 LLM 호출은 추가하지 않았다. 임의의 일반 지식을 생성하는 ChatGPT 전체 기능과
같지는 않으며, 지원 공고 탐색과 안내를 위한 대화다.

## 이어지는 문맥

휴학 등 검색 상황, 기관, 거주 지역, 공개 공고 ID를 임시로 유지한다. 예를 들어
‘휴학생 지원금 찾아줘’ → ‘서울 노원구에 살아’ → ‘고마워’ → ‘첫 번째 공고의 신청 서류는?’을
같은 토큰으로 처리한다. 감사 메시지는 검색 문맥을 지우지 않는다. 명시적인 새 주제나
다른 사람에 관한 요청은 이전 검색 문맥을 초기화한다. 휴학 상태를 정정하면 기존 휴학
신호를 제거한다. 이것은 자격 판정이나 계정 생활정보 저장을 의미하지 않는다.

원문 대화는 서버 상태에 보관하지 않는다. 파생 검색 신호와 공개 공고 ID만 소유자에
묶인 메모리에 30분 유지하며, 버전 비교로 늦게 끝난 요청의 덮어쓰기를 막는다.
공고 상세는 응답 직전 공개 여부를 재확인한다. DB 장애는 후보 없음과 구분한다.

웹 `createDialogueApi(request,{guest,conversational:true})`가 모든 메시지에 모드를 넣는다.
`ConversationMessages({exchanges,latest,answerRef})`는 각 질문·답변과 당시 공고를 순서대로
표시한다. 공고는 상위 3개를 간단히 표시하고 공식 원문으로 연결한다. 이전 답변의 공고를
새 답변으로 교체하지 않는다. 탐색에서 가져온 초안, 실패한 요청의 재시도, 한국어 조합 중
Enter 처리, 계정 전환 때 대화 초기화는 유지한다.

## 검증

백엔드 대화 모드·기존 상담·후속 대화·HTTP API·자연어 검색 관련 133개 테스트 통과.
웹 Node 테스트 190개 통과, 운영 빌드 성공. 브라우저 E2E 명세도 자유 대화 계약으로
갱신했으며 실제 공개 사이트의 비회원 대화는 브라우저로 별도 확인한다.
