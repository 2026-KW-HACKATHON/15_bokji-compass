"""Metrics for Kwangwoon University notices."""

from urllib.error import HTTPError

from app.modules.collectors.kwangwoon_notices import (
    fetch_kwangwoon_notice_html,
    fetch_kwangwoon_notice_probe,
    find_latest_kwangwoon_duid,
    parse_kwangwoon_notice,
)


def count_kwangwoon_notices(
    start_duid: int,
    end_duid: int | None = None,
) -> int:
    """등록/장학과 관련된 내용은 category=4"""
    """Count category-4 notices from ``start_duid`` through the latest DUID."""

    if not isinstance(start_duid, int) or start_duid < 1:
        raise ValueError("start_duid must be a positive integer")
    resolved_end_duid = end_duid if end_duid is not None else find_latest_kwangwoon_duid()
    if not isinstance(resolved_end_duid, int) or resolved_end_duid < start_duid:
        raise ValueError("end_duid must be an integer no smaller than start_duid")

    count = 0
    for duid in range(start_duid, resolved_end_duid + 1):
        try:
            fetch_kwangwoon_notice_probe(duid)
            parse_kwangwoon_notice(fetch_kwangwoon_notice_html(duid))
        except (HTTPError, ValueError):
            continue
        count += 1
    return count
