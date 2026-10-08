"""Chat turns keep derived search context and public references without a slot wizard."""

import re
from dataclasses import replace

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.modules.assistant.dialogue_followup import (
    DETAIL_QUESTION,
    OTHER_SUBJECT,
    REFER_BACK,
    select_followup_revision,
    source_followup_answer,
)
from app.modules.assistant.dialogue_models import DialogueError, DialogueState
from app.modules.assistant.dialogue_search import prepare_search


def _goal(plan):
    return plan is not None and bool(plan.concepts or plan.institutions)


def _merge(previous, incoming, text=""):
    if previous is None:
        return incoming
    if incoming is None:
        return previous
    # A newly stated student status replaces the earlier temporary status.
    status_changed = bool(re.search(r"휴학|재학|복학|졸업", text))
    return replace(
        incoming,
        institutions=incoming.institutions or previous.institutions,
        audiences=tuple(dict.fromkeys((*previous.audiences, *incoming.audiences))),
        contexts=(incoming.contexts if status_changed else
                  tuple(dict.fromkeys((*previous.contexts, *incoming.contexts)))),
    )


def _prepare(text, repository):
    # Interpret the complete chat input in bounded search-sized pieces. Persist only
    # derived terms, never the raw chat input or its fragments.
    pieces = []
    for sentence in re.split(r"[.!?\n]+", text):
        current = ""
        for word in sentence.split():
            if len(current) + len(word) + 1 > 200 and current:
                pieces.append(current)
                current = ""
            current = (current + " " + word[:200]).strip()
        if current:
            pieces.append(current)
    plans = []
    for piece in pieces:
        try:
            plan = prepare_search(piece, repository)
        except SQLAlchemyError:
            plan = prepare_search(piece)
        if plan is not None:
            plans.append(plan)
    if not plans:
        return None
    # Keep the strongest intent, so introductory sentences do not obscure a request.
    base = next((plan for plan in plans if plan.institutions),
                next((plan for plan in plans if plan.concepts), plans[0]))
    combined = replace(base, **{
        field: tuple(dict.fromkeys(value for plan in plans for value in getattr(plan, field)))[:40]
        for field in ("institutions", "concepts", "audiences", "contexts",
                      "exclusions", "background_concepts")
    })
    if not _goal(combined):
        from app.modules.assistant.dialogue import classify_topic

        topic = classify_topic(text)
        concept = {"housing_repair": "housing", "housing_leak": "housing",
                   "employment": "employment", "disaster_recovery": "disaster"}.get(topic)
        if concept:
            combined = replace(combined, concepts=(concept,))
    return combined


def _region(text):
    from app.modules.assistant.dialogue import _known_region

    exact = _known_region(text)
    if exact:
        return exact
    # Resolve only named administrative areas, even when followed by Korean particles.
    for match in re.finditer(
            r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)"
            r"(?:특별시|광역시|특별자치시|특별자치도|도|시)?(?:\s*[가-힣]{1,8}?(?:구|군|시))?",
            text):
        value = _known_region(match[0])
        if value:
            return value
    # Standalone district/neighbourhood answers are also valid follow-up turns.
    for match in re.finditer(r"[가-힣]{1,8}?(?:구|군|동)(?=에|에서|이야|입니다|살|\s|$)", text):
        value = _known_region(match[0])
        if value:
            return value
    return None


def _social(text, state):
    if re.fullmatch(r"(?:안녕(?:하세요|하십니까)?|하이|hello|hi)[.!?\s~]*", text, re.I):
        return ("안녕하세요! 편하게 이야기해 주세요. "
                "궁금한 지원 제도나 공고가 있으면 함께 찾아볼게요.")
    if re.search(r"테스트\s*대화|아무\s*말.*(?:보내|해)|대화\s*테스트", text):
        return ("잘 들려요! 이렇게 메시지를 주고받으면서 대화를 이어갈 수 있어요. "
                "편하게 이야기해 주세요.")
    if re.fullmatch(
            r"(?:고마워(?:요)?|감사(?:합니다|해요)?|땡큐|좋아(?:요)?|알겠어(?:요)?)[.!?\s~]*",
            text):
        return "천만에요! 더 궁금한 점이 생기면 이어서 말씀해 주세요."
    if re.search(r"기억.*(?:해|하|나)|내가.*(?:말했|얘기했)|무슨.*(?:이야기|대화).*했", text):
        plan = state.search_plan
        details = []
        if plan and "student_leave" in plan.contexts:
            details.append("휴학 상황을 참고해 지원 공고를 알아보고 있었어요")
        elif _goal(plan):
            details.append("앞서 요청한 지원 공고를 함께 알아보고 있었어요")
        if state.region:
            details.append(f"지역은 {state.region}으로 알려주셨어요")
        return ". ".join(details) + ". 이어서 궁금한 점을 말씀해 주세요." if details else (
            "아직 지원 분야나 지역을 알려주진 않으셨어요. 지금부터 편하게 이야기해 주세요.")
    if re.search(r"(?:뭘|무엇을|어떤걸|어떤\s*걸).*할\s*수|사용\s*방법|너는\s*누구", text):
        return ("지원 공고를 찾아보고, 공고의 신청 방법·서류·기간을 함께 확인할 수 있어요. "
                "‘휴학 중인데 생활비 지원이 궁금해’처럼 지금 필요한 도움을 말해 주세요.")
    return None


def respond_conversation(repository, member, data, store, *, feedback=()):
    from app.modules.assistant import dialogue

    if data.question is None:
        raise DialogueError(409, "메시지로 대화를 이어가 주세요.")
    owner, text = member["id"], data.question
    if data.continuation:
        state, version = store.read(data.continuation, owner)
        token = data.continuation
    else:
        state = DialogueState(topic="general", revision_id=data.revision_id)
        token = store.create(owner, state)
        _, version = store.read(token, owner)
    state.conversational = True
    # Conversation is temporary context, not consent to turn messages into profile facts.
    state.subject, state.confirmed = None, set()
    candidates, selected, status = [], None, "not_requested"
    answer = _social(text, state)
    if answer is None:
        if re.search(r"다른\s*주제|새\s*주제|처음부터", text) or OTHER_SUBJECT.search(text):
            state.search_plan = None
            state.region = None
            state.revision_id, state.candidate_revisions = None, []
        region = _region(text)
        if region:
            state.region = region
        detail = DETAIL_QUESTION.search(text) and (state.revision_id or state.candidate_revisions)
        if detail:
            if repository is None:
                status = "unavailable"
            else:
                try:
                    revision = select_followup_revision(repository, state, text)
                except SQLAlchemyError:
                    revision, status = None, "unavailable"
                if revision:
                    state.revision_id = revision
                    try:
                        record = dialogue._read_revision(repository, revision)
                        selected = dialogue._selected(record, {}, state)
                        answer = source_followup_answer(record, text)
                        dialogue._read_revision(repository, revision)
                        status = "ready"
                    except dialogue.DialogueError:
                        raise
                    except (SQLAlchemyError, ValidationError, ValueError, KeyError, TypeError):
                        status = "unavailable"
                else:
                    answer = ("어느 공고를 더 알아볼까요? 제목이나 ‘첫 번째 공고’처럼 "
                              "순서를 말해 주시면 공식 안내를 확인해 드릴게요.")
        else:
            plan = _prepare(text, repository)
            new_goal = _goal(plan)
            if new_goal:
                state.search_plan = _merge(state.search_plan, plan, text)
                state.revision_id, state.candidate_revisions = None, []
            elif plan and (plan.audiences or plan.contexts):
                previous = state.search_plan
                state.search_plan = (_merge(plan, previous, text) if _goal(previous) else
                                     _merge(previous, plan, text))
                if previous and re.search(r"휴학|재학|복학|졸업", text):
                    state.search_plan = replace(state.search_plan, contexts=plan.contexts)
            lookup = (new_goal or region or state.revision_id or REFER_BACK.search(text)
                      or text in {"응", "네", "찾아줘", "알려줘"})
            if lookup and (_goal(state.search_plan) or state.revision_id):
                candidates, selected, status = dialogue._compare(
                    repository, state, {}, feedback)
                if status == "ready":
                    state.candidate_revisions = [item["policy"]["revisionId"]
                                                 for item in candidates]
                    if candidates or selected:
                        answer = (f"{state.region} 지역을 참고해서 " if state.region else "") + (
                            "관련 공고를 찾아봤어요. "
                            "아래 공고의 지원 내용과 신청 기간을 확인해 보세요.")
                        if "student_leave" in state.search_plan.contexts:
                            answer += (" 휴학생 신청 가능 여부는 공고마다 달라서 "
                                       "제외 조건도 함께 확인해야 해요.")
                        answer += " 더 궁금한 공고가 있으면 제목이나 순서를 말해 주세요."
                        if not state.region:
                            answer += " 거주 지역도 알려주시면 지역 지원을 더 살펴볼게요."
                    else:
                        answer = ("지금 등록된 공고에서는 관련 후보를 찾지 못했어요. "
                                  "필요한 지원의 종류나 지역을 조금 더 알려주실 수 있을까요?")
            if answer is None and status != "unavailable":
                if region:
                    answer = f"{region} 지역이군요. 어떤 도움이 필요한지 편하게 말씀해 주세요."
                elif plan and "student_leave" in plan.contexts:
                    answer = "휴학 중이시군요. 생활비, 주거비, 취업 준비 중 어떤 지원이 궁금하세요?"
                elif state.search_plan and _goal(state.search_plan):
                    answer = ("앞서 찾던 공고에 대해 계속 이야기할 수 있어요. "
                              "신청 방법이나 서류가 궁금하면 "
                              "공고 제목 또는 순서를 함께 말해 주세요.")
                else:
                    answer = ("말씀해 주세요. 지원 제도나 공고가 궁금하시면 "
                              "필요한 도움을 알려주세요. "
                              "대화하면서 함께 찾아볼게요.")
    if status == "unavailable":
        answer = ("지금은 공고를 불러오지 못했어요. 앞서 말씀하신 내용은 유지되니 "
                  "잠시 후 다시 찾아달라고 말씀해 주세요.")
        candidates, selected = [], None
    store.update(token, owner, state, version)
    return {
        "answer": answer, "topic": state.topic, "eligibility_decided": False,
        "conversation_mode": "conversation", "follow_up": None, "answer_accepted": None,
        "missing_fields": [], "continuation": token, "profile_draft": state.profile.model_dump(),
        "confirmed_fields": [], "can_save_profile": False, "candidates": candidates,
        "candidate_count": len(candidates), "selected_policy": selected, "catalog_status": status,
        "practical_steps": [], "source_links": [],
        "session_notice": "대화는 마지막 입력 후 30분 동안 임시로 이어져요.",
    }
