"""Source-backed notice signals. Missing counts or budget figures stay missing."""

import re
from datetime import date
from decimal import Decimal
from urllib.parse import urlsplit

__all__ = ["load_popularity", "policy_signals"]

BUDGET_LINE = re.compile(
    r"\s*[❍❏○●•·*\-\s]*(?:현재\s*)?예산\s*소진[율률]\s*[:：]\s*"
    r"(?P<percent>\d{1,3}(?:\.\d{1,2})?)\s*%\s*[.。]?\s*"
)
BUDGET_DATE = re.compile(
    r"\s*[❍❏○●•·*\-\s]*예산\s*(?:소진[율률]\s*)?기준일\s*[:：]\s*"
    r"(20\d{2}-\d{2}-\d{2})\s*"
)
BUDGET_NOTICE = re.compile(
    r"[^\n.!?。]{0,100}예산\s*소진\s*(?:시|되면|될\s*경우)[^\n.!?。]{0,100}"
)


def load_popularity(repository, policy_keys):
    """Read current provider counters without importing the collection worker at startup."""
    from app.modules.ingestion.public import load_popularity as read_popularity

    return read_popularity(repository, policy_keys)


def _source_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlsplit(value)
        if (parsed.scheme == "https" and parsed.hostname
                and not parsed.username and not parsed.password):
            return value
    except ValueError:
        pass
    return None


def policy_signals(record, *, popularity=None):
    """Return optional popularity, budget and budgetNotice from actual source data.

    Budget percentages require an unambiguous, standalone labeled source line;
    a deadline warning, planned threshold, subsidy percentage or total allocation
    never becomes a depletion ratio. No HTTP/model calls and no source mutation.
    """
    result = {}
    if popularity is not None:
        result["popularity"] = popularity
    source = record["source_json"]
    url = _source_url(source.get("source_url"))
    if url is None:
        return result
    fields = source.get("fields") or {}
    lines = list(dict.fromkeys(
        line.strip() for field in ("text", "application_period", "benefits")
        for line in (fields.get(field) or "").splitlines() if line.strip()
    ))
    values, dates, notices, invalid_ratio = {}, set(), [], False
    for line in lines:
        match = BUDGET_LINE.fullmatch(line)
        if match:
            percent = Decimal(match["percent"])
            if 0 <= percent <= 100:
                values[percent] = line
            else:
                invalid_ratio = True
        match = BUDGET_DATE.fullmatch(line)
        if match:
            try:
                dates.add(date.fromisoformat(match[1]).isoformat())
            except ValueError:
                pass
        match = BUDGET_NOTICE.search(line)
        if match:
            notices.append(match[0].strip())
    if len(values) == 1 and not invalid_ratio:
        percent, evidence = next(iter(values.items()))
        result["budget"] = {
            "usedPercent": float(percent), "sourceUrl": url,
            "asOf": next(iter(dates)) if len(dates) == 1 else None,
            "evidence": evidence,
        }
    if notices:
        result["budgetNotice"] = notices[0]
    return result
