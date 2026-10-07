"""Read-time category projection for older broad finance classifications.

The stored extraction and source evidence stay unchanged. Personal benefits
and administrator category choices take precedence over these conservative
rules. The Python and SQL paths intentionally share fields and indicators.
"""

from sqlalchemy import and_, case, func, or_

from app.contracts.categories import POLICY_DISPLAY_CATEGORIES

FALLBACK_CATEGORIES = ("생활·금융", "기타")
AGRICULTURE_CATEGORY = "농림축산·어업"
BUSINESS_CATEGORY = "사업·창업"
# Avoid bare '농촌', '산림' and organization names: they can describe a place
# or issuing ministry for unrelated family, education and care benefits.
AGRICULTURE_TERMS = (
    "농업", "농축산", "농림", "농가", "농민", "농지", "농기계", "농자재", "농작물", "농식품",
    "농산물", "영농", "귀농", "귀촌", "귀산촌", "청년농", "축산", "축사", "가축", "한우",
    "양돈", "낙농", "임업", "임산물", "산림경영", "산림사업", "폐비닐", "어업", "어민",
    "어선", "숲가꾸기", "임도지원", "목재", "화훼", "특용작물", "인삼",
    "쌀가공", "꿀가공", "과수", "과실브랜드", "과실전문", "과실생산",
    "어촌", "양식업", "양식어업", "수산물", "수산식품", "수산장비", "수산자원",
    "수산업경영", "수산양식", "수산분야", "수산경영", "수산인",
    "산림 경영", "산림 사업", "임도 지원", "쌀 가공", "꿀 가공", "과실 브랜드",
    "과실 전문", "과실 생산",
)
BUSINESS_TERMS = (
    "창업", "소상공인", "기업", "자영업", "전통시장", "사업자", "사업주", "사업체",
    "경영안정", "판로지원", "수출지원", "스타트업", "경영 안정", "판로 지원", "수출 지원",
)
PERSONAL_BENEFIT_TERMS = (
    "장학", "학자금", "교육", "학비", "보육", "주택", "주거", "월세", "전세",
    "건강", "진료", "의료", "돌봄", "출산", "양육", "복지", "재활", "취업", "구직",
    "일자리", "고용", "근로", "실업", "채용", "내일채움", "일학습", "학습기업", "어린이집", "양성",
    "페이백", "직업훈련", "생계비", "소년소녀", "생활안정", "대지급금", "주민지원", "사회보험",
    "직업 훈련", "생활 안정", "주민 지원", "사회 보험",
)
# Full text often quotes other programs, contact offices and exceptions.
# Restrict automatic domain inference to the actual subject and support.
SOURCE_FIELDS = ("purpose_summary", "benefits")
# An explicit industry restriction can identify an agricultural startup whose
# title is generic. Other audience lists often include unrelated occupations.
AGRICULTURE_INDUSTRY_TERMS = ("농림축산식품업종", "농림축산식품분야")
WHITESPACE = (" ", "\t", "\r", "\n")


def _compact(value):
    for whitespace in WHITESPACE:
        value = value.replace(whitespace, "")
    return value


def _source_text(value):
    for whitespace in WHITESPACE[1:]:
        value = value.replace(whitespace, " ")
    return value


def effective_category(record) -> str:
    """Return a display domain without modifying the source or stored revision."""
    source = record.get("source_json") or {}
    fields = source.get("fields") or {}
    draft = record.get("draft_json") or {}
    overview = draft.get("overview") or {}
    category = record.get("category") or overview.get("category") or "기타"
    manual = fields.get("_editor_category")
    if manual in POLICY_DISPLAY_CATEGORIES:
        return manual
    if manual or overview.get("category_reason") == "관리자 분류 수정":
        return category
    if category in (AGRICULTURE_CATEGORY, BUSINESS_CATEGORY):
        return category
    title = _source_text(source.get("title") or record.get("title") or "")
    # These combined settlement programs fund agricultural startup and housing.
    if "창업" in title and "주택" in title and any(term in title for term in ("귀농", "귀산촌")):
        return AGRICULTURE_CATEGORY
    if any(term in title for term in PERSONAL_BENEFIT_TERMS):
        return category
    if any(term in title for term in AGRICULTURE_TERMS):
        return AGRICULTURE_CATEGORY
    industry = _compact(fields.get("eligibility") or "")
    if category in FALLBACK_CATEGORIES and any(
            term in industry for term in AGRICULTURE_INDUSTRY_TERMS):
        return AGRICULTURE_CATEGORY
    if any(term in title for term in BUSINESS_TERMS):
        return BUSINESS_CATEGORY
    if category not in FALLBACK_CATEGORIES:
        return category
    subject = _source_text("|".join([
        *(fields.get(name) or "" for name in SOURCE_FIELDS),
    ]))
    if any(term in subject for term in AGRICULTURE_TERMS):
        return AGRICULTURE_CATEGORY
    if any(term in subject for term in BUSINESS_TERMS):
        return BUSINESS_CATEGORY
    return category


def _json_text(column, path):
    return func.coalesce(
        func.nullif(func.json_unquote(func.json_extract(column, path)), "null"), ""
    )


def effective_category_expression(catalog):
    """SQL counterpart used before filtering/counting/pagination in the catalog.

    ``catalog`` must expose category, title, source_json and draft_json columns.
    Uses the catalog's existing MySQL JSON/concat functions (SQLite tests register
    the same compatibility functions). Returns an unlabelled SQL expression.
    """
    source, draft = catalog.c.source_json, catalog.c.draft_json
    base = func.coalesce(catalog.c.category,
        func.nullif(_json_text(draft, "$.overview.category"), ""), "기타")
    manual = _json_text(source, "$.fields._editor_category")
    reason = _json_text(draft, "$.overview.category_reason")
    title = func.coalesce(func.nullif(_json_text(source, "$.title"), ""), catalog.c.title, "")
    subject = func.concat(_json_text(source, "$.fields.purpose_summary"), "|",
                          _json_text(source, "$.fields.benefits"))
    industry = _json_text(source, "$.fields.eligibility")
    for whitespace in WHITESPACE[1:]:
        title = func.replace(title, whitespace, " ")
        subject = func.replace(subject, whitespace, " ")
    for whitespace in WHITESPACE:
        industry = func.replace(industry, whitespace, "")
    eligible = base.in_(FALLBACK_CATEGORIES)
    personal = or_(*(title.contains(term, autoescape=True) for term in PERSONAL_BENEFIT_TERMS))
    settlement = and_(title.contains("창업"), title.contains("주택"),
                     or_(title.contains("귀농"), title.contains("귀산촌")))
    title_agriculture = or_(*(title.contains(term, autoescape=True) for term in AGRICULTURE_TERMS))
    title_business = or_(*(title.contains(term, autoescape=True) for term in BUSINESS_TERMS))
    agriculture = or_(*(subject.contains(term, autoescape=True) for term in AGRICULTURE_TERMS))
    business = or_(*(subject.contains(term, autoescape=True) for term in BUSINESS_TERMS))
    agricultural_industry = or_(
        *(industry.contains(term, autoescape=True) for term in AGRICULTURE_INDUSTRY_TERMS))
    return case(
        (manual.in_(POLICY_DISPLAY_CATEGORIES), manual),
        (or_(manual != "", reason == "관리자 분류 수정"), base),
        (base.in_((AGRICULTURE_CATEGORY, BUSINESS_CATEGORY)), base),
        (settlement, AGRICULTURE_CATEGORY),
        (personal, base),
        (title_agriculture, AGRICULTURE_CATEGORY),
        (and_(eligible, agricultural_industry), AGRICULTURE_CATEGORY),
        (title_business, BUSINESS_CATEGORY),
        (and_(eligible, agriculture), AGRICULTURE_CATEGORY),
        (and_(eligible, business), BUSINESS_CATEGORY),
        else_=base,
    )
