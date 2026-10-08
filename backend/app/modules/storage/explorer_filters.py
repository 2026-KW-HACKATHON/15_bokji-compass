"""Explicit catalog facets, evaluated before counts and pagination without AI calls."""

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app.modules.storage.schedule_rules import resolve_calendar_schedule

AGE_BANDS = {
    "0-18": (0, 18),
    "19-24": (19, 24),
    "25-30": (25, 30),
    "31-39": (31, 39),
    "40-64": (40, 64),
    "65-120": (65, 120),
}
NOTICE_STATUSES = ("upcoming", "open", "closed", "selecting", "selected", "paying", "paid")


def notice_status(policy, record, today):
    # Selection/payment progression needs an explicit published source field.
    explicit = record["source_json"].get("fields", {}).get("notice_status")
    if explicit in NOTICE_STATUSES:
        return explicit
    current = today.isoformat()
    statuses = set()
    # The envelope can include gaps between application rounds. Only an actual
    # window can be open; a later round keeps a gap in the upcoming category.
    for window in policy.get("applicationWindows") or [policy]:
        start, end = window.get("applicationStart"), window.get("applicationEnd")
        if start and current < start:
            statuses.add("upcoming")
        elif end and current > end:
            statuses.add("closed")
        elif policy.get("scheduleStatus") == "ongoing" or (
            start and end and start <= current <= end
        ):
            return "open"
        else:
            statuses.add("unknown")
    return next(status for status in ("upcoming", "unknown", "closed") if status in statuses)


def matches_age(record, bands, minimum=None, maximum=None):
    """Compare precise published age ranges; unknown or vague age text cannot match."""
    ranges = [AGE_BANDS[band] for band in bands]
    if minimum is not None or maximum is not None:
        ranges.append(
            (minimum if minimum is not None else 0, maximum if maximum is not None else 120)
        )
    if not ranges:
        return True
    section = (record["draft_json"].get("overview") or {}).get("age_conditions") or {}
    if section.get("status") == "unrestricted":
        return True
    if section.get("status") != "specified":
        return False
    value = re.sub(r"\s+", "", section.get("text") or "")
    pair = re.fullmatch(r"(?:만)?(\d{1,3})세?[~～–-](?:만)?(\d{1,3})세", value)
    combined = re.fullmatch(
        r"(?:만)?(\d{1,3})세(이상|초과)(?:[~～–-]|부터)?"
        r"(?:만)?(\d{1,3})세(이하|미만)",
        value,
    )
    bound = re.fullmatch(r"(?:만)?(\d{1,3})세(이상|이하|미만|초과)", value)
    if pair:
        low, high = map(int, pair.groups())
    elif combined:
        low = int(combined[1]) + (combined[2] == "초과")
        high = int(combined[3]) - (combined[4] == "미만")
    elif bound:
        age, direction = int(bound[1]), bound[2]
        low = age + (direction == "초과") if direction in {"이상", "초과"} else 0
        high = age - (direction == "미만") if direction in {"이하", "미만"} else 120
    else:
        return False
    return 0 <= low <= high <= 120 and any(a <= high and b >= low for a, b in ranges)


def matches_eligibility(record, member, today):
    # Reuse validated condition logic; no finance/profile is fetched implicitly.
    from app.contracts.conditions import CanonicalPolicy
    from app.contracts.parsing import SourcePolicy
    from app.modules.matching.public import (
        application_is_open,
        build_facts,
        compare_policy,
        missing_target_requirements,
    )
    from app.modules.presentation.public import policy_signals
    from app.modules.storage.catalog import card

    if member is None or record.get("canonical_json") is None:
        return False
    try:
        matching = compare_policy(record, build_facts(member, None), today=today)
        policy = {**card(record), **policy_signals(record)}
        return (
            matching["status"] == "potential_match"
            and notice_status(policy, record, today) == "open"
            and not missing_target_requirements(
                CanonicalPolicy.model_validate(record["canonical_json"]),
                SourcePolicy.model_validate(record["source_json"]),
            )
            and application_is_open(policy, matching, today)
        )
    except (ValueError, TypeError, KeyError):
        return False


def filter_records(
    records,
    *,
    status="",
    age_bands=(),
    age_min=None,
    age_max=None,
    eligible_only=False,
    member=None,
    today=None,
):
    today = today or datetime.now(ZoneInfo("Asia/Seoul")).date()
    for record in records:
        if not matches_age(record, age_bands, age_min, age_max):
            continue
        if status:
            draft = record["draft_json"]
            schedule = resolve_calendar_schedule(
                record["source_json"]["fields"],
                draft.get("overview") or {},
                draft.get("application_calendar"),
                reference_year=today.year,
                reference_month=today.month,
            )
            if notice_status(schedule, record, today) != status:
                continue
        if eligible_only and not matches_eligibility(record, member, today):
            continue
        yield record
