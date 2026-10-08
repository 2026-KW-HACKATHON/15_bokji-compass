"""Official-name geography matches with quoted region scope, never guessed eligibility."""

import re

from app.modules.local_services.regions import PROVINCE_ALIASES
from app.modules.regions.public import default_catalog


def regions_for_term(term):
    catalog = default_catalog()
    parts = term.split()
    if not parts:
        return ()
    parts[0] = next((name for name, alias in PROVINCE_ALIASES.items()
                     if alias == parts[0] and catalog.resolve(name).region is not None), parts[0])
    resolution = catalog.resolve(" ".join(parts))
    return resolution.candidates if resolution.status in {"resolved", "ambiguous"} else ()


def region_evidence(record, term, facts):
    """A district-wide service can answer a neighborhood query with its district citation."""
    requested = regions_for_term(term)
    if not requested:
        return None
    section = (record.get("draft_json", {}).get("overview") or {}).get("region_conditions")
    if not section or section.get("status") != "specified":
        return None
    for scope in re.split(r"[/,;\n]", section.get("text") or ""):
        names = list(regions_for_term(scope))
        if not names:
            names = [name for token in scope.split() for name in regions_for_term(token)]
        if not names:
            continue
        # If a neighborhood is stated, its district token cannot make it district-wide.
        depth = max(len(name.name.split()) for name in names)
        areas = [name for name in names if len(name.name.split()) == depth]
        if not any(query.name == area.name or query.name.startswith(area.name + " ")
                   for area in areas for query in requested):
            continue
        for proof in section.get("evidence") or []:
            quote = proof.get("quote")
            if not isinstance(quote, str) or not quote:
                continue
            for fact in facts:
                if proof.get("source_field") == fact.field and quote in fact.text:
                    return 12, {"field": fact.field, "quote": quote[:250]}
    return None
