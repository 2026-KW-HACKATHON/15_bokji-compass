"""Display recorded applicant conditions without treating age as the whole audience."""


def known_section(overview, name):
    section = overview.get(name) or {}
    if section.get("status") in {"specified", "unrestricted"}:
        return (section.get("text") or "").strip()
    return ""


def other_conditions(fields, overview):
    """Keep summaries, or show recorded requirements when an old summary omitted them."""
    items = [item["text"].strip() for item in overview.get("other_conditions", [])
             if item.get("text") and item["text"].strip()]
    if not items:
        items = [item["evidence_text"].strip()
                 for item in overview.get("policy_requirements", [])
                 if item.get("condition_type") == "other"
                 and item.get("information_state") in {"specified", "unrestricted"}
                 and (item.get("evidence_text") or "").strip()]
    if not items:
        items = [(fields.get(name) or "").strip() for name in ("eligibility", "selection")]
    return list(dict.fromkeys(item for item in items if item))


def audience_text(fields, overview, editorial=None):
    """Return the stated audience, preserving explicit administrator display edits."""
    age = known_section(overview, "age_conditions")
    if (editorial or {}).get("age") and age:
        return age
    eligibility = (fields.get("eligibility") or "").strip()
    if eligibility:
        return eligibility
    if age:
        return age
    # Legacy overviews can retain a target only in other_conditions or SQL rows.
    targets = [item["text"].strip() for item in overview.get("other_conditions", [])
               if item.get("text") and any(e.get("source_field") == "eligibility"
                                          for e in item.get("evidence", []))]
    if not targets:
        targets = [item["evidence_text"].strip()
                   for item in overview.get("policy_requirements", [])
                   if item.get("information_state") in {"specified", "unrestricted"}
                   and (item.get("evidence_text") or "").strip()]
    return "\n".join(dict.fromkeys(targets)) or "지원 대상 확인 필요"
