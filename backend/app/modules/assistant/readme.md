# DB 기반 개인 안내 — 로컬 1차 연결

담당: 백엔드. MySQL 공고 개정을 읽어 사용자 질문·선택 프로필로 안내한다.
public.answer_question(repository, revision_id, question, profile, settings, include_drafts=False)
→ answer/status/citations/follow_up_questions/revision_id/source_url/review_status/preview/model.

기본은 공개된 개정만 읽는다. include_drafts=True는 로컬 검토 미리보기 전용이다.
답변 인용을 원문과 재검증하며 eligibility_decided는 항상 false다.
GuidanceProfile은 region/age_band/interests만 허용하고 계정·비밀번호·금융 원자료는 받지 않는다.
질문/선택 프로필은 설정 모델로 전달하며 매번 새 문맥을 사용하고 별도 저장하지 않는다.

CLI: python -m app.modules.assistant <revision_id> "질문" --include-drafts.
DB 오류는 SQLAlchemyError, 입력/근거 오류는 ValueError, 모델 오류는 CodexRunError로 실패한다.
로그인 연결·대화 이력·API·챗봇 화면은 후속이다. 금융 판정이나 신청 작업은 수행하지 않는다.
테스트: python -m pytest tests/test_assistant.py.
[전체 안내](../../../docs/policy-storage.md) · [실증 기록](../../../docs/worklog.md).
