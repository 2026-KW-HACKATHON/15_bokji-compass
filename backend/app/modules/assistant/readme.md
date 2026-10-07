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
공고 원문 질문은 회원당 분당 6회, 서버 프로세스당 동시 2회, 모델 60초 제한이다.
금융 판정이나 신청 작업은 수행하지 않는다.
테스트: python -m pytest tests/test_assistant.py.
[전체 안내](../../../docs/policy-storage.md) · [실증 기록](../../../docs/worklog.md).

## 부족한 정보를 확인하는 생활 상담

`dialogue.respond(repository | None, member, DialogueInput, DialogueStore,
saved_profile=MonitoringProfile | None)`은 모델 호출 없이 검토된 질문으로 필요한 정보를 모은다.
`POST /v1/assistant/dialogue`의 첫 요청은 `{question, revision_id?}`, 이어지는 요청은
`{continuation, answer:{slot,value}}`다. 슬롯이 가리키는 현재 질문에 직접 답한 값만 비교에 쓴다.
일반 질문은 주거 개선, 취업, 재난, 누수 등의 **관심 주제**를 선택할 뿐 소유·실업·피해를 확정하지
않는다. 안내 대상도 본인 현재 상황, 다른 사람, 가정·관심 상황으로 직접 확인한다.

응답에는 `answer`, `follow_up:{slot,question,input_type,options,allow_unknown}`, `missing_fields`,
`continuation`, `profile_draft`, `confirmed_fields`, `can_save_profile`, `answer_accepted`,
`candidates`, `candidate_count`, `selected_policy`, `catalog_status`, `practical_steps`,
`source_links`, `session_notice`, `eligibility_decided:false`가 있다.
`answer_accepted`는 새 질문에서 null, 유효 답변·건너뛰기에서 true, 다시 입력이 필요하면 false다.

`building_year`는 `1920년 건축`처럼 제한된 짧은 표현도 받는다. 여러 연도·추측 표현·다른 사람의
상황을 포함한 모호한 답은 같은 질문으로 재확인한다. `null`이나 `모르겠어요`는 건너뛰며 같은
질문을 반복하지 않는다. 저장된 본인 프로필의 이미 알려진 항목은 다시 묻지 않는다. 이번 흐름에서
건너뛰거나 기존에 저장한 항목을 수정하려면 정보 편집 화면 또는 새 질문으로 돌아간다.
지원 자격을 확인하려고 건축 연도를 물어도, 연식 하나만으로 지원금 지급 가능성을 확정하지 않는다.

다른 사람·가정 상황은 회원의 나이·지역·기존 생활 프로필을 가져오지 않는다. 지역은 대화에서
별도로 확인할 수 있지만 회원 주소나 지속 안내 프로필을 자동 변경하지 않는다. 소득·추가 대상자
조건 등 현재 입력 가능한 슬롯 밖의 미확인 조건은 공고별 `comparison.checks`와 후보의
`questions`에 남겨 둔다. `missing_fields`는 현재 주제의 기본 질문 항목만 포함한다.
주거 개선 문의만으로도 공개 공고를 탐색할 수 있으며 직접 확인된 사실을 답할 때마다 비교한다.
알려진 불일치는 후보에서 제외하고 미확인 요건은 유지한다. 선택한 공고의 불일치는
`selected_policy.comparison`에 보이며 비공개 전환 시 응답을 중단한다. 후보 응답은 최대 12건이며
`candidate_count`가 전체 탐색 수다. DB 장애 시 공고를 확인했다고 주장하지 않고 정보 수집을 유지한다.

누수 질문에는 생활 대처 문구를 먼저 보여주고 지원 탐색 의사를 확인한다. 누수와 침수가 함께 언급돼도
조건부 전기·침수 안전 안내를 잃지 않는다. 안전 문구의 근거는 `LEAK_GUIDANCE.links`의 국민안전24
침수 행동요령이며 단순 누수를 재난 피해로 저장하지 않는다.

`DialogueStore`는 무작위 opaque 토큰으로 계정에 묶인 최소 구조화 상태만 서버 메모리에 둔다.
질문 원문·전체 대화·공고 결과·다른 계정의 정보는 저장하지 않는다. 최초 질문부터 30분 이후 접근을
거절하고 앱 수명 주기의 `prune_expired()` 호출이 만료 정보를 30초 간격으로 정리한다.
접근 시에도 만료 항목을 정리한다. 최대 2,000개 상태를 유지하며 서버 재시작이나 다른
프로세스에서는 대화를 다시 시작해야 한다. 여러 서버 프로세스를 운영하려면 계정 범위·만료·삭제
계약을 유지하는 공유 임시 저장소로 교체해야 한다. 질문 이력을 장기간 기억하는 기능은 포함하지 않는다.

지속 안내 저장은 별도 동의가 있는 `POST /v1/assistant/dialogue/profile`을 사용한다.
`DialogueStore.save_confirmed(account_id, continuation, persist_callback)`은 본인의 현재 상황으로
확인한 MonitoringProfile 필드만 짧은 DB 병합 트랜잭션으로 전달하고 성공한 필드를 소비한다.
다른 사람·가정·미확인 정보는 저장할 수 없다. 저장 중 새 답변·중복 저장은 잠금으로 직렬화하고
저장 실패 시 임시 답변을 유지한다. `discard_account`는 계정별, `clear`는 서버 종료 시 상태를 지운다.

검증: `python -m pytest tests/test_assistant_dialogue.py tests/test_assistant.py
tests/test_assistant_faq.py` — 54개 통과. 계정 격리·토큰 변조·만료·동시 답변·저장 재시도·1920년 응답·
알 수 없음 건너뛰기·제3자 질문·누수 대처·공개 원문 재비교·공고 철회·DB 장애를 포함한다.
