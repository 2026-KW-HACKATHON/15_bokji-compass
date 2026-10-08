"""Local search interpretation. Search context never asserts member eligibility."""

from dataclasses import dataclass
from typing import Literal

SearchIntent = Literal["publisher", "target", "related", "general", "ambiguous"]


@dataclass(frozen=True)
class Institution:
    name: str
    aliases: tuple[str, ...]
    role: Literal["publisher", "affiliation", "related", "excluded"] = "related"


@dataclass(frozen=True)
class Correction:
    original: str
    replacement: str


@dataclass(frozen=True)
class SearchPlan:
    original_query: str
    normalized_query: str
    intent: SearchIntent
    institutions: tuple[Institution, ...] = ()
    concepts: tuple[str, ...] = ()
    exclusions: tuple[str, ...] = ()
    terms: tuple[str, ...] = ()
    audiences: tuple[str, ...] = ()
    corrections: tuple[Correction, ...] = ()
    ambiguities: tuple[str, ...] = ()
    summary: str = ""

    @property
    def interpreted_query(self) -> str:
        return self.normalized_query
