"""Shared policy domains for parsing, recommendations and administrator edits."""

from typing import Literal, get_args

PolicyCategory = Literal[
    "생활·금융", "주거", "일자리", "교육", "건강·돌봄", "문화", "농림축산·어업", "사업·창업",
]
PolicyDisplayCategory = Literal[PolicyCategory, "기타"]

POLICY_CATEGORIES = get_args(PolicyCategory)
POLICY_DISPLAY_CATEGORIES = get_args(PolicyDisplayCategory)
