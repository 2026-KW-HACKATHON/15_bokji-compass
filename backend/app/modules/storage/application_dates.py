"""Conservative dates from a published period or an explicitly labelled notice line."""

import re
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone

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
MONTH = r"(?:(20\d{2})\s*(?:년|[-./])\s*)?(\d{1,2})\s*"
KST = timezone(timedelta(hours=9))


def application_reference_year(now=None):
    """Use Korea's calendar year even when the execution host uses UTC."""
    return (now or datetime.now(KST)).astimezone(KST).year


def monthly_schedule(value, *, reference_year=None, reference_month=None):
    """Expand a published month range to its first day and final calendar day."""
    prefix = PREFIX + r"(?:매년\s*)?"
    period = re.fullmatch(
        prefix + MONTH + r"월?\s*[~～–—]\s*" + MONTH + r"월", value,
    )
    korean_period = re.fullmatch(
        prefix + MONTH + r"월\s*부터\s*" + MONTH + r"월\s*까지", value,
    )
    single = re.fullmatch(prefix + MONTH + r"월", value)
    match = period or korean_period
    if match is not None:
        start_year, start_month, end_year, end_month = match.groups()
        first, last = int(start_month), int(end_month)
    elif single is not None:
        parsed_year, parsed_month = single.groups()
        start_year = end_year = parsed_year
        first = last = int(parsed_month)
    else:
        return None
    if not (1 <= first <= 12 and 1 <= last <= 12):
        return None
    year_specified = bool(start_year or end_year)
    if start_year:
        year = int(start_year)
        final_year = int(end_year) if end_year else year + (first > last)
    elif end_year:
        final_year = int(end_year)
        year = final_year - (first > last)
    else:
        year = reference_year if reference_year is not None else application_reference_year()
        # January/February and the preceding November/December belong to the
        # same year-spanning application window when querying those months.
        if first > last and reference_month is not None and reference_month <= last:
            year -= 1
        final_year = year + (first > last)
    try:
        start = date(year, first, 1)
        end = date(final_year, last, monthrange(final_year, last)[1])
    except (TypeError, ValueError):
        return None
    if start > end:
        return None
    months = (list(range(first, last + 1)) if year == final_year else
              list(dict.fromkeys(list(range(first, 13)) + list(range(1, last + 1)))))
    if final_year - year > 1:
        months = list(range(1, 13))
    return {
        "applicationStart": start.isoformat(),
        "applicationEnd": end.isoformat(),
        "scheduleStatus": "dated",
        "applicationPrecision": "month",
        "applicationMonths": months,
        "applicationYear": year if year_specified else None,
    }


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


def application_schedule(value, *, reference_year=None, reference_month=None):
    result = {"applicationStart": None, "applicationEnd": None, "scheduleStatus": "unknown"}
    if not isinstance(value, str):
        return result
    value = value.strip()
    if re.fullmatch(
        r"(?:상시\s*(?:신청|접수)?|연중|수시\s*(?:신청|접수)?)(?:\s*\([^\n]*\))?", value
    ):
        return {**result, "scheduleStatus": "ongoing"}
    monthly = monthly_schedule(
        value, reference_year=reference_year, reference_month=reference_month,
    )
    if monthly is not None:
        return monthly
    period = re.fullmatch(
        PREFIX + DATE_WITH_OPTIONAL_YEAR + TIME + r"\s*[~～–—]\s*"
        + DATE_WITH_OPTIONAL_YEAR + TIME,
        value,
    )
    korean_period = re.fullmatch(
        PREFIX + DATE_WITH_OPTIONAL_YEAR + TIME + r"\s*부터\s*"
        + DATE_WITH_OPTIONAL_YEAR + TIME + r"\s*까지",
        value,
    )
    ending = re.fullmatch(r"(?:신청기한|신청마감|마감일|접수마감)\s*[:：]?\s*"
        + DATE + TIME, value)
    until = re.fullmatch(DATE + TIME + r"\s*까지", value)
    starting = re.fullmatch(r"(?:신청|접수)\s*시작일\s*[:：]?\s*"
                            + DATE + TIME, value)
    try:
        match = period if period is not None else korean_period
        if match is not None:
            start_year, start_month, start_day, end_year, end_month, end_day = match.groups()
            if not start_year and not end_year:
                return result
            start_year = start_year or end_year
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
            year, month, day = match.groups()
            parsed = date(int(year), int(month), int(day)).isoformat()
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
    """Project parsed application dates, including first/last days of month periods."""
    value = resolved_application_period(fields, {"application_period": extracted_period})
    schedule = application_schedule(value)
    start = schedule["applicationStart"]
    end = schedule["applicationEnd"]
    return (
        date.fromisoformat(start) if start else None,
        date.fromisoformat(end) if end else None,
    )
