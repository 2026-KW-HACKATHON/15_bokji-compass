"""Published read model. Filters and pagination run in MySQL, never in the LLM."""

from datetime import date

from sqlalchemy import and_, func, or_, select

from app.modules.presentation.public import format_notice_text, payment_schedule
from app.modules.storage.application_dates import (
    application_schedule,
    resolved_application_period,
)

# UI labels differ from the names used in published overview text. Do not expand
# these to bare district names: e.g. both Seoul and Busan have a Gangseo-gu.
REGION_NAMES = {
    "서울": ("서울특별시", "서울시"),
    "경기": ("경기도",),
    "인천": ("인천광역시", "인천시"),
    "부산": ("부산광역시", "부산시"),
    "대구": ("대구광역시", "대구시"),
    "광주": ("광주광역시",),
    "대전": ("대전광역시", "대전시"),
    "울산": ("울산광역시", "울산시"),
    "세종": ("세종특별자치시", "세종시"),
    "강원": ("강원특별자치도", "강원도"),
    "충북": ("충청북도",),
    "충남": ("충청남도",),
    "전북": ("전북특별자치도", "전라북도"),
    "전남": ("전라남도",),
    "경북": ("경상북도",),
    "경남": ("경상남도",),
    "제주": ("제주특별자치도", "제주도", "제주시", "서귀포시"),
}
AUDIENCE_TERMS = {
    "청년": ("청년",),
    "가족": ("가족", "가구", "부모", "자녀", "아동", "영유아", "신혼", "한부모", "양육", "출산"),
    "어르신": ("어르신", "노인", "고령", "시니어"),
}


def region_matches(text, region):
    # Short province labels must be standalone; '광주' must not match 경기 광주시.
    if region in REGION_NAMES:
        return or_(
            text.regexp_match(r"(^|[^가-힣])" + region + r"([^가-힣]|$)"),
            *(text.contains(name, autoescape=True) for name in REGION_NAMES[region]),
        )
    return text.contains(region, autoescape=True)


def published_catalog(repository):
    documents = repository.tables["condition_documents"]
    details = repository.tables["policy_revision_details"]
    ranked = (
        select(
            documents.c.policy_key,
            documents.c.revision_id,
            documents.c.created_at,
            documents.c.source_json,
            details.c.draft_json,
            details.c.title,
            details.c.category,
            func.row_number()
            .over(
                partition_by=documents.c.policy_key,
                order_by=(documents.c.created_at.desc(), documents.c.revision_id.desc()),
            )
            .label("position"),
        )
        .join(details, details.c.revision_id == documents.c.revision_id)
        .where(documents.c.review_status == "published")
        .subquery()
    )
    return select(ranked).where(ranked.c.position == 1).subquery()


def json_text(column, path):
    return func.coalesce(
        func.nullif(func.json_unquote(func.json_extract(column, path)), "null"), ""
    )


def card(record):
    source = record["source_json"]
    fields = source["fields"]
    overview = record["draft_json"].get("overview") or {}

    def section(name, fallback):
        value = overview.get(name) or {}
        return (
            value.get("text")
            if value.get("status") in {"specified", "unrestricted"} and value.get("text")
            else fallback
        )

    category = record["category"] or "기타"
    period = resolved_application_period(fields, overview)
    return {
        "id": record["policy_key"],
        "revisionId": record["revision_id"],
        "title": source["title"],
        "organization": source["organization"],
        "summary": format_notice_text(section(
            "benefits", fields.get("purpose_summary") or fields.get("benefits")
            or "지원 내용 확인 필요")),
        "benefit": format_notice_text(section("benefits", fields.get("benefits")
                                               or "지원 내용 확인 필요")),
        "region": format_notice_text(section("region_conditions", "지역 확인 필요")),
        "audience": format_notice_text(section("age_conditions", "지원 대상 확인 필요")),
        "paymentSchedule": payment_schedule(fields),
        "applicationPeriod": period or "공식 공고에서 확인",
        **application_schedule(period),
        "date": record["created_at"].date().isoformat(),
        "sourceUrl": source["source_url"],
        "category": category,
        "tags": [category],
    }


def filtered_catalog(repository, *, q="", category="", region="", audience="", tag=""):
    catalog = published_catalog(repository)
    query = select(catalog)
    search = func.concat(
        catalog.c.title,
        " ",
        json_text(catalog.c.source_json, "$.organization"),
        " ",
        json_text(catalog.c.source_json, "$.fields"),
    )
    for term in q.split():
        query = query.where(search.contains(term, autoescape=True))
    for value in (category, tag):
        if value and value != "전체":
            query = query.where(func.coalesce(catalog.c.category, "기타") == value)
    if region and region != "전국":
        region_status = json_text(catalog.c.draft_json, "$.overview.region_conditions.status")
        query = query.where(
            or_(
                and_(
                    region_status == "specified",
                    region_matches(
                        json_text(catalog.c.draft_json, "$.overview.region_conditions.text"), region
                    ),
                ),
                region_status == "unrestricted",
            )
        )
    if audience and audience != "전체":
        age_status = json_text(catalog.c.draft_json, "$.overview.age_conditions.status")
        age_text = json_text(catalog.c.draft_json, "$.overview.age_conditions.text")
        # Household/parenting conditions belong to other_conditions, not age_conditions.
        other_text = json_text(catalog.c.draft_json, "$.overview.other_conditions[*].text")
        terms = AUDIENCE_TERMS.get(audience, (audience,))
        query = query.where(
            or_(
                and_(age_status.in_(("specified", "unrestricted")), or_(
                    *(age_text.contains(term, autoescape=True) for term in terms)
                )),
                or_(*(other_text.contains(term, autoescape=True) for term in terms)),
            )
        )
    return catalog, query


def list_policies(
    repository,
    *,
    limit=20,
    offset=0,
    sort="recent",
    q="",
    category="",
    region="",
    audience="",
    tag="",
):
    catalog, query = filtered_catalog(
        repository, q=q, category=category, region=region, audience=audience, tag=tag
    )
    order = (
        (catalog.c.title, catalog.c.policy_key)
        if sort == "name"
        else (catalog.c.created_at.desc(), catalog.c.policy_key)
    )
    with repository.engine.connect() as connection:
        # Both statements share MySQL's repeatable-read snapshot.
        total = connection.scalar(select(func.count()).select_from(query.subquery()))
        records = connection.execute(query.order_by(*order).limit(limit).offset(offset)).mappings()
        items = [card(row) for row in records]
    return {
        "items": items,
        "total": total,
        "nextCursor": str(offset + limit) if offset + limit < total else None,
    }


def list_calendar(repository, *, month, q="", category="", region="", audience=""):
    year, number = map(int, month.split("-"))
    first = date(year, number, 1).isoformat()
    following = date(year + (number == 12), number % 12 + 1, 1).isoformat()
    catalog, query = filtered_catalog(
        repository, q=q, category=category, region=region, audience=audience
    )
    items, undated = [], []
    total = undated_total = 0
    with repository.engine.connect() as connection:
        records = (
            connection.execution_options(yield_per=100)
            .execute(query.order_by(catalog.c.title, catalog.c.policy_key))
            .mappings()
        )
        for record in records:
            item = card(record)
            start, end = item["applicationStart"], item["applicationEnd"]
            if not start and not end:
                undated_total += 1
                if len(undated) < 25:
                    undated.append(item)
                continue
            overlaps = (
                (start < following and end >= first)
                if start and end
                else first <= (start or end) < following
            )
            if overlaps:
                total += 1
                if len(items) < 500:
                    items.append(item)
    return {
        "month": month,
        "items": items,
        "total": total,
        "truncated": total > len(items),
        "undatedItems": undated,
        "undatedTotal": undated_total,
    }


def get_policy(repository, policy_key):
    catalog = published_catalog(repository)
    with repository.engine.connect() as connection:
        row = (
            connection.execute(select(catalog).where(catalog.c.policy_key == policy_key))
            .mappings()
            .first()
        )
        return card(row) if row else None
