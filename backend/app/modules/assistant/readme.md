# DB 기반 개인 안내 — 회원 API와 웹 질문

선택형 기본 질문: `GET /v1/assistant/faqs?revision_id=UUID` (회원 쿠키/Bearer 필수).
지원 내용·지원 대상·신청 기간·신청 방법·준비 서류·자격 확인의 6개 질문과 준비된 답변을 반환한다.
고정 질문/안내 문구는 faq.py의 FAQ_TOPICS와 prepared_faqs에서 관리한다. 공고별 사실은 DB
원문에서만 채우며 미기재 항목은 확인 필요로 응답한다. LLM·개인 프로필·추론 제한을 사용하지 않는다.
응답은 `{revision_id,items:[{id,question,response}]}`이며 response_type은 prepared다.
source_json에 신청 방법/서류 필드가 없는 기존 공고는 해당 사실을 추정하지 않는다.

담당: 백엔드. MySQL 공고 개정을 읽어 사용자 질문·선택 프로필로 안내한다.
public.answer_question(repository, revision_id, question, profile, settings, include_drafts=False)
→ answer/status/citations/follow_up_questions/revision_id/source_url/review_status/preview/model.

기본은 공개된 개정만 읽는다. include_drafts=True는 로컬 검토 미리보기 전용이다.
답변 인용을 원문과 재검증하며 eligibility_decided는 항상 false다.
GuidanceProfile은 region/age_band/interests만 허용하고 계정·비밀번호·금융 원자료는 받지 않는다.
질문/선택 프로필은 설정 모델로 전달하며 매번 새 문맥을 사용하고 별도 저장하지 않는다.

CLI: python -m app.modules.assistant <revision_id> "질문" --include-drafts.
DB 오류는 SQLAlchemyError, 입력/근거 오류는 ValueError, 모델 오류는 CodexRunError로 실패한다.
`POST /v1/assistant/questions`는 웹 쿠키 또는 모바일 Bearer 세션을 검증한다.
입력은 revision_id/question만 허용하며 프로필은 서버가 로그인 계정의 지역·연령대로 구성한다.
웹 공고 상세의 질문 화면과 연결했다. 초안 접근 옵션은 HTTP에 노출하지 않는다.
회원당 분당 6회, 서버 프로세스당 동시 2회, 모델 60초 제한이다. 대화 이력·추천·알림은 후속이다.
금융 판정이나 신청 작업은 수행하지 않는다.
테스트: python -m pytest tests/test_assistant.py.
[전체 안내](../../../docs/policy-storage.md) · [실증 기록](../../../docs/worklog.md).
