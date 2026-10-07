"""Literal catalog search, keeping publisher and source content distinct."""

import re
from typing import Literal

from sqlalchemy import func, or_

SearchScope = Literal["all", "organization", "content"]
SEARCH_SCOPES = ("all", "organization", "content")
# These fields contain substantive plain text in the normalization contract.
# Optional contact/link/attachment fields may contain serialized metadata and
# must not establish a content match. Do not search the whole fields JSON.
CONTENT_FIELDS = ("text", "purpose_summary", "eligibility", "selection", "benefits")
EDITORIAL_FIELDS = ("summary", "benefits", "region", "age", "gender", "other")
# Match Python's str.split whitespace when comparing text stored in MySQL.
WHITESPACE = tuple(chr(point) for point in (
    *range(9, 14), *range(28, 33), 133, 160, 5760, *range(8192, 8203),
    8232, 8233, 8239, 8287, 12288,
))


def search_terms(query: str) -> list[tuple[str, ...]]:
    """Return AND terms with conservative, whole-name university variants.

    An abbreviated name already matches its full name as a substring. Only an
    explicit Korean X대학교 query (at least two stem syllables) expands to X대;
    ordinary words ending in 대 and bare 대학교 never gain guessed aliases.
    """
    terms = []
    for word in query.lower().split():
        university = re.fullmatch(r"([가-힣]{2,})대학교", word)
        terms.append((word, university[1] + "대") if university else (word,))
    return terms


def _json_text(source, path):
    return func.coalesce(
        func.nullif(func.json_unquote(func.json_extract(source, path)), "null"), ""
    )


def _normalized(expression):
    for whitespace in WHITESPACE:
        expression = func.replace(expression, whitespace, "")
    return func.lower(expression)


def search_predicates(catalog, query: str, scope: SearchScope = "all"):
    """Build per-word SQL conditions before count, ordering and pagination.

    All allows each word to match either publisher or content. Separators stay
    between content fields, so a word cannot span unrelated JSON values.
    This is keyword matching, including any publisher mention in the raw body.
    """
    if scope not in SEARCH_SCOPES:
        raise ValueError("Invalid policy search scope")
    terms = search_terms(query)
    if not terms:
        return []
    source = catalog.c.source_json
    organization = _normalized(_json_text(source, "$.organization"))
    content = func.concat(
        _normalized(func.coalesce(catalog.c.title, "")),
        *(part for field in CONTENT_FIELDS
          for part in (" ", _normalized(_json_text(source, "$.fields." + field)))),
        *(part for field in EDITORIAL_FIELDS
          for part in (" ", _normalized(_json_text(catalog.c.draft_json,
                                                 "$.editorial." + field)))),
    )
    expressions = ([organization] if scope == "organization" else
                   [content] if scope == "content" else [organization, content])
    return [or_(*(expression.contains(alias, autoescape=True)
                  for expression in expressions for alias in aliases))
            for aliases in terms]
