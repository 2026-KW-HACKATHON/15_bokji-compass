"""Shared data contracts used by backend modules."""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class RawDocument:
    """An unmodified public notice and the information needed to trace it."""

    document_id: str
    title: str
    text: str
    source_url: str
    collected_at: str
    published_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def utc_now_iso() -> str:
    """Return the current UTC time in ISO 8601 format."""

    return datetime.now(timezone.utc).isoformat()