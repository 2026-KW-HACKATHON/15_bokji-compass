"""Chat mode responds to the message, keeps context and never requires a slot form."""

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.modules.assistant import dialogue
from app.modules.assistant.dialogue_models import DialogueError, DialogueInput, DialogueStore
from tests import test_assistant_dialogue as existing
from tests import test_assistant_dialogue_api as api_tests
from tests.test_continuing_dialogue import source_notice

repository = existing.repository
stable_date = existing.stable_date
client = api_tests.client


def chat(store, text, previous=None, repository=None, member=existing.MEMBER):
    return dialogue.respond(repository, member, DialogueInput(
        mode="conversation", question=text,
        continuation=previous["continuation"] if previous else None), store)


@pytest.mark.parametrize("text,fragment", [
    ("테스트 대화야 아무말이나 보내봐", "잘 들려요"),
    ("안녕하세요", "안녕하세요"), ("고마워", "천만에요"),
    ("너는 누구야", "지원 공고"),
])
def test_social_turns_do_not_enter_support_questionnaire(text, fragment):
    store = DialogueStore()
    result = chat(store, text)
    assert fragment in result["answer"]
    assert result["follow_up"] is None and result["missing_fields"] == []
    assert result["catalog_status"] == "not_requested" and result["candidates"] == []
    assert not result["can_save_profile"] and result["confirmed_fields"] == []
    assert text not in repr(store._entries)


def test_chat_searches_immediately_and_remembers_region_and_leave_context(repository):
    repository.save(existing.general_record("student", "학생 생활비 지원금"))
    store = DialogueStore()
    first = chat(store, "나는 휴학한 학생이고 지원금과 관련된 정보가 필요해", repository=repository)
    assert first["candidates"] and first["follow_up"] is None
    second = chat(store, "서울 노원구에 살고 있어", first, repository)
    state, _ = store.read(second["continuation"], existing.MEMBER["id"])
    assert state.region == "서울특별시 노원구"
    assert "student_leave" in state.search_plan.contexts
    assert second["candidates"]
    third = chat(store, "고마워", second, repository)
    fourth = chat(store, "내가 말한 거 기억해?", third, repository)
    assert "휴학" in fourth["answer"] and "노원구" in fourth["answer"]
    assert fourth["continuation"] == first["continuation"]
    assert not state.confirmed and state.subject is None


def test_followup_after_social_turn_reads_the_same_notice_source(repository):
    repository.save(source_notice())
    store = DialogueStore()
    first = chat(store, "주택 리모델링 지원을 찾아줘", repository=repository)
    assert first["candidates"]
    thanks = chat(store, "고마워", first, repository)
    detail = chat(store, "첫 번째 공고 신청 서류는?", thanks, repository)
    assert "신분증" in detail["answer"]
    assert (detail["selected_policy"]["policy"]["revisionId"]
            == first["candidates"][0]["policy"]["revisionId"])
    assert detail["follow_up"] is None and detail["missing_fields"] == []


def test_ambiguous_notice_question_asks_in_chat_without_a_form(repository):
    repository.save(source_notice("one"), source_notice("two"))
    store = DialogueStore()
    first = chat(store, "리모델링 지원을 찾아줘", repository=repository)
    result = chat(store, "신청 서류는?", first, repository)
    assert "어느 공고" in result["answer"]
    assert result["follow_up"] is None and result["selected_policy"] is None


def test_chat_processes_support_goal_at_end_of_long_message(repository):
    repository.save(existing.general_record("student", "학생 생활비 지원금"))
    store = DialogueStore()
    text = ("상황을 설명하고 싶은데 아직 무엇부터 이야기할지 잘 모르겠어요. " * 8
            + "휴학 중인 학생이고 생활비 지원을 찾아줘")
    result = chat(store, text, repository=repository)
    assert len(text) > 200 and result["candidates"]
    state, _ = store.read(result["continuation"], existing.MEMBER["id"])
    assert "student_leave" in state.search_plan.contexts
    assert text not in repr(store._entries)


def test_new_topic_discards_prior_person_context(repository):
    store = DialogueStore()
    first = chat(store, "휴학생 지원금 찾아줘", repository=repository)
    result = chat(store, "다른 주제로 어머니 돌봄 지원이 궁금해", first, repository)
    state, _ = store.read(result["continuation"], existing.MEMBER["id"])
    assert "student_leave" not in state.search_plan.contexts
    assert not state.confirmed


def test_explicit_status_correction_removes_leave_context(repository):
    store = DialogueStore()
    first = chat(store, "휴학생 지원금 찾아줘", repository=repository)
    result = chat(store, "휴학생이 아니고 재학생인데 장학금을 찾아줘", first, repository)
    state, _ = store.read(result["continuation"], existing.MEMBER["id"])
    assert "student_leave" not in state.search_plan.contexts


def test_conversation_tokens_are_owner_bound_and_missing_catalog_is_recoverable():
    store = DialogueStore()
    first = chat(store, "지원금 찾아줘")
    assert first["catalog_status"] == "unavailable"
    with pytest.raises(DialogueError) as error:
        chat(store, "서울", first, member={"id": "someone-else"})
    assert error.value.status_code == 410
    thanks = chat(store, "고마워", first)
    assert thanks["catalog_status"] == "not_requested"


def test_conversation_continues_without_resending_mode():
    store = DialogueStore()
    first = chat(store, "테스트 대화야")
    result = dialogue.respond(None, existing.MEMBER, DialogueInput(
        question="안녕하세요", continuation=first["continuation"]), store)
    assert result["conversation_mode"] == "conversation" and result["follow_up"] is None


def test_guest_http_chat_is_cookie_bound_and_does_not_start_a_questionnaire(client):
    client.cookies.clear()
    prefix = "/v1/assistant/chat/dialogue"
    first = client.post(prefix, json={"mode": "conversation", "question": "테스트 대화야"})
    assert first.status_code == 200
    assert first.json()["follow_up"] is None
    second = client.post(prefix, json={"question": "안녕",
                                     "continuation": first.json()["continuation"]})
    assert second.status_code == 200 and "안녕하세요" in second.json()["answer"]
    assert second.headers["cache-control"] == "no-store"
    client.cookies.clear()
    rejected = client.post(prefix, json={"question": "안녕",
                                        "continuation": first.json()["continuation"]})
    assert rejected.status_code == 410


def test_withdrawn_notice_cannot_be_read_by_a_chat_followup(repository):
    row = source_notice()
    repository.save(row)
    store = DialogueStore()
    first = chat(store, "주택 리모델링 지원을 찾아줘", repository=repository)
    repository.records[row["revision_id"]]["review_status"] = "draft"
    with pytest.raises(DialogueError) as error:
        chat(store, "첫 번째 공고 신청 서류는?", first, repository)
    assert error.value.status_code == 404


def test_source_lookup_failure_preserves_chat_instead_of_leaking_database_errors(
        repository, monkeypatch):
    repository.save(source_notice())
    store = DialogueStore()
    first = chat(store, "주택 리모델링 지원을 찾아줘", repository=repository)

    def unavailable(_):
        raise SQLAlchemyError("private database connection")

    monkeypatch.setattr(repository, "get_revision", unavailable)
    result = chat(store, "신청 서류는?", first, repository)
    assert result["catalog_status"] == "unavailable"
    assert "private database" not in repr(result)
    assert result["continuation"] == first["continuation"]
