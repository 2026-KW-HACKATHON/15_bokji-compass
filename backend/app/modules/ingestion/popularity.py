"""Read provider cumulative views from current collection listings, without reparsing."""

import math
import re
from datetime import UTC, datetime

from sqlalchemy import BigInteger, and_, case, cast, func, inspect, select

from app.modules.ingestion import models

MAX_SAFE_INTEGER = 9_007_199_254_740_991
COUNT_FIELDS = {"gov24": "조회수", "bokjiro": "inqNum"}
GROUPED_INTEGER = re.compile(r"[1-9][0-9]{0,2}(?:,[0-9]{3})+")
# The whitespace characters removed by Python str.strip(), also used by SQL.
COUNT_WHITESPACE = (
    " \t\n\r\v\f\x1c\x1d\x1e\x1f\x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004"
    "\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"
)


def view_count_expression(table, *, dialect="mysql"):
    """Validated provider count for DB-wide ordering, before LIMIT/OFFSET."""
    paths = {provider: '$."' + field + '"' for provider, field in COUNT_FIELDS.items()}
    path = case(*((table.c.provider == provider, value) for provider, value in paths.items()))
    raw = func.json_extract(table.c.listing_json, path)
    if dialect == "sqlite":
        kind = func.json_type(table.c.listing_json, path)
        accepted_types = ("integer", "text")
        stripped = func.trim(raw, COUNT_WHITESPACE)
    else:
        kind = func.json_type(raw)
        accepted_types = ("INTEGER", "UNSIGNED INTEGER", "STRING")
        whitespace = "[" + COUNT_WHITESPACE + "]"
        stripped = func.regexp_replace(func.json_unquote(raw),
                                       "^" + whitespace + "+|" + whitespace + "+$", "")
    digits = func.replace(stripped, ",", "")
    numeric = cast(case((and_(
        kind.in_(accepted_types),
        stripped.regexp_match(r"^([0-9]+|[1-9][0-9]{0,2}(,[0-9]{3})+)$"),
        func.length(digits) <= 16,
    ), digits)), BigInteger)
    return case((numeric <= MAX_SAFE_INTEGER, numeric))


def _count(value) -> int | None:
    if type(value) is int:
        return value if 0 <= value <= MAX_SAFE_INTEGER else None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if "," in text:
        if GROUPED_INTEGER.fullmatch(text) is None:
            return None
        text = text.replace(",", "")
    if not text or len(text) > 16 or re.fullmatch(r"[0-9]+", text) is None:
        return None
    number = int(text)
    return number if number <= MAX_SAFE_INTEGER else None


def _observed_at(value) -> str | None:
    if type(value) not in {int, float} or value < 0:
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    try:
        return datetime.fromtimestamp(value, UTC).isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def listing_popularity(provider, listing) -> dict | None:
    """Parse one stored listing without database or external calls."""
    field = COUNT_FIELDS.get(provider)
    if field is None or not isinstance(listing, dict):
        return None
    views = _count(listing.get(field))
    if views is None:
        return None
    return {"views": views, "source": provider, "basis": "provider_cumulative_views",
            "asOf": _observed_at(listing.get("_views_observed_at"))}


def load_popularity(repository, policy_keys) -> dict[str, dict]:
    """Bulk-read optional listing signals; a missing collection table means no signals."""
    keys = tuple(dict.fromkeys(policy_keys))
    if not keys:
        return {}
    table = models.records
    with repository.engine.connect() as connection:
        if not inspect(connection).has_table(table.name):
            return {}
        records = connection.execute(select(
            table.c.policy_key, table.c.provider, table.c.listing_json,
        ).where(table.c.policy_key.in_(keys))).mappings().all()
    result = {}
    for record in records:
        signal = listing_popularity(record["provider"], record["listing_json"])
        if signal is not None:
            result[record["policy_key"]] = signal
    return result
