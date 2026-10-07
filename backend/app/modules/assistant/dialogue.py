"""Deterministic follow-up questions turn explicit answers into temporary comparison facts."""

import re
from copy import deepcopy

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.contracts.conditions import CanonicalPolicy
from app.contracts.parsing import SourcePolicy
from app.modules.assistant.dialogue_models import (
    DialogueError,
    DialogueInput,
    DialogueState,
    DialogueStore,
)
from app.modules.matching import public as matching
from app.modules.monitoring import public as monitoring
from app.modules.monitoring.models import MonitoringProfile, seoul_today
from app.modules.presentation.public import policy_signals
from app.modules.regions.public import default_catalog
from app.modules.storage.catalog import card


def _options(*items):
    return [{"value": value, "label": label} for value, label in items]


QUESTIONS = {
    "topic": ("어떤 도움이 필요한가요?", "select", _options(
        ("housing_repair", "집수리·리모델링 지원"), ("employment", "취업·일자리 지원"),
        ("disaster_recovery", "재난 피해 지원"), ("housing_leak", "집에 누수가 생겼어요"))),
    "subject": ("이번 안내는 누구의 어떤 상황에 관한 것인가요?", "select", _options(
        ("self", "본인의 현재 상황"), ("other", "가족 등 다른 사람의 상황"),
        ("hypothetical", "가정하거나 관심이 있어 알아보는 중"))),
    "support_interest": ("안전하게 상황을 살핀 뒤 수리비 지원도 함께 찾아볼까요?", "select",
                         _options((True, "지원도 찾아주세요"), (False, "대처 방법만 볼게요"))),
    "region": ("지원받을 분이 거주하는 지역을 알려주세요. 예: 서울특별시 노원구", "text", []),
    "housing_tenure": ("지원받을 분이 현재 거주하는 주택을 직접 소유하고 있나요?", "select",
                       _options(("owner", "본인 소유 주택"), ("renter", "임차 주택(전세·월세)"),
                                ("other", "그 외(가족 소유 등)"))),
    "building_year": ("해당 주택은 몇 년에 지어졌나요? 예: 1920년 건축", "number", []),
    "housing_type": ("어떤 유형의 주택인가요?", "select", _options(
        ("detached", "단독주택"), ("multi_family", "다세대·다가구주택"),
        ("apartment", "아파트"), ("other", "그 외"))),
    "repair_needed": ("현재 실제로 수리하거나 개선할 부분이 있나요?", "select",
                      _options((True, "있어요"), (False, "없어요"))),
    "occupation": ("지원받을 분은 현재 어떤 일을 하고 있나요?", "select", _options(
        *((value, value) for value in ["학생", "취업 준비 중", "직장인",
                                       "자영업자", "은퇴 후", "기타"]))),
    "job_seeking": ("현재 새 일자리를 찾거나 취업을 준비하고 있나요?", "select",
                    _options((True, "네"), (False, "아니요"))),
    "disaster_damage": ("지원받을 분이 실제로 재난 피해를 입었나요?", "select",
                        _options((True, "피해를 입었어요"), (False, "피해를 입지 않았어요"))),
    "disaster_type": ("어떤 재난으로 피해를 입었나요?", "select", _options(
        ("flood", "수해·침수"), ("fire", "화재"), ("earthquake", "지진"), ("other", "그 외"))),
    "disaster_occurred_on": ("피해가 발생한 날짜를 알려주세요. 예: 2026-10-01", "date", []),
}
LABELS = {
    "subject": "안내 대상", "region": "거주 지역", "housing_tenure": "주택 소유·거주 형태",
    "building_year": "준공 연도", "housing_type": "주택 유형", "repair_needed": "실제 수리 필요",
    "occupation": "현재 직업", "job_seeking": "구직·취업 준비 여부",
    "disaster_damage": "실제 피해 여부", "disaster_type": "피해 유형",
    "disaster_occurred_on": "피해 발생일", "topic": "도움이 필요한 분야",
    "support_interest": "수리 지원 탐색 의사",
}
TOPIC_SLOTS = {
    "housing_repair": ["housing_tenure", "building_year", "housing_type", "repair_needed"],
    "housing_leak": ["housing_tenure", "building_year", "housing_type", "repair_needed"],
    "employment": ["occupation", "job_seeking"],
    "disaster_recovery": ["disaster_damage", "disaster_type", "disaster_occurred_on"],
}
UNKNOWN_ANSWERS = {"", "모름", "몰라", "몰라요", "모르겠어요", "잘 모르겠어요", "건너뛰기"}
BOOL_ANSWERS = {
    "네": True, "예": True, "맞아요": True, "있어요": True, "찾아주세요": True,
    "아니요": False, "아니오": False, "없어요": False, "아닙니다": False,
}
ALIASES = {
    "subject": {"본인": "self", "저요": "self", "내 상황": "self", "어머니": "other",
                "가족": "other", "다른 사람": "other", "가정": "hypothetical"},
    "housing_tenure": {"자가": "owner", "본인 소유": "owner", "제 집": "owner",
                       "전세": "renter", "월세": "renter", "임차": "renter", "가족 소유": "other"},
    "housing_type": {"단독주택": "detached", "다세대": "multi_family", "다가구": "multi_family",
                     "아파트": "apartment", "기타": "other"},
    "disaster_type": {"수해": "flood", "침수": "flood", "화재": "fire", "지진": "earthquake"},
}
LEAK_GUIDANCE = {
    "steps": [
        "안전한 곳에서 누수 위치·시작 시각·피해 범위를 확인해 기록하고, 관리사무소·임대인 "
        "또는 수리 전문가에게 점검을 요청하세요. 원인과 비용 부담은 점검 후 확인이 필요해요.",
        "물이 전기설비 주변에 있거나 침수가 진행되면 젖은 전기기기·설비에 접근하지 말고 "
        "안전한 곳으로 이동하세요. 긴급 위험에는 119로 도움을 요청하세요.",
    ],
    "links": [{"label": "국민안전24 침수 행동요령",
               "url": "https://www.safekorea.go.kr/safekorea-kor/acts/nacts/action-guide.do?"
                      "actsHeaderTitle=%EC%B9%A8%EC%88%98&category=inundation&menuSn=4"}],
}
LEAK_PATTERN = re.compile(r"누수|물이\s*새|물\s*새는|물\s*샌다|물이\s*샌")


def classify_topic(question: str) -> str:
    """Language selects an exploration topic, never ownership, employment or damage facts."""
    if re.search(r"수해|침수|홍수|태풍|재난|재해|화재|지진", question):
        return "disaster_recovery"
    if LEAK_PATTERN.search(question):
        return "housing_leak"
    if re.search(r"리모델링|집\s*수리|주택\s*수리|노후\s*주택|수선|주택\s*개보수", question):
        return "housing_repair"
    if re.search(r"취업|구직|일자리|직업\s*훈련|실직|재취업|이직", question):
        return "employment"
    return "general"


def _known_region(value):
    if not isinstance(value, str) or not value.strip() or value == "전국":
        return None
    name = matching.REGION_NAMES.get(value.strip(), value.strip())
    found = default_catalog().resolve(name).region
    return found.name if found is not None else None


def _slots(state: DialogueState, member: dict) -> list[str]:
    if state.topic == "general":
        return ["topic"]
    if state.topic == "housing_leak" and state.support_interest is not True:
        return [] if "support_interest" in state.answered else ["support_interest"]
    result = ["subject"]
    if not state.region and not (state.subject == "self" and _known_region(member.get("region"))):
        result.append("region")
    result.extend(TOPIC_SLOTS[state.topic])
    if state.profile.disaster_damage is not True:
        result = [slot for slot in result if slot not in {"disaster_type", "disaster_occurred_on"}]
    return result


def _missing(state, member):
    return [slot for slot in _slots(state, member) if (
        state.subject is None if slot == "subject" else
        getattr(state.profile, slot) is None if slot in MonitoringProfile.model_fields else True)]


def _next(state, member):
    return next((slot for slot in _missing(state, member) if slot not in state.answered), None)


def _question(slot):
    if slot is None:
        return None
    question, input_type, options = QUESTIONS[slot]
    return {"slot": slot, "question": question, "input_type": input_type,
            "options": deepcopy(options), "allow_unknown": True}


def _parse(slot, value):
    if value is None or isinstance(value, str) and value.strip() in UNKNOWN_ANSWERS:
        return None
    if isinstance(value, str):
        value = value.strip()
    if slot == "building_year":
        if isinstance(value, str):
            found = re.fullmatch(r"(?:준공\s*|건축\s*)?(\d{4})\s*(?:년\s*)?(?:건축|준공)?", value)
            if found:
                value = int(found[1])
        return MonitoringProfile(building_year=value).building_year
    if slot == "region":
        result = _known_region(value)
        if result is None:
            raise ValueError("시·도와 시·군·구 이름을 함께 입력해 주세요. 예: 서울특별시 노원구")
        return result
    if slot == "disaster_occurred_on":
        return MonitoringProfile(disaster_occurred_on=value).disaster_occurred_on
    options = QUESTIONS[slot][2]
    for option in options:
        if type(value) is type(option["value"]) and value == option["value"]:
            return value
        if isinstance(value, str) and value == option["label"]:
            return option["value"]
    if isinstance(value, str):
        if value in ALIASES.get(slot, {}):
            return ALIASES[slot][value]
        if options and isinstance(options[0]["value"], bool) and value in BOOL_ANSWERS:
            return BOOL_ANSWERS[value]
    raise ValueError("질문 아래 항목을 선택하거나 같은 뜻의 짧은 답을 입력해 주세요.")


def _apply(state, slot, value, saved_profile):
    state.answered.add(slot)
    if slot == "subject":
        state.subject = value
        if value == "self" and saved_profile is not None:
            state.profile = saved_profile.model_copy(deep=True)
    elif slot in {"topic", "support_interest", "region"}:
        if value is not None:
            setattr(state, slot, value)
    elif value is not None:
        values = state.profile.model_dump()
        values[slot] = value
        state.profile = MonitoringProfile.model_validate(values)
        state.confirmed.add(slot)


def _need(state):
    if state.topic in {"housing_repair", "housing_leak"}:
        identifier, title = "housing_repair", "문의한 주거 개선 지원 찾기"
        keywords = [*monitoring.HOUSING_KEYWORDS, "리모델링", "주택 수리", "수리비"]
    elif state.topic == "employment":
        identifier, title = "employment_support", "문의한 취업 지원 찾기"
        keywords = monitoring.EMPLOYMENT_KEYWORDS.copy()
    else:
        identifier, title = "disaster_recovery", "문의한 재난 지원 살펴보기"
        keywords = monitoring.DISASTER_WATCH_KEYWORDS.copy()
    return {"id": identifier, "title": title, "keywords": keywords,
            "reason": ("질문의 관심 분야를 바탕으로 공고를 탐색하며, "
                       "개인의 피해나 자격을 추정하지 않아요."),
            "questions": []}


def _read_revision(repository, revision_id):
    record = repository.get_revision(revision_id)
    if record is None or record.get("review_status") != "published":
        raise DialogueError(404, "공개된 공고를 찾을 수 없어요.")
    return record


def _selected(record, member, state):
    facts = monitoring.monitoring_facts(member, state.profile)
    comparison = matching.compare_policy(record, facts)
    canonical = CanonicalPolicy.model_validate(record["canonical_json"])
    policy = card(record)
    policy.update(policy_signals(record))
    missing_targets = matching.missing_target_requirements(
        canonical, SourcePolicy.model_validate(record["source_json"]))
    if missing_targets and comparison["status"] == "potential_match":
        comparison["status"] = "needs_review"
        comparison["notes"].append("원문의 추가 지원대상 조건을 확인해야 해요.")
    return {"policy": policy, "comparison": comparison,
            "schedule_status": monitoring._schedule(policy, canonical, seoul_today(), comparison)}


def _compare(repository, state, member):
    requested = state.topic != "general" and "subject" in state.answered
    if state.topic == "housing_leak" and state.support_interest is not True:
        requested = False
    if not requested:
        return [], None, "not_requested"
    if repository is None:
        return [], None, "unavailable"
    context = dict(member) if state.subject == "self" else {}
    if state.region is not None:
        context["region"] = state.region
    try:
        selected = (_selected(_read_revision(repository, state.revision_id), context, state)
                    if state.revision_id else None)
        candidates = monitoring.scan_candidates(repository, context, state.profile, [_need(state)])
        # Do not expose a revision withdrawn while its conditions were being evaluated.
        if state.revision_id:
            _read_revision(repository, state.revision_id)
        return candidates, selected, "ready"
    except DialogueError:
        raise
    except (SQLAlchemyError, ValidationError, ValueError, KeyError, TypeError,
            monitoring.MonitoringScanIncomplete):
        return [], None, "unavailable"


def _message(state, pending, candidates, catalog_status, *, acknowledged=None, selected=None):
    parts = []
    if acknowledged == "building_year":
        parts.append(f"{state.profile.building_year}년 준공으로 확인했어요. "
                     "준공 연도만으로 지원 자격을 결정할 수는 없어요.")
    if state.topic == "general":
        parts.append("생활에서 어려운 점도 말씀해 주세요. 현재는 주택 수리·누수, 취업, "
                     "재난 피해를 중심으로 필요한 정보와 관련 지원을 안내해요.")
    elif state.topic == "housing_leak" or state.practical_help:
        parts.append("누수가 있다면 먼저 안전한 곳에서 상황을 확인하고 관리 주체에 알려주세요.")
    if selected:
        if selected["schedule_status"] == "ended":
            parts.append("선택한 공고는 확인한 신청 기간이 지났거나 예산이 소진되었어요.")
        elif selected["schedule_status"] == "upcoming":
            parts.append("선택한 공고는 접수 시작 전이에요. 시작일과 준비할 내용을 확인해 주세요.")
        elif selected["comparison"]["status"] == "not_matched":
            parts.append("선택한 공고에 입력한 정보와 맞지 않는 조건이 있어요. "
                         "조건 비교를 확인해 주세요.")
        else:
            parts.append("선택한 공고의 조건을 다시 비교했어요. "
                         "최종 신청 가능 여부는 추가 확인이 필요해요.")
    if pending:
        parts.append("현재 정보만으로 지원 여부를 확정하기 어려워요. "
                     "필요한 정보를 하나씩 확인할게요."
                     if pending not in {"subject", "topic", "support_interest"} else
                     "질문 내용을 개인의 확정된 상황으로 저장하기 전에 안내 대상을 확인할게요."
                     if pending == "subject" else "")
    elif state.topic != "general" and catalog_status == "ready":
        parts.append("확인해 주신 정보로 관련 공고를 살펴봤어요. 소득·거주 요건, 접수 기간 등 "
                     "공고별 조건이 남아 있어 지원 자격을 확정한 결과는 아니에요.")
    if catalog_status == "unavailable":
        parts.append("지금은 공고를 불러오지 못했어요. 대화에서 확인한 정보는 임시로 유지되며 "
                     "지원 여부는 아직 확인하지 못했어요.")
    elif catalog_status == "ready" and not candidates and not selected:
        parts.append("현재 등록된 공개 공고에서는 조건 비교 후보를 찾지 못했어요. "
                     "지원 제도가 전혀 없다는 뜻은 아니에요.")
    elif candidates:
        parts.append(f"관련 공고 {len(candidates)}건을 확인 후보로 찾았어요.")
    return " ".join(part for part in parts if part)


def respond(repository, member: dict, data: DialogueInput, store: DialogueStore, *,
            saved_profile: MonitoringProfile | None = None, practical_guidance: dict | None = None):
    """Never persist conversation answers to a member or monitoring profile here."""
    account_id = member["id"]
    acknowledged = None
    unavailable_selected = False
    if data.question is not None:
        topic = classify_topic(data.question)
        if data.revision_id and repository is not None:
            try:
                record = _read_revision(repository, data.revision_id)
                if topic == "general":
                    topic = classify_topic(record["source_json"]["title"])
            except (SQLAlchemyError, KeyError, TypeError):
                unavailable_selected = True
        state = DialogueState(topic=topic, revision_id=data.revision_id,
                              practical_help=bool(LEAK_PATTERN.search(data.question)))
        token = store.create(account_id, state)
        error = None
    else:
        token = data.continuation
        state, version = store.read(token, account_id)
        pending = _next(state, member)
        if data.answer.slot != pending:
            raise DialogueError(409, "현재 확인 중인 질문에 답해 주세요. "
                                "새 주제는 새 질문으로 시작해 주세요.")
        error = None
        try:
            value = _parse(pending, data.answer.value)
        except (ValueError, TypeError):
            error = ("준공 연도는 1800년부터 올해까지의 연도로 입력해 주세요. 예: 1920년 건축"
                     if pending == "building_year" else
                     "피해 발생일은 오늘 이전의 실제 날짜로 입력해 주세요. 예: 2026-10-01"
                     if pending == "disaster_occurred_on" else
                     "시·도와 시·군·구 이름을 함께 입력해 주세요. 예: 서울특별시 노원구"
                     if pending == "region" else
                     "질문 아래 항목을 선택하거나 짧은 답을 입력해 주세요. "
                     "모르면 건너뛸 수 있어요.")
        else:
            _apply(state, pending, value, saved_profile)
            acknowledged = pending if value is not None else None
            store.update(token, account_id, state, version)
    candidates, selected, catalog_status = _compare(repository, state, member)
    if unavailable_selected:
        catalog_status = "unavailable"
    pending = _next(state, member)
    confirmed = sorted(state.confirmed)
    practical = LEAK_GUIDANCE if practical_guidance is None else practical_guidance
    missing = [{"slot": slot, "label": LABELS[slot]} for slot in _missing(state, member)]
    if selected:
        represented = {entry["slot"] for entry in missing}
        known_slots = {"home_ownership": "housing_tenure", "employment_status": "occupation",
                       "employment_preparation_status": "job_seeking", "residence_region": "region"}
        for check in selected["comparison"]["checks"]:
            slot = known_slots.get(check["field_key"], check["field_key"])
            if (check["state"] == "unknown" and check["role"] == "eligibility"
                    and slot not in represented):
                missing.append({"slot": slot, "label": check["label"]})
                represented.add(slot)
    return {
        "answer": error or _message(state, pending, candidates, catalog_status,
                                    acknowledged=acknowledged, selected=selected),
        "topic": state.topic, "eligibility_decided": False, "follow_up": _question(pending),
        "answer_accepted": None if data.question is not None else error is None,
        "missing_fields": missing,
        "continuation": token, "profile_draft": state.profile.model_dump(),
        "confirmed_fields": confirmed,
        "can_save_profile": state.subject == "self" and bool(confirmed),
        "candidates": candidates[:12], "candidate_count": len(candidates),
        "selected_policy": selected, "catalog_status": catalog_status,
        "practical_steps": (deepcopy(practical.get("steps", []))
                            if state.topic == "housing_leak" or state.practical_help else []),
        "source_links": (deepcopy(practical.get("links", []))
                         if state.topic == "housing_leak" or state.practical_help else []),
        "session_notice": ("대화 정보는 최대 30분간 임시로 사용해요. "
                           "직접 저장에 동의한 정보만 지속 안내에 반영해요."),
    }
