"""Conservative dates from a published period or an explicitly labelled notice line."""

import re
from calendar import monthrange
from dataclasses import dataclass
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


def application_reference_month(now=None):
    return (now or datetime.now(KST)).astimezone(KST).month


def application_reference_date(now=None):
    return (now or datetime.now(KST)).astimezone(KST).date()


@dataclass(frozen=True)
class _Endpoint:
    year: int | None
    month: int | None
    day: int | None
    month_end: bool = False


def _endpoint(value):
    match = re.fullmatch(DATE_WITH_OPTIONAL_YEAR + TIME, value)
    if match:
        year, month, day = match.groups()
        return _Endpoint(int(year) if year else None, int(month), int(day))
    match = re.fullmatch(
        MONTH + r"월\s*(?:말(?:일)?|마지막\s*날)" + TIME, value,
    )
    if match:
        year, month = match.groups()
        return _Endpoint(int(year) if year else None, int(month), None, True)
    match = re.fullmatch(r"([0-9]{1,2})\s*일" + TIME, value)
    return _Endpoint(None, None, int(match[1])) if match else None


def _endpoint_date(endpoint, year, month=None):
    month = endpoint.month if endpoint.month is not None else month
    day = monthrange(year, month)[1] if endpoint.month_end else endpoint.day
    return date(year, month, day)


def _clean_period(value):
    """Normalize prose wrappers only; never search arbitrary body/payment dates."""
    value = re.sub(r"[～∼〜–—－]", "~", value)
    value = re.sub(r"\s+-\s+", " ~ ", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(
        r"^[○●❍•*\-\s]*(?:[0-9]{1,2}\s*[.)、]\s*(?=(?:신청|접수|모집)))?", "", value,
    )
    value = re.sub(r"(?<![0-9])['’]([0-9]{2})(?=\s*[./년-])", r"20\1", value)
    value = re.sub(r"(?<![0-9])([0-9]{2})\s*년", r"20\1년", value)
    value = re.sub(r"^(?:사업|당해|해당)\s*연도\s*", "", value)
    label = re.match(
        r"^(?:(20[0-9]{2})\s*년(?:도)?\s*)?"
        r"((?:신청|접수|모집)\s*(?:기간|기한|마감일?|시작일|개시일|일정)?|마감일)"
        r"(?:은|는|이|가)?\s*[:：]?\s*(.+)$", value,
    )
    role = None
    context_year = None
    if label:
        context_year, name, value = label.groups()
        role = ("end" if re.search(r"기한|마감", name) else
                "start" if re.search(r"시작|개시", name) else None)
    value = re.sub(r"^(?:사업|당해|해당)\s*연도\s*", "", value)
    value = re.sub(r"^(?:예산|재원)\s*(?:의\s*)?범위\s*(?:내(?:에서)?|에서)\s*", "", value)
    value = re.sub(
        r"\s*(?:(?:신청|접수)\s*)?(?:가능합니다|가능|할\s*수\s*있습니다|"
        r"하시면\s*됩니다|해\s*주세요|하세요|합니다|됩니다|입니다|임)\s*[.。]?\s*$",
        "", value,
    ).strip()
    value = re.sub(r"\s*(?:신청|접수)\s*[.。]?\s*$", "", value)
    value = re.sub(r"\s*시[·ㆍ]?도(?:를)?\s*통해\s*공모\s*$", "", value)
    value = re.sub(r"\s*\((?:연도별\s*상이|예산[^()]*마감일\s*변경[^()]*)\)\s*$",
                   "", value)
    value = re.sub(r"(월|분기|반기)\s*(?:중|연중)\s*$", r"\1", value)
    annual = bool(re.match(r"^(?:매\s*년|매\s*해|해마다)\s*", value))
    value = re.sub(r"^(?:매\s*년|매\s*해|해마다)\s*", "", value)
    value = re.sub(
        r"^(?:상\s*반기|하\s*반기|(?:제\s*)?[0-9]+\s*차)\s*[:：]?\s*"
        r"(?=(?:20[0-9]{2}\s*(?:년|[./-])\s*)?[0-9]{1,2}\s*(?:월|[./-]))",
        "", value,
    )
    return value.rstrip(".。").strip(), role, annual, int(context_year) if context_year else None


def _relative_metadata(result, *, annual=False, yearless=False, month_end=False):
    if annual or yearless:
        result.update(applicationYear=None, applicationRecurrence="yearly")
    if month_end:
        result["applicationPrecision"] = "month_end"
        if not yearless:
            endpoint = result["applicationStart"] or result["applicationEnd"]
            result["applicationYear"] = int(endpoint[:4])
    return result


def _date_schedule(value, role, annual, reference_year, reference_month):
    """Parse explicit application endpoints, keeping a missing endpoint absent."""
    year = reference_year if reference_year is not None else application_reference_year()
    month = reference_month if reference_month is not None else application_reference_month()
    monthly = re.fullmatch(r"매\s*월\s*(?:말(?:일)?|마지막\s*날)\s*(?:까지)?"
                          + TIME + r"\s*(?:까지)?", value)
    if monthly:
        ending = date(year, month, monthrange(year, month)[1]).isoformat()
        return {"applicationStart": None, "applicationEnd": ending, "scheduleStatus": "dated",
                "applicationPrecision": "month_end", "applicationYear": None,
                "applicationRecurrence": "monthly"}
    period = re.fullmatch(r"(.+?)\s*(?:~|부터)\s*(.+?)(?:\s*까지)?", value)
    if period:
        first, last = map(_endpoint, period.groups())
        if first is None or last is None:
            return None
        first_month = first.month if first.month is not None else last.month
        last_month = last.month if last.month is not None else first.month
        if first_month is None or last_month is None:
            return None
        cross_year = first_month > last_month
        yearless = first.year is None and last.year is None
        if first.year is not None:
            first_year = first.year
            last_year = last.year if last.year is not None else first_year + cross_year
        elif last.year is not None:
            last_year = last.year
            first_year = last_year - cross_year
        else:
            first_year = year - bool(cross_year and reference_month is not None
                                     and reference_month <= last_month)
            last_year = first_year + cross_year
        start = _endpoint_date(first, first_year, first_month)
        end = _endpoint_date(last, last_year, last_month)
        if start > end:
            return None
        return _relative_metadata({"applicationStart": start.isoformat(),
            "applicationEnd": end.isoformat(), "scheduleStatus": "dated"},
            annual=annual and yearless, yearless=yearless,
            month_end=first.month_end or last.month_end)
    until = bool(re.search(r"(?:까지|이내)\s*$", value))
    beginning = bool(re.search(r"부터\s*$", value))
    endpoint_value = re.sub(r"\s*(?:까지|이내|부터)\s*$", "", value)
    endpoint = _endpoint(endpoint_value)
    if endpoint is None and (until or role == "end"):
        month_only = re.fullmatch(MONTH + r"월", endpoint_value)
        if month_only:
            written_year, written_month = month_only.groups()
            endpoint = _Endpoint(int(written_year) if written_year else None,
                                 int(written_month), None, True)
    if endpoint is None or (role is None and not until and not beginning
                            and not endpoint.month_end and not annual):
        return None
    parsed = _endpoint_date(endpoint, endpoint.year or year)
    start_only = role == "start" or beginning
    return _relative_metadata({
        "applicationStart": parsed.isoformat() if start_only else None,
        "applicationEnd": None if start_only else parsed.isoformat(), "scheduleStatus": "dated",
    }, annual=annual and endpoint.year is None, yearless=endpoint.year is None,
        month_end=endpoint.month_end)


def _multiple_schedule(value, *, annual, context_year, reference_year, reference_month):
    """Keep separate application rounds separate, including the gaps between them."""
    rounds = re.split(
        r"(?:\((?:제\s*)?(?:[0-9]+\s*차|상반기|하반기)\)|[0-9]+\s*차\s*[:：])\s*",
        value,
    )
    if len(rounds) > 2 and not rounds[0].strip(" ,;/|"):
        pieces = rounds[1:]
    else:
        pieces = re.split(r"\s*(?:[,，、;]|및)\s*|\s+/\s+", value)
    if len(pieces) < 2 or any(not piece.strip(" ,;/|") for piece in pieces):
        return None
    parsed = []
    inherited_year = context_year
    for piece in pieces:
        piece = piece.strip(" ,;/|")
        recurrent = bool(re.match(r"^(?:매\s*년|매\s*해|해마다|매\s*월)", piece))
        explicit = re.match(r"^(20[0-9]{2})\s*(?:년|[./-])", piece)
        if recurrent:
            inherited_year = None
        elif explicit:
            inherited_year = int(explicit[1])
        item = application_schedule(("매년 " if annual else "") + piece,
            reference_year=inherited_year or reference_year, reference_month=reference_month)
        if inherited_year is not None and not recurrent:
            item["applicationYear"] = inherited_year
            item.pop("applicationRecurrence", None)
        parsed.append(item)
    if any(item["scheduleStatus"] != "dated" or "applicationWindows" in item for item in parsed):
        return None
    windows = [{key: item[key] for key in ("applicationStart", "applicationEnd")}
               for item in parsed]
    selected = None
    if reference_month is not None:
        year = reference_year if reference_year is not None else application_reference_year()
        first = date(year, reference_month, 1).isoformat()
        following = date(year + (reference_month == 12), reference_month % 12 + 1, 1).isoformat()
        selected = next((index for index, window in enumerate(windows)
            if ((window["applicationStart"] < following and window["applicationEnd"] >= first)
                if window["applicationStart"] and window["applicationEnd"] else
                first <= (window["applicationStart"] or window["applicationEnd"]) < following)),
            None)
    if selected is None:
        today = application_reference_date().isoformat()
        current = [index for index, window in enumerate(windows)
                   if window["applicationStart"] and window["applicationEnd"]
                   and window["applicationStart"] <= today <= window["applicationEnd"]]
        upcoming = [index for index, window in enumerate(windows)
                    if (window["applicationStart"] or window["applicationEnd"]) >= today]
        selected = (current[0] if current else
                    min(upcoming, key=lambda index: windows[index]["applicationStart"] or
                        windows[index]["applicationEnd"]) if upcoming else
                    max(range(len(windows)), key=lambda index: windows[index]["applicationEnd"] or
                        windows[index]["applicationStart"]))
    result = {**parsed[selected], "applicationWindows": windows}
    if context_year is not None:
        result["applicationYear"] = context_year
        result.pop("applicationRecurrence", None)
    return result


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
    quarter = re.fullmatch(
        prefix + r"(?:(20[0-9]{2})\s*년(?:도)?\s*)?"
        r"(?:제?\s*([1-4])\s*분기|([상하])\s*반기)", value,
    )
    match = period or korean_period
    if match is not None:
        start_year, start_month, end_year, end_month = match.groups()
        first, last = int(start_month), int(end_month)
    elif single is not None:
        parsed_year, parsed_month = single.groups()
        start_year = end_year = parsed_year
        first = last = int(parsed_month)
    elif quarter is not None:
        parsed_year, number, half = quarter.groups()
        start_year = end_year = parsed_year
        first = (int(number) - 1) * 3 + 1 if number else 1 if half == "상" else 7
        last = first + (2 if number else 5)
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
            r"^[○●❍•*\-\s]*(?:[0-9]{1,2}\s*[.)、]\s*)?"
            r"(?:20[0-9]{2}\s*년(?:도)?\s*)?(?:신청|접수|모집)\s*"
            r"(?:기간|기한|마감일?|시작일|개시일)\s*(?:은|는|이|가)?\s*(?:[:：]\s*)?.+",
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
    value, role, annual, context_year = _clean_period(value)
    open_end = re.fullmatch(
        r"(.+?)\s*(?:~|부터)\s*(?:(?:예산|재원)\s*(?:소진|소모)\s*(?:시|때)?\s*까지"
        r"(?:\s*\((?:수\s*시|상\s*시)(?:\s*(?:신청|접수|모집))?\))?|"
        r"(?:상\s*시|연\s*중\s*(?:수\s*시)?)(?:\s*(?:신청|접수|모집))?)", value,
    )
    if open_end:
        start = application_schedule(
            "신청 시작일: " + ("매년 " if annual else "") + open_end[1],
            reference_year=context_year or reference_year, reference_month=reference_month,
        )
        if start["scheduleStatus"] != "dated" or not start["applicationStart"]:
            return result
        known = {key: start[key] for key in ("applicationYear", "applicationRecurrence")
                 if key in start}
        if context_year is not None:
            known["applicationYear"] = context_year
            known.pop("applicationRecurrence", None)
        return {"applicationStart": start["applicationStart"], "applicationEnd": None,
                "scheduleStatus": "ongoing", **known}
    if re.fullmatch(
        r"(?:분기별\s*(?:신청|접수)?\s*)?(?:\(\s*)?"
        r"매\s*분기\s*말\s*(?:의\s*)?다음\s*달\s*\)?", value,
    ):
        try:
            return _multiple_schedule(
                "1월, 4월, 7월, 10월", annual=True, context_year=context_year,
                reference_year=reference_year, reference_month=reference_month,
            )
        except (TypeError, ValueError):
            return result
    ongoing = re.fullmatch(
        r"(?:상\s*시\s*(?:신청|접수|모집)?|연\s*중\s*(?:수\s*시\s*)?(?:신청|접수|모집)?|"
        r"(?:월별\s*정기\s*모집\s*및\s*)?수\s*시\s*(?:신청|접수|모집)?|"
        r"출생\s*신고\s*후\s*언제든지)"
        r"(?:\s*\(([^()\n]*)\))?", value,
    )
    if ongoing:
        condition = ongoing[1]
        if condition:
            # Keep finite application limits instead of dropping their parentheses.
            condition = re.sub(
                r"(?:예산|재원)\s*(?:의\s*)?"
                r"(?:(?:소진|소모)\s*(?:시|때)?\s*(?:까지|(?:신청|접수|지원)?\s*"
                r"(?:조기\s*)?(?:마감|종료))?|범위\s*(?:내(?:에서)?|에서))",
                "", condition,
            ).strip(" ,;/|:")
            condition = re.sub(r"\s*마감(?:합니다|됩니다|됨)?\s*$", "까지", condition)
            parsed = application_schedule(
                condition, reference_year=context_year or reference_year,
                reference_month=reference_month,
            )
            if parsed["scheduleStatus"] == "dated":
                if context_year is not None and parsed.get("applicationYear") is None:
                    parsed["applicationYear"] = context_year
                    parsed.pop("applicationRecurrence", None)
                return parsed
            if re.search(
                r"[0-9]\s*(?:년|월|일|[./-])|기한|마감|종료|까지|이내|"
                r"다음\s*해|익\s*년|전\s*년도|(?:검진|출생|공고).*?(?:후|부터)", condition,
            ):
                return result
        return {**result, "scheduleStatus": "ongoing"}
    try:
        multiple = _multiple_schedule(
            value, annual=annual, context_year=context_year,
            reference_year=reference_year, reference_month=reference_month,
        )
        if multiple is not None:
            return multiple
    except (TypeError, ValueError):
        return result
    monthly = monthly_schedule(
        value, reference_year=context_year or reference_year, reference_month=reference_month,
    )
    if monthly is not None:
        if context_year is not None:
            monthly["applicationYear"] = context_year
        if annual and monthly["applicationYear"] is None:
            monthly["applicationRecurrence"] = "yearly"
        if role is not None and not re.search(r"~|부터", value):
            monthly["applicationStart" if role == "end" else "applicationEnd"] = None
            if role == "end":
                monthly["applicationPrecision"] = "month_end"
            else:
                monthly.pop("applicationPrecision", None)
        return monthly
    try:
        parsed = _date_schedule(
            value, role, annual, context_year or reference_year, reference_month,
        )
        if parsed is not None:
            if context_year is not None and parsed.get("applicationYear") is None:
                parsed["applicationYear"] = context_year
                parsed.pop("applicationRecurrence", None)
            return parsed
    except (TypeError, ValueError):
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
