# 공고 검색에서 AI 비서로 이어가기 (2026-10-08)

전체 공고 검색을 제출한 뒤 상황을 설명하는 문장에는 AI 비서 상담 안내를 표시한다.
검색 결과와 기존 필터는 함께 남으며 자동 이동이나 자동 전송은 하지 않는다.
‘이 내용으로 AI 비서와 상담하기’를 누르면 기존 `App.startGuidance(question)`를 통해
`assistant-chat`으로 이동하고 원문을 보내지 않은 상담 입력으로 가져간다.

`suggestsConversation(query) -> boolean`은 `features/policies/searchConversation.js`의
순수 함수다. 200자 이하의 16자 이상 개인 상황+지원 요청, 또는 40자 이상 상담형
문장을 판단한다. 짧은 사업명·학교명 검색과 긴 단순 공고 제목에는 표시하지 않는다.
`SearchConversationSuggestion({query,onAskAssistant}) -> React element|null`은
콜백이 있으면 안내·버튼을 표시하고 클릭 시 원래 query를 전달한다. 표시 판단은
제출한 query를 기준으로 하므로 편집 중 문장과 실제 검색 문장이 섞이지 않는다.

`PolicyExplorer`의 선택 props `onAskAssistant(question)`를 App에 연결한다.
`restoreDialogueSession(session, owner, revisionId=null)`은 같은 선택 공고와 같은
계정 또는 현재 탭의 비회원(`owner:null`) 문장도 복원한다. 로그인 상태가 바뀌면
상위 App에서 기존 상담을 지운다. 전송·동의·저장은 사용자의 기존 상담 동작을 따른다.
검색 문장을 전달하기 위한 새 URL 파라미터나 브라우저 저장값은 만들지 않는다.

한국어·영어·중국어·베트남어·일본어 UI 문구를 등록했다. 안내는 좁은 화면에서
세로로 배치하고 버튼은 44px 이상이다. `tests/search-conversation.test.js`에서
표시 판단과 원문/비회원/계정 경계를 검증하며 실제 화면에서도 검색→상담 입력을 확인한다.

공유 게이트웨이의 허용 경로에 기존 비회원 상담 /v1/assistant/chat/dialogue가 빠져 있던 문제도 수정했습니다. 실제 HTTPS 화면에서 검색 원문 전달 후 비회원 상담 응답까지 확인했습니다. tests/e2e/search-conversation.spec.js에는 비회원/회원, 0건 검색, 편집 중 문장 대신 제출 원문 전달, 자동 전송 방지 회귀 사례를 제공합니다. 이 요청에서는 해당 브라우저 회귀 파일의 자동 실행 대신 실제 서비스의 비회원 흐름을 확인했습니다.
