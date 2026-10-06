"""Conservative dates from a published period or an explicitly labelled notice line."""

import re
from datetime import date

DATE = r"(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})(?:\s*[.일])?"
DATE_WITH_OPTIONAL_YEAR = (
    r"(20\d{2})?\s*[-./년]?\s*(\d{1,2})\s*[-./월]\s*"
    r"(\d{1,2})(?:\s*[.일])?"
)
TIME = (
    r"(?:\s*\([월화수목금토일](?:요일)?\))?"
    r"(?:\s*(?:\d{1,2}:\d{2}|\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?))?"
)
PREFIX = r"(?:(?:신청|접수)\s*(?:기간|기한)(?:은|는|이|가)?\s*[:：]?\s*)?"


def application_period(fields):
    explicit = fields.get("application_period")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    text = fields.get("text") or ""
    lines = {
        line.strip()
        for line in text.splitlines()
        if re.match(
            r"^\s*(?:\d+\s*[.)、]\s*)?(?:신청|접수)\s*"
            r"(?:기간|기한|마감|시작일)\s*[:：]",
            line,
        )
    }
    # Multiple distinct periods cannot be resolved without reviewing the source.
    if len(lines) != 1:
        return ""
    return re.sub(r"^\d+\s*[.)、]\s*", "", lines.pop())


def application_schedule(value):
    result = {"applicationStart": None, "applicationEnd": None, "scheduleStatus": "unknown"}
    if not isinstance(value, str):
        return result
    value = value.strip()
    if re.fullmatch(
        r"(?:상시\s*(?:신청|접수)?|연중|수시\s*(?:신청|접수)?)(?:\s*\([^\n]*\))?", value
    ):
        return {**result, "scheduleStatus": "ongoing"}
    period = re.fullmatch(
        PREFIX + DATE + TIME + r"\s*[~～–—]\s*" + DATE_WITH_OPTIONAL_YEAR + TIME,
        value,
    )
    korean_period = re.fullmatch(
        PREFIX + DATE + TIME + r"\s*부터\s*" + DATE_WITH_OPTIONAL_YEAR + TIME + r"\s*까지",
        value,
    )
    ending = re.fullmatch(r"(?:신청기한|신청마감|마감일|접수마감)\s*[:：]?\s*" + DATE + TIME, value)
    until = re.fullmatch(DATE + TIME + r"\s*까지", value)
    starting = re.fullmatch(r"(?:신청|접수)\s*시작일\s*[:：]?\s*" + DATE + TIME, value)
    try:
        match = period if period is not None else korean_period
        if match is not None:
            start_year, start_month, start_day, end_year, end_month, end_day = match.groups()
            start = date(int(start_year), int(start_month), int(start_day))
            end = date(
                int(end_year or start_year),
                int(end_month),
                int(end_day),
            )
            if start > end:
                return result
            return {
                "applicationStart": start.isoformat(),
                "applicationEnd": end.isoformat(),
                "scheduleStatus": "dated",
            }
        match = ending or until or starting
        if match is not None:
            parsed = date(*map(int, match.groups())).isoformat()
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
