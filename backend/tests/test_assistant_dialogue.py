"""Follow-up answers stay temporary, scoped, unknown-aware and backed by public notices."""

from copy import deepcopy
from datetime import date, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    MetaData,
    String,
    Table,
    create_engine,
    insert,
)
from sqlalchemy.exc import SQLAlchemyError

from app.modules.assistant import dialogue
from app.modules.assistant.dialogue_models import (
    DialogueError,
    DialogueInput,
    DialogueState,
    DialogueStore,
)
from app.modules.monitoring import models
from app.modules.monitoring.models import MonitoringProfile
from app.modules.normalization.raw import normalize_record
from app.modules.regions.public import default_catalog

MEMBER = {"id": "account-a", "age": 26, "region": "서울", "gender": "female"}
TODAY = date(2026, 10, 7)


@pytest.fixture(autouse=True)
def stable_date(monkeypatch):
    monkeypatch.setattr(models, "seoul_today", lambda: TODAY)
    monkeypatch.setattr(dialogue, "seoul_today", lambda: TODAY)


def ask(store, question="리모델링 지원금을 받을 수 있어?", *, member=MEMBER, repository=None,
        profile=None, revision_id=None):
    return dialogue.respond(repository, member, DialogueInput(
        question=question, revision_id=revision_id), store, saved_profile=profile)


def reply(store, response, value, *, member=MEMBER, repository=None, profile=None, slot=None):
    return dialogue.respond(repository, member, DialogueInput(
        continuation=response["continuation"], answer={
            "slot": slot or response["follow_up"]["slot"], "value": value}), store,
        saved_profile=profile)


@pytest.mark.parametrize("question,topic", [
    ("리모델링 지원금을 받을 수 있나요?", "housing_repair"),
    ("우리 어머니가 수해 피해를 입었어", "disaster_recovery"),
    ("만약 실직하면?", "employment"), ("집에 누수가 생겼어 어떻게 해?", "housing_leak"),
    ("천장에서 물이 새요", "housing_leak"), ("안녕하세요", "general"),
])
def test_question_detects_topic_without_deriving_personal_facts(question, topic):
    store = DialogueStore()
    result = ask(store, question)
    assert result["topic"] == topic
    assert result["profile_draft"] == MonitoringProfile().model_dump()
    assert not result["confirmed_fields"] and not result["can_save_profile"]
    assert result["eligibility_decided"] is False
    state, _ = store.read(result["continuation"], MEMBER["id"])
    assert not any("question" in key or "transcript" in key for key in vars(state))
    assert question not in repr(store._entries)


def test_year_sentence_is_explicit_answer_without_eligibility_or_automatic_persistence():
    store = DialogueStore()
    result = ask(store)
    assert result["follow_up"]["slot"] == "subject"
    result = reply(store, result, "self")
    assert result["follow_up"]["slot"] == "housing_tenure"
    result = reply(store, result, "자가")
    result = reply(store, result, "1920년 건축")
    assert result["profile_draft"]["building_year"] == 1920
    assert result["follow_up"]["slot"] == "housing_type"
    assert "준공 연도만으로 지원 자격을 결정할 수는 없어요" in result["answer"]
    assert result["catalog_status"] == "unavailable"
    assert result["can_save_profile"] and result["eligibility_decided"] is False
    assert store.get_confirmed(MEMBER["id"], result["continuation"]) == {
        "housing_tenure": "owner", "building_year": 1920}


@pytest.mark.parametrize("value", ["1920년 1930년", "1800 미만", 2027, True, 1799,
                                  "1920년일 수도 있겠네요", "어머니 집은 1920년"])
def test_ambiguous_year_or_invalid_value_repeats_same_slot_without_fact(value):
    store = DialogueStore()
    result = reply(store, reply(store, ask(store), "self"), "owner")
    failed = reply(store, result, value)
    assert failed["follow_up"]["slot"] == "building_year"
    assert failed["profile_draft"]["building_year"] is None
    assert "building_year" not in failed["confirmed_fields"]


def test_null_unknowns_do_not_loop_and_still_report_missing_information():
    store = DialogueStore()
    result = reply(store, ask(store), "self")
    seen = []
    while result["follow_up"] is not None:
        slot = result["follow_up"]["slot"]
        assert slot not in seen
        seen.append(slot)
        result = reply(store, result, None)
    assert seen == ["housing_tenure", "building_year", "housing_type", "repair_needed"]
    assert {field["slot"] for field in result["missing_fields"]} == set(seen)
    assert result["confirmed_fields"] == [] and not result["can_save_profile"]


def test_saved_current_profile_avoids_repeat_questions_but_is_not_new_confirmation():
    store = DialogueStore()
    profile = MonitoringProfile(housing_tenure="owner", building_year=1990,
                                housing_type="detached", repair_needed=True)
    result = reply(store, ask(store, profile=profile), "self", profile=profile)
    assert result["follow_up"] is None
    assert result["profile_draft"] == profile.model_dump()
    assert result["confirmed_fields"] == [] and not result["can_save_profile"]
    assert profile.building_year == 1990


@pytest.mark.parametrize("subject", ["other", "hypothetical", None])
def test_nonself_context_uses_no_account_profile_and_cannot_be_saved(monkeypatch, subject):
    calls = []
    monkeypatch.setattr(dialogue.monitoring, "scan_candidates", lambda repo, member, profile, needs:
                        calls.append((member, profile.model_dump())) or [])
    store = DialogueStore()
    profile = MonitoringProfile(housing_tenure="owner", building_year=1990)
    result = reply(store, ask(store, profile=profile), subject,
                   repository=object(), profile=profile)
    assert result["follow_up"]["slot"] == "region"
    assert calls[-1] == ({}, MonitoringProfile().model_dump())
    result = reply(store, result, "부산", repository=object())
    assert calls[-1][0] == {"region": "부산광역시"}
    result = reply(store, result, "owner", repository=object())
    assert not result["can_save_profile"]
    with pytest.raises(DialogueError) as exc:
        store.get_confirmed(MEMBER["id"], result["continuation"])
    assert exc.value.status_code == 409


def test_region_is_temporary_and_does_not_enter_monitoring_patch():
    store = DialogueStore()
    member = {**MEMBER, "region": None}
    result = reply(store, ask(store, member=member), "self", member=member)
    assert result["follow_up"]["slot"] == "region"
    result = reply(store, result, "서울특별시 노원구", member=member)
    result = reply(store, result, "owner", member=member)
    assert store.get_confirmed(member["id"], result["continuation"]) == {"housing_tenure": "owner"}
    assert member["region"] is None and "region" not in result["profile_draft"]


def test_leak_practical_help_precedes_optional_support_and_no_damage_inference():
    store = DialogueStore()
    result = ask(store, "집에 누수가 생겼어 어떻게 해야 해?")
    assert result["follow_up"]["slot"] == "support_interest"
    assert "관리사무소" in result["practical_steps"][0]
    assert "물이 전기설비 주변에 있거나" in result["practical_steps"][1]
    assert result["source_links"][0]["url"].startswith("https://www.safekorea.go.kr/")
    assert result["profile_draft"]["disaster_damage"] is None
    result = reply(store, result, False)
    assert result["follow_up"] is None and result["catalog_status"] == "not_requested"
    assert not result["confirmed_fields"]


def test_leak_support_requires_separate_subject_and_facts_answers():
    store = DialogueStore()
    result = reply(store, ask(store, "누수"), True)
    assert result["follow_up"]["slot"] == "subject"
    assert result["profile_draft"]["repair_needed"] is None
    result = reply(store, result, "self")
    assert result["follow_up"]["slot"] == "housing_tenure"


def test_skipped_leak_support_does_not_claim_a_catalog_scan():
    store = DialogueStore()
    result = reply(store, ask(store, "누수"), None)
    assert result["follow_up"] is None and result["catalog_status"] == "not_requested"
    assert "공고를 살펴봤어요" not in result["answer"]


def test_mixed_leak_and_inundation_retains_immediate_practical_safety_without_damage_fact():
    result = ask(DialogueStore(), "집에 누수가 생겨 침수됐어 어떻게 해?")
    assert result["topic"] == "disaster_recovery"
    assert result["practical_steps"]
    assert "전기설비" in result["practical_steps"][1]
    assert result["profile_draft"]["disaster_damage"] is None


def test_disaster_date_asked_only_after_confirmed_damage_and_keeps_future_unknown():
    store = DialogueStore()
    result = reply(store, ask(store, "어머니 수해 피해"), "self")
    assert result["follow_up"]["slot"] == "disaster_damage"
    result = reply(store, result, True)
    result = reply(store, result, "flood")
    invalid = reply(store, result, "2026-10-08")
    assert invalid["follow_up"]["slot"] == "disaster_occurred_on"
    assert invalid["profile_draft"]["disaster_occurred_on"] is None
    result = reply(store, invalid, "2026-10-01")
    assert result["follow_up"] is None
    assert result["profile_draft"]["disaster_occurred_on"] == "2026-10-01"


def test_declined_disaster_does_not_request_damage_details():
    store = DialogueStore()
    result = reply(store, reply(store, ask(store, "수해 지원"), "self"), False)
    assert result["follow_up"] is None
    assert result["profile_draft"]["disaster_damage"] is False


def test_token_account_expiry_capacity_and_reset_are_safe():
    now = [0]
    store = DialogueStore(ttl_seconds=30, capacity=2, clock=lambda: now[0])
    first = store.create("one", DialogueState(topic="housing_repair"))
    with pytest.raises(DialogueError) as exc:
        store.read(first, "two")
    assert exc.value.status_code == 410
    second = store.create("two", DialogueState(topic="employment"))
    third = store.create("three", DialogueState(topic="general"))
    with pytest.raises(DialogueError):
        store.read(first, "one")
    assert store.read(second, "two")[0].topic == "employment"
    now[0] = 30
    with pytest.raises(DialogueError):
        store.read(third, "three")
    token = store.create("one", DialogueState(topic="general"))
    store.discard_account("one")
    with pytest.raises(DialogueError):
        store.read(token, "one")


def test_periodic_prune_removes_expired_idle_facts_without_new_user_request():
    now = [0]
    store = DialogueStore(ttl_seconds=30, clock=lambda: now[0])
    store.create("one", DialogueState(topic="housing_repair",
                                      profile=MonitoringProfile(building_year=1920)))
    now[0] = 10
    active = store.create("two", DialogueState(topic="employment"))
    now[0] = 30
    assert store.prune_expired() == 1
    assert len(store._entries) == 1
    assert store.read(active, "two")[0].topic == "employment"


def test_parallel_answer_version_does_not_overwrite_first_answer():
    store = DialogueStore()
    token = store.create("one", DialogueState(topic="housing_repair"))
    left, lv = store.read(token, "one")
    right, rv = store.read(token, "one")
    left.subject = "self"
    right.subject = "other"
    store.update(token, "one", left, lv)
    with pytest.raises(DialogueError) as exc:
        store.update(token, "one", right, rv)
    assert exc.value.status_code == 409
    assert store.read(token, "one")[0].subject == "self"


def test_successful_save_consumes_only_saved_patch_not_new_answer():
    store = DialogueStore()
    result = reply(store, reply(store, ask(store), "self"), "owner")
    patch = store.get_confirmed(MEMBER["id"], result["continuation"])
    result = reply(store, result, "1920년 건축")
    store.consume_confirmed(MEMBER["id"], result["continuation"], expected=patch)
    assert store.get_confirmed(MEMBER["id"], result["continuation"]) == {"building_year": 1920}


def test_atomic_save_keeps_failure_retryable_and_duplicate_save_is_rejected():
    store = DialogueStore()
    result = reply(store, reply(store, ask(store), "self"), "owner")

    def fail(_patch):
        raise RuntimeError("storage unavailable")

    with pytest.raises(RuntimeError):
        store.save_confirmed(MEMBER["id"], result["continuation"], fail)
    expected = {"housing_tenure": "owner"}
    assert store.get_confirmed(MEMBER["id"], result["continuation"]) == expected
    saved = store.save_confirmed(MEMBER["id"], result["continuation"], lambda patch: patch)
    assert saved == expected
    with pytest.raises(DialogueError) as exc:
        store.save_confirmed(MEMBER["id"], result["continuation"], lambda _patch: pytest.fail())
    assert exc.value.status_code == 409


def test_atomic_save_expiring_during_callback_is_still_successful_and_clear_erases_all():
    now = [0]
    store = DialogueStore(ttl_seconds=1, clock=lambda: now[0])
    result = reply(store, reply(store, ask(store), "self"), "owner")

    def save(_patch):
        now[0] = 2
        return {"saved": True}

    assert store.save_confirmed(MEMBER["id"], result["continuation"], save) == {"saved": True}
    assert not store._entries
    ask(store)
    store.clear()
    assert not store._entries


@pytest.mark.parametrize("data", [
    {}, {"question": " "}, {"question": "집수리", "account_id": "other"},
    {"question": "집수리", "profile": {"housing_tenure": "owner"}},
    {"question": "집수리", "continuation": "a" * 43},
    {"answer": {"slot": "housing_tenure", "value": "owner"}},
    {"continuation": "a" * 43, "answer": {"slot": "unknown", "value": True}},
    {"continuation": "a" * 43, "answer": {"slot": "building_year", "value": 1920.0}},
])
def test_input_rejects_forged_context_and_unsupported_values(data):
    with pytest.raises(ValidationError):
        DialogueInput.model_validate(data)


def test_out_of_order_answer_cannot_set_unasked_profile_fields():
    store = DialogueStore()
    result = ask(store)
    with pytest.raises(DialogueError) as exc:
        reply(store, result, "owner", slot="housing_tenure")
    assert exc.value.status_code == 409


def make_record(key, *, owner=True, published=True, enabled=True):
    source = normalize_record({"document_id": key, "title": "테스트 집수리 지원",
                               "text": "집수리 안내. 본인 소유 주택만 신청.",
                               "application_period": "상시",
                               "source_url": "https://www.nowon.kr/notice/" + key})
    condition = {"condition_id": "ownership", "field_key": "home_ownership",
                 "source_field_key": "주택 소유 여부", "subject": "applicant", "state_code": 1,
                 "operator": "EQ", "value": {"kind": "BOOLEAN", "boolean": owner},
                 "unit": None, "reference_basis": None, "role": "eligibility", "group_id": None,
                 "source_field": "text", "evidence_quote": "본인 소유 주택만 신청",
                 "unknown_reason": None, "review_note": ""}
    return {"revision_id": str(uuid4()), "policy_key": source.policy_key,
            "created_at": datetime(2026, 10, 7), "source_json": source.model_dump(),
            "canonical_json": {"policy_key": source.policy_key,
                               "region_snapshot_version": default_catalog().version,
                               "conditions": [condition],
                               "logic": {"op": "condition", "condition_id": "ownership",
                                         "children": [], "reason": None},
                               "coverage": "complete", "unresolved": []},
            "review_status": "published" if published else "draft", "matching_enabled": enabled,
            "draft_json": {}, "title": source.title, "category": "주거"}


@pytest.fixture
def repository(tmp_path):
    engine = create_engine("sqlite:///" + str(tmp_path / "dialogue.sqlite3"))
    metadata = MetaData()
    documents = Table("condition_documents", metadata,
                      Column("revision_id", String, primary_key=True), Column("policy_key", String),
                      Column("created_at", DateTime), Column("source_json", JSON),
                      Column("canonical_json", JSON), Column("review_status", String),
                      Column("matching_enabled", Boolean))
    details = Table("policy_revision_details", metadata,
                    Column("revision_id", String, primary_key=True), Column("draft_json", JSON),
                    Column("title", String), Column("category", String))
    metadata.create_all(engine)
    records = {}

    def save(*rows):
        with engine.begin() as connection:
            for table in (documents, details):
                connection.execute(insert(table), [{column.name: row[column.name]
                                                   for column in table.columns} for row in rows])
        records.update({row["revision_id"]: deepcopy(row) for row in rows})

    def get_revision(revision_id):
        row = records.get(revision_id)
        return deepcopy(row) if row and row["review_status"] == "published" else None

    yield SimpleNamespace(engine=engine, tables={"condition_documents": documents,
                                                "policy_revision_details": details},
                          save=save, records=records, get_revision=get_revision)
    engine.dispose()


def test_interest_alone_finds_public_candidates_and_explicit_owner_recompares(repository):
    owner = make_record("owner")
    nonowner = make_record("nonowner", owner=False)
    draft = make_record("draft", published=False)
    repository.save(owner, nonowner, draft)
    store = DialogueStore()
    result = reply(store, ask(store, repository=repository), "self", repository=repository)
    assert len(result["candidates"]) == 2
    assert all(row["status"] == "needs_review" for row in result["candidates"])
    result = reply(store, result, "owner", repository=repository)
    assert [row["policy_id"] for row in result["candidates"]] == [owner["policy_key"]]
    assert result["eligibility_decided"] is False
    assert result["candidates"][0]["eligibility_decided"] is False


def test_selected_public_revision_recompares_and_withdrawal_rejects(repository, monkeypatch):
    notice = make_record("selected", owner=False)
    repository.save(notice)
    store = DialogueStore()
    result = ask(store, "지원 받을 수 있어?", repository=repository,
                 revision_id=notice["revision_id"])
    assert result["topic"] == "housing_repair"
    result = reply(store, result, "self", repository=repository)
    result = reply(store, result, "owner", repository=repository)
    assert result["selected_policy"]["comparison"]["status"] == "not_matched"
    assert "맞지 않는 조건" in result["answer"]

    def withdraw(*_args, **_kwargs):
        repository.records[notice["revision_id"]]["review_status"] = "draft"
        return []

    monkeypatch.setattr(dialogue.monitoring, "scan_candidates", withdraw)
    with pytest.raises(DialogueError) as exc:
        reply(store, result, "1920년 건축", repository=repository)
    assert exc.value.status_code == 404


def test_unpublished_selected_revision_never_uses_source(repository):
    notice = make_record("private", published=False)
    repository.save(notice)
    with pytest.raises(DialogueError) as exc:
        ask(DialogueStore(), repository=repository, revision_id=notice["revision_id"])
    assert exc.value.status_code == 404


def test_initial_selected_source_failure_still_offers_followup_without_source_claim():
    def unavailable(_revision):
        raise SQLAlchemyError("private database error must not be returned")

    result = ask(DialogueStore(), repository=SimpleNamespace(get_revision=unavailable),
                 revision_id=str(uuid4()))
    assert result["catalog_status"] == "unavailable"
    assert result["follow_up"]["slot"] == "subject"
    assert "private database" not in str(result)


def test_incomplete_catalog_does_not_erase_temporary_answers(repository):
    notice = make_record("broken")
    notice["canonical_json"]["conditions"][0]["evidence_quote"] = "원문에 없는 문장"
    repository.save(notice)
    store = DialogueStore()
    result = reply(store, ask(store, repository=repository), "self", repository=repository)
    result = reply(store, result, "owner", repository=repository)
    assert result["catalog_status"] == "unavailable" and not result["candidates"]
    assert result["profile_draft"]["housing_tenure"] == "owner"
