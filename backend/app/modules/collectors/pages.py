"""One bounded provider response, including its original bytes and page metadata."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class CollectionPage:
    rows: list[dict[str, Any]]
    page: int
    per_page: int
    total_count: int | None
    raw: bytes


def page_number(value: object, name: str, *, allow_zero: bool = False) -> int:
    """Accept API integer metadata without coercing booleans or decimal numbers."""
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError(f"Invalid {name}")
    if isinstance(value, str) and (not value.isascii() or not value.isdigit()):
        raise ValueError(f"Invalid {name}")
    number = int(value)
    if number < (0 if allow_zero else 1):
        raise ValueError(f"Invalid {name}")
    return number
