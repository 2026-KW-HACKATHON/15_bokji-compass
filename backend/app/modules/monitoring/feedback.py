"""Explicit personal recommendation preferences; never infer eligibility or profile facts."""

import re

REASONS = frozenset({"not_eligible", "not_interested"})
STOP_WORDS = {"지원", "사업", "공고", "안내", "신청", "대상", "센터", "제공", "서비스"}


def topic_tokens(policy):
    words = re.findall(r"[가-힣a-z0-9]{2,}", policy.get("title", "").lower())
    tokens = set()
    for word in words:
        root = re.sub(r"(?:지원|사업|센터)$", "", word)
        tokens.update(value for value in (word, root)
                      if len(value) >= 2 and value not in STOP_WORDS)
    return sorted(tokens)


def preference_penalty(policy, feedback):
    """Interest feedback lowers similar topics; eligibility feedback only excludes that notice."""
    tokens = set(topic_tokens(policy))
    penalties = []
    for item in feedback:
        if item["reason"] != "not_interested":
            continue
        prior = set(item.get("tokens", []))
        same_category = bool(item.get("category") and item["category"] == policy.get("category"))
        overlap = len(tokens & prior) / max(len(tokens | prior), 1)
        penalties.append((2 if same_category else 0) + 8 * overlap)
    return max(penalties, default=0)


def personalize(items, feedback):
    """Stable reranking before a result limit; exclusions span topics and revisions."""
    excluded = {item["policy_id"] for item in feedback}
    remaining = [item for item in items
                 if item.get("policy_id", item["policy"].get("id")) not in excluded]
    return sorted(remaining, key=lambda item: preference_penalty(item["policy"], feedback))
