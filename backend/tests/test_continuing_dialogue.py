"""Free follow-ups preserve explicit facts, source context and account isolation."""


import pytest
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.modules.assistant import dialogue
from app.modules.assistant.dialogue_models import (
    DialogueError,
    DialogueInput,
    DialogueState,
    DialogueStore,
)
from app.modules.monitoring.models import MonitoringProfile
from tests import test_assistant_dialogue as existing
from tests import test_assistant_dialogue_api as api_tests

repository = existing.repository
stable_date = existing.stable_date
client = api_tests.client


def continue_question(store, previous, question, *, member=existing.MEMBER, repository=None):
    return dialogue.respond(repository, member, DialogueInput(
        continuation=previous["continuation"], question=question), store)


def source_notice(key="source", *, title="주택 리모델링 지원"):
    row = existing.general_record(key, title)
    row["source_json"]["fields"].update({
        "application_method": "온라인 신청 https://www.nowon.kr/apply/house",
        "documents": "신분증\n임차인은 임대차계약서 추가 제출",
        "application_period": "2026-10-01 ~ 2026-10-31",
    })
    return row


def owned_conversation(repository):
    store = DialogueStore()
    first = existing.ask(store, repository=repository)
    first = continue_question(store, first, "본인", repository=repository)
    first = continue_question(store, first, "자가", repository=repository)
    first = continue_question(store, first, "1920년 건축", repository=repository)
    return store, first


def test_input_accepts_followup_question_but_does_not_accept_client_profile():
    value = DialogueInput(question="그럼 서류는?", continuation="a" * 43)
    assert value.answer is None
    for extra in ({"profile": {}}, {"answer": {"slot": "job_seeking", "value": True}},
                  {"revision_id": "00000000-0000-0000-0000-000000000000"}):
        with pytest.raises(ValidationError):
            DialogueInput.model_validate({**value.model_dump(exclude_none=True), **extra})


def test_free_text_answers_current_question_without_starting_a_new_conversation(repository):
    repository.save(source_notice())
    store, result = owned_conversation(repository)
    assert result["profile_draft"]["housing_tenure"] == "owner"
    assert result["profile_draft"]["building_year"] == 1920
    assert result["confirmed_fields"] == ["building_year", "housing_tenure"]
    assert len(store._entries) == 1
    assert result["follow_up"]["slot"] == "housing_type"


@pytest.mark.parametrize("question,expected", [
    ("신청 서류는 무엇을 준비해?", "임차인은 임대차계약서 추가 제출"),
    ("어떻게 신청해?", "https://www.nowon.kr/apply/house"),
    ("언제까지 신청해?", "2026-10-01 ~ 2026-10-31"),
    ("지원 대상은?", "지원 대상:"),
    ("전화번호 알려줘", "신청 안내예요"),
    ("연락처는?", "신청 안내예요"),
])
def test_source_followup_preserves_known_facts_and_selected_policy(repository, question, expected):
    row = source_notice()
    repository.save(row)
    store, previous = owned_conversation(repository)
    result = continue_question(store, previous, question, repository=repository)
    assert result["continuation"] == previous["continuation"]
    assert expected in result["answer"]
    assert result["profile_draft"] == previous["profile_draft"]
    assert result["selected_policy"]["policy"]["revisionId"] == row["revision_id"]
    assert result["follow_up"]["slot"] == "housing_type"
    assert result["eligibility_decided"] is False
    state, _ = store.read(result["continuation"], existing.MEMBER["id"])
    assert question not in repr(state)


def test_multiple_candidates_require_a_choice_before_reading_their_source(repository):
    repository.save(source_notice("first"), source_notice("second", title="주택 리모델링 신청"))
    store, previous = owned_conversation(repository)
    first_revision = previous["candidates"][0]["policy"]["revisionId"]
    choice = continue_question(store, previous, "신청 서류는?", repository=repository)
    assert "어느 공고인지" in choice["answer"] and choice["selected_policy"] is None
    answer = continue_question(store, choice, "첫 번째 공고 신청 서류는?", repository=repository)
    assert answer["selected_policy"]["policy"]["revisionId"] == first_revision
    assert "신분증" in answer["answer"]


def test_explicit_ordinal_and_title_change_the_previously_selected_notice(repository):
    repository.save(source_notice("first"), source_notice("second", title="주택 리모델링 신청"))
    store, previous = owned_conversation(repository)
    revisions = [item["policy"]["revisionId"] for item in previous["candidates"]]
    first = continue_question(store, previous, "첫 번째 공고 신청 서류는?", repository=repository)
    assert first["selected_policy"]["policy"]["revisionId"] == revisions[0]
    second = continue_question(store, first, "두 번째 공고 신청 서류는?", repository=repository)
    assert second["selected_policy"]["policy"]["revisionId"] == revisions[1]
    first_title = previous["candidates"][0]["policy"]["title"]
    by_title = continue_question(store, second, first_title + " 신청 서류는?",
                                 repository=repository)
    assert by_title["selected_policy"]["policy"]["revisionId"] == revisions[0]
    assert by_title["profile_draft"] == previous["profile_draft"]


def test_new_topic_keeps_explicit_self_facts_but_does_not_infer_new_personal_circumstances(
        repository):
    repository.save(source_notice())
    store, previous = owned_conversation(repository)
    result = continue_question(store, previous, "취업 지원도 알아보고 싶어", repository=repository)
    assert result["topic"] == "employment"
    assert result["profile_draft"]["housing_tenure"] == "owner"
    assert result["profile_draft"]["job_seeking"] is None
    assert result["follow_up"]["slot"] == "occupation"
    state, _ = store.read(result["continuation"], existing.MEMBER["id"])
    assert state.subject == "self" and state.revision_id is None


@pytest.mark.parametrize("save_completed", [False, True])
def test_delayed_comparison_cannot_overwrite_a_new_selection_or_completed_profile_save(
        repository, monkeypatch, save_completed):
    repository.save(source_notice("first"), source_notice("second", title="주택 리모델링 신청"))
    store, previous = owned_conversation(repository)
    second_revision = previous["candidates"][1]["policy"]["revisionId"]
    compare = dialogue._compare

    def compare_then_update(*args, **kwargs):
        result = compare(*args, **kwargs)
        token = previous["continuation"]
        state, version = store.read(token, existing.MEMBER["id"])
        if save_completed:
            store.consume_confirmed(existing.MEMBER["id"], token,
                                    expected=store.get_confirmed(existing.MEMBER["id"], token))
        else:
            state.revision_id = second_revision
            store.update(token, existing.MEMBER["id"], state, version)
        return result

    monkeypatch.setattr(dialogue, "_compare", compare_then_update)
    continue_question(store, previous, "첫 번째 공고 신청 서류는?", repository=repository)
    state, _ = store.read(previous["continuation"], existing.MEMBER["id"])
    if save_completed:
        assert state.confirmed == set()
    else:
        assert state.revision_id == second_revision


def test_other_person_question_resets_self_context_before_gender_comparison(repository):
    repository.save(source_notice())
    store, previous = owned_conversation(repository)
    result = continue_question(store, previous, "어머니는 어떤 지원을 받을 수 있어?",
                               repository=repository)
    assert result["follow_up"]["slot"] == "subject"
    assert result["profile_draft"] == MonitoringProfile().model_dump()
    assert result["confirmed_fields"] == [] and not result["can_save_profile"]
    assert result["candidates"] == []


def test_search_query_slot_cannot_absorb_a_new_persons_context(repository):
    repository.save(source_notice())
    store, previous = owned_conversation(repository)
    no_match = continue_question(store, previous, "문화 공연 지원을 찾아줘", repository=repository)
    assert no_match["follow_up"]["slot"] == "search_query"
    result = continue_question(store, no_match, "어머니 취업 지원도 알아봐 주세요",
                               repository=repository)
    assert result["topic"] == "employment"
    assert result["follow_up"]["slot"] == "subject"
    assert result["profile_draft"] == MonitoringProfile().model_dump()
    assert result["confirmed_fields"] == [] and not result["can_save_profile"]
    assert result["candidates"] == []
    other = continue_question(store, result, "어머니", repository=repository)
    state, _ = store.read(other["continuation"], existing.MEMBER["id"])
    assert state.subject == "other" and state.profile == MonitoringProfile()
    assert other["follow_up"]["slot"] == "region"


def test_followup_is_account_bound_and_never_accepts_another_accounts_continuation():
    store = DialogueStore()
    result = existing.ask(store)
    with pytest.raises(DialogueError) as error:
        continue_question(store, result, "그럼 서류는?", member={**existing.MEMBER, "id": "other"})
    assert error.value.status_code == 410


def test_active_turns_renew_idle_expiry_without_reads_extending_it():
    clock = [0]
    store = DialogueStore(ttl_seconds=30, clock=lambda: clock[0])
    token = store.create("member", DialogueState(topic="general"))
    clock[0] = 20
    state, version = store.read(token, "member")
    store.update(token, "member", state, version)
    clock[0] = 35
    assert store.read(token, "member")[0] == state
    clock[0] = 50
    with pytest.raises(DialogueError):
        store.read(token, "member")


def test_missing_documents_are_explicit_and_are_not_invented(repository):
    row = source_notice()
    row["source_json"]["fields"].pop("documents")
    repository.save(row)
    store, previous = owned_conversation(repository)
    result = continue_question(store, previous, "서류는?", repository=repository)
    assert "확인되지 않았어요" in result["answer"]
    assert "신분증" not in result["answer"]


def test_source_lookup_failure_keeps_confirmed_facts_and_returns_unavailable(repository):
    repository.save(source_notice())
    store, previous = owned_conversation(repository)

    def fail(revision):
        raise SQLAlchemyError("private source failure")

    repository.get_revision = fail
    result = continue_question(store, previous, "서류는?", repository=repository)
    assert result["catalog_status"] == "unavailable"
    assert result["profile_draft"] == previous["profile_draft"]
    assert "private source" not in result["answer"]


@pytest.mark.parametrize("withdrawn", [False, True])
def test_final_source_read_failure_keeps_facts_and_never_returns_withdrawn_notice(
        repository, monkeypatch, withdrawn):
    repository.save(source_notice())
    store, previous = owned_conversation(repository)
    compare = dialogue._compare

    def fail(revision):
        if withdrawn:
            return None
        raise SQLAlchemyError("private final source failure")

    def compare_then_fail(*args, **kwargs):
        result = compare(*args, **kwargs)
        assert result[1] is not None and result[2] == "ready"
        monkeypatch.setattr(repository, "get_revision", fail)
        return result

    monkeypatch.setattr(dialogue, "_compare", compare_then_fail)
    if withdrawn:
        with pytest.raises(DialogueError) as error:
            continue_question(store, previous, "서류는?", repository=repository)
        assert error.value.status_code == 404
        state, _ = store.read(previous["continuation"], existing.MEMBER["id"])
        assert state.profile.model_dump() == previous["profile_draft"]
    else:
        result = continue_question(store, previous, "서류는?", repository=repository)
        assert result["catalog_status"] == "unavailable" and result["selected_policy"] is None
        assert result["candidates"] == []
        assert result["profile_draft"] == previous["profile_draft"]
        assert "불러오지 못했어요" in result["answer"]
        assert "private" not in result["answer"]


def test_member_api_continues_beyond_the_previous_per_minute_turn_limit(client):
    result = api_tests.start(client)
    token = result["continuation"]
    for question in ["본인", "자가", "1920년 건축", *(["어떻게 신청해?"] * 65)]:
        response = client.post(api_tests.PREFIX, json={"continuation": token, "question": question})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["continuation"] == token
    assert result["profile_draft"]["building_year"] == 1920
    assert client.get("/v1/monitoring").json()["profile"] is None


def test_guest_api_continues_with_cookie_isolation_and_no_account_save(client):
    client.cookies.clear()
    first = client.post("/v1/assistant/chat/dialogue", json={"question": "집수리 지원"})
    token = first.json()["continuation"]
    result = client.post("/v1/assistant/chat/dialogue",
                         json={"question": "본인", "continuation": token})
    assert result.status_code == 200 and result.json()["can_save_profile"] is False
    client.cookies.clear()
    response = client.post("/v1/assistant/chat/dialogue",
                           json={"question": "자가", "continuation": token})
    assert response.status_code == 410
