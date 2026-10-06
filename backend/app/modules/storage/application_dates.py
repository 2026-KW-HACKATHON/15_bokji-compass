"""Conservative dates from a published period or an explicitly labelled notice line."""

import re
from datetime import date

DATE = r"(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})(?:\s*[.일])?"
TIME = r"(?:\s*\([월화수목금토일](?:요일)?\))?(?:\s*\d{1,2}:\d{2})?"
PREFIX = r"(?:(?:신청|접수)\s*(?:기간|기한)(?:은|는|이|가)?\s*[:：]?\s*)?"


def application_period(fields):
    explicit = fields.get("application_period")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    text = fields.get("text") or ""
    lines = {
        line.strip()
        for line in text.splitlines()
        if re.match(r"^\s*(?:신청|접수)\s*(?:기간|기한|마감|시작일)\s*[:：]", line)
    }
    # Multiple distinct periods cannot be resolved without reviewing the source.
    return lines.pop() if len(lines) == 1 else ""


def application_schedule(value):
    result = {"applicationStart": None, "applicationEnd": None, "scheduleStatus": "unknown"}
    if not isinstance(value, str):
        return result
    value = value.strip()
    if re.fullmatch(
        r"(?:상시\s*(?:신청|접수)?|연중|수시\s*(?:신청|접수)?)(?:\s*\([^\n]*\))?", value
    ):
        return {**result, "scheduleStatus": "ongoing"}
    period = re.fullmatch(PREFIX + DATE + TIME + r"\s*[~～–—]\s*" + DATE + TIME, value)
    korean_period = re.fullmatch(
        PREFIX + DATE + TIME + r"\s*부터\s*" + DATE + TIME + r"\s*까지", value
    )
    ending = re.fullmatch(r"(?:신청기한|신청마감|마감일|접수마감)\s*[:：]?\s*" + DATE + TIME, value)
    until = re.fullmatch(DATE + TIME + r"\s*까지", value)
    starting = re.fullmatch(r"(?:신청|접수)\s*시작일\s*[:：]?\s*" + DATE + TIME, value)
    try:
        if period or korean_period:
            match = period or korean_period
            start = date(*map(int, match.groups()[:3]))
            end = date(*map(int, match.groups()[3:]))
            if start > end:
                return result
            return {
                "applicationStart": start.isoformat(),
                "applicationEnd": end.isoformat(),
                "scheduleStatus": "dated",
            }
        if ending or until or starting:
            parsed = date(*map(int, (ending or until or starting).groups())).isoformat()
            return {
                **result,
                "applicationStart": parsed if starting else None,
                "applicationEnd": parsed if ending or until else None,
                "scheduleStatus": "dated",
            }
    except ValueError:
        pass
    return result


def resolved_application_period(fields, overview=None):
    """Prefer a cited model extraction, then use conservative source-text parsing."""
    extracted = (overview or {}).get("application_period")
    if (isinstance(extracted, dict) and extracted.get("status") == "specified"
            and isinstance(extracted.get("text"), str)):
        return extracted["text"]
    return application_period(fields)


def application_date_columns(fields, extracted_period=None):
    """Return only unambiguous application dates for the legacy policy columns."""
    value = resolved_application_period(fields, {"application_period": extracted_period})
    schedule = application_schedule(value)
    start = schedule["applicationStart"]
    end = schedule["applicationEnd"]
    return (
        date.fromisoformat(start) if start else None,
        date.fromisoformat(end) if end else None,
    )
