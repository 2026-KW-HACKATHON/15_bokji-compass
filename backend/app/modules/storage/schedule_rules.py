"""Evidence-checked calendar expressions without replacing cited source wording."""

import re
from copy import deepcopy

from pydantic import ValidationError

from app.contracts.parsing import ApplicationPeriodDraft
from app.modules.storage.application_dates import application_schedule, resolved_application_period

_NUMBER = re.compile(r"[0-9]+")
_RELATIVE = re.compile(
    r"전\s*년(?:도)?|다음\s*해|익\s*년|사업\s*연도|당해\s*연도|해당\s*연도|"
    r"올해|금년|내년|"
    r"(?:검진|출생|신고|공고|통지|선정|진단|퇴직|입원|사망|발생|지급)"
    r"\s*(?:일|날|시점)?\s*(?:이후|후|로부터|부터|기준)|"
    r"(?:일|개월|달|년)\s*(?:이내|이후|후)"
)
_ONGOING = re.compile(r"상\s*시|연\s*중(?:\s*수\s*시)?|언제\s*든지")
_DEADLINE = re.compile(r"기한|마감|종료|까지|이내|[0-9]\s*(?:년|월|일)|[0-9]\s*[./-]\s*[0-9]")
_NUMERIC_DATE = re.compile(
    r"(?<![0-9])(?:(?:20[0-9]{2}|['’][0-9]{2}|[0-9]{2}\s*년)"
    r"\s*[년./-]?\s*)?([0-9]{1,2})\s*[월./-]\s*([0-9]{1,2})(?![0-9])"
)
_YEAR_LABEL = re.compile(r"(?<![0-9])(20[0-9]{2}|[0-9]{2})\s*년")


def _numbers(value):
    return {int(number) for number in _NUMBER.findall(value)}


def _year_numbers(value):
    """A short number is a year only when the quotation labels it as one."""
    years = {int(number) for number in re.findall(r"(?<![0-9])20[0-9]{2}(?![0-9])", value)}
    for short in re.findall(r"(?<![0-9])([0-9]{2})\s*년", value):
        years.add(2000 + int(short))
    for short in re.findall(r"(?<![0-9])['’]([0-9]{2})(?=\s*[./년-])", value):
        years.add(2000 + int(short))
    return years


def _day_numbers(value):
    """Keep day evidence separate from ages, sums, quarter numbers, and months."""
    days = {int(number) for number in re.findall(r"(?<![0-9])([0-9]{1,2})\s*일", value)}
    days.update(int(number) for number in re.findall(r"월\s*([0-9]{1,2})(?![0-9])", value))
    days.update(int(match[2]) for match in _NUMERIC_DATE.finditer(value)
                if 1 <= int(match[1]) <= 12)
    return days


def _month_numbers(value):
    months = {int(number) for number in re.findall(r"(?<![0-9])([0-9]{1,2})\s*월", value)}
    months.update(int(number) for number in re.findall(
        r"(?<![0-9])([0-9]{1,2})\s*[~～∼〜–—-]\s*[0-9]{1,2}\s*월", value,
    ))
    dotted_months = re.finditer(
        r"(?<![0-9])(?:20[0-9]{2}\s*[./년-]\s*)?([0-9]{1,2})\s*\.\s*"
        r"[~～∼〜–—]\s*(?:20[0-9]{2}\s*[./년-]\s*)?([0-9]{1,2})\s*\."
        r"(?=\s|[()（）]|$)", value,
    )
    for match in dotted_months:
        months.update((int(match[1]), int(match[2])))
    months.update(int(match[1]) for match in _NUMERIC_DATE.finditer(value)
                  if 1 <= int(match[1]) <= 12)
    return months


def _date_coordinates(value):
    """Preserve quoted year/month/day combinations, including shortened endpoints."""
    dates = list(_NUMERIC_DATE.finditer(value))
    bare_days = [match for match in re.finditer(r"(?<![0-9])([0-9]{1,2})\s*일", value)
                 if not any(point.start() <= match.start() < point.end() for point in dates)]
    points = set()
    year = month = None
    previous_end = 0
    tokens = [(point, False) for point in dates] + [(point, True) for point in bare_days]
    for token, bare in sorted(tokens, key=lambda item: item[0].start()):
        prefix = value[previous_end:token.start()]
        labels = list(_YEAR_LABEL.finditer(prefix))
        annual = list(re.finditer(r"매\s*년|매\s*해|해마다", prefix))
        if annual and (not labels or annual[-1].start() > labels[-1].start()):
            year = None
        elif labels:
            written = int(labels[-1][1])
            year = written if written >= 2000 else written + 2000
        if bare:
            day = int(token[1])
        else:
            explicit = re.match(r"(20[0-9]{2}|['’][0-9]{2}|[0-9]{2}\s*년)", token[0])
            if explicit:
                written = int(re.sub(r"[^0-9]", "", explicit[1]))
                year = written if written >= 2000 else written + 2000
            month, day = int(token[1]), int(token[2])
        if month is not None and 1 <= month <= 12:
            points.add((year, month, day))
        previous_end = token.end()
    return points


def _quotes(period, fields):
    if not isinstance(period, dict) or not isinstance(fields, dict):
        return None
    try:
        cited = ApplicationPeriodDraft.model_validate(period)
    except ValidationError:
        return None
    if cited.status != "specified":
        return None
    quotes = []
    for evidence in cited.evidence:
        source = fields.get(evidence.source_field)
        if not isinstance(source, str) or evidence.quote not in source:
            return None
        quotes.append(evidence.quote)
    return quotes


def build_calendar_rule(period: dict, expression: str | None, fields: dict) -> dict | None:
    """Return a source-backed parseable expression, or reject unsupported inference."""
    if not isinstance(expression, str) or not expression.strip():
        return None
    expression = expression.strip()
    if any(character.isdigit() and character not in "0123456789" for character in expression):
        return None
    quotes = _quotes(period, fields)
    if not quotes:
        return None
    evidence = "\n".join(quotes)
    if _RELATIVE.search(evidence) or _RELATIVE.search(expression):
        return None
    # Validate independently of today's year, including a genuine leap-day source.
    schedule = application_schedule(expression, reference_year=2000, reference_month=1)
    if schedule["scheduleStatus"] not in {"dated", "ongoing"}:
        return None
    if not _numbers(expression) <= (_numbers(evidence) | _year_numbers(evidence)):
        return None
    if not _year_numbers(expression) <= _year_numbers(evidence):
        return None
    if not _year_numbers(period["text"]) <= _year_numbers(expression):
        return None
    if not _month_numbers(expression) <= _month_numbers(evidence):
        return None
    if not _day_numbers(expression) <= _day_numbers(evidence):
        return None
    quoted_points = set().union(*(_date_coordinates(quote) for quote in quotes))
    if not _date_coordinates(expression) <= quoted_points:
        return None
    if re.search(r"매\s*월", expression) and not re.search(r"매\s*(?:월|달)", evidence):
        return None
    if schedule["scheduleStatus"] == "ongoing":
        # A budget exhaustion condition does not itself supply a calendar deadline.
        limited = re.sub(r"예산\s*(?:소진|소모)\s*(?:시|때)?\s*까지", "", evidence)
        if not _ONGOING.search(evidence) or _DEADLINE.search(limited):
            return None
    return {"expression": expression, "period": deepcopy(period)}


def resolve_calendar_schedule(
    fields, overview, rule=None, reference_year=None, reference_month=None,
):
    """Use source parsing first; recheck a matching cited fallback at every read."""
    fields = fields if isinstance(fields, dict) else {}
    overview = overview if isinstance(overview, dict) else {}
    schedule = application_schedule(
        resolved_application_period(fields, overview),
        reference_year=reference_year, reference_month=reference_month,
    )
    if schedule["scheduleStatus"] != "unknown":
        return schedule
    if rule is None:
        rule = build_calendar_rule(
            overview.get("application_period"), overview.get("calendar_expression"), fields,
        )
    if not isinstance(rule, dict):
        return schedule
    period = rule.get("period")
    if period != overview.get("application_period"):
        return schedule
    valid = build_calendar_rule(period, rule.get("expression"), fields)
    if valid is None:
        return schedule
    return application_schedule(
        valid["expression"], reference_year=reference_year, reference_month=reference_month,
    )
