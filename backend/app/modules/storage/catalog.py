"""Published read model. Filters and pagination run in MySQL, never in the LLM."""

from datetime import date

from sqlalchemy import JSON, String, and_, func, inspect, literal, or_, select

from app.modules.ingestion.models import records as collection_records
from app.modules.ingestion.popularity import listing_popularity, view_count_expression
from app.modules.presentation.public import format_notice_text, payment_schedule, policy_description
from app.modules.storage.application_dates import (
    application_schedule,
    resolved_application_period,
)
from app.modules.storage.categories import effective_category, effective_category_expression

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


def with_popularity(catalog, connection):
    # Older local schemas may have only policy tables. Do not initialize collection
    # tables on a public read or conceal failures when an existing table is broken.
    if not inspect(connection).has_table(collection_records.name):
        return select(
            catalog,
            literal(None, String).label("popularity_provider"),
            literal(None, JSON).label("popularity_listing"),
            literal(None).label("views"),
        ).subquery()
    return select(
        catalog,
        collection_records.c.provider.label("popularity_provider"),
        collection_records.c.listing_json.label("popularity_listing"),
        view_count_expression(collection_records, dialect=connection.dialect.name).label("views"),
    ).outerjoin(collection_records,
                collection_records.c.policy_key == catalog.c.policy_key).subquery()


def card(record, *, full=False):
    source = record["source_json"]
    fields = source["fields"]
    overview = record["draft_json"].get("overview") or {}
    editorial = record["draft_json"].get("editorial") or {}

    def section(name, fallback):
        value = overview.get(name) or {}
        return (
            value.get("text")
            if value.get("status") in {"specified", "unrestricted"} and value.get("text")
            else fallback
        )

    category = effective_category(record)
    period = resolved_application_period(fields, overview)
    return {
        "id": record["policy_key"],
        "revisionId": record["revision_id"],
        "title": source["title"],
        "organization": source["organization"],
        "summary": editorial.get("summary") or policy_description(
            source["title"], fields.get("purpose_summary"),
            section("benefits", fields.get("benefits") or "지원 내용 확인 필요")),
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
        "popularity": listing_popularity(record.get("popularity_provider"),
                                         record.get("popularity_listing")),
        "content": (fields.get("text") or fields.get("eligibility") or "") if full else "",
        "gender": format_notice_text(section("gender_conditions", "")),
        "otherConditions": [format_notice_text(x["text"])
                            for x in overview.get("other_conditions", [])],
        **{name: format_notice_text(section(field, fields.get(field) or ""))
           for name, field in (("applicationMethod", "application_method"),
                               ("contact", "contact"))},
        "applicationUrl": section("application_url", fields.get("application_url") or None),
        "sourceFields": {key: value for key, value in fields.items()
                         if value and not key.startswith("_editor_")} if full else {},
        "publishedDate": section("published_date", fields.get("published_date") or ""),
        "modifiedDate": section("modified_date", fields.get("modified_date") or ""),
    }


def filtered_catalog(repository, *, q="", category="", region="", audience="", tag="",
                     connection=None):
    catalog = published_catalog(repository)
    if connection is not None:
        catalog = with_popularity(catalog, connection)
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
            query = query.where(effective_category_expression(catalog) == value)
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
    sort="popular",
    q="",
    category="",
    region="",
    audience="",
    tag="",
):
    with repository.engine.connect() as connection:
        catalog, query = filtered_catalog(
            repository, q=q, category=category, region=region, audience=audience, tag=tag,
            connection=connection,
        )
        recent = (catalog.c.created_at.desc(), catalog.c.policy_key)
        order = ((catalog.c.title, catalog.c.policy_key) if sort == "name" else recent)
        if sort == "popular":
            # A measured zero precedes an unknown count. Deterministic ties keep
            # offset pagination stable while the underlying catalog is unchanged.
            order = (catalog.c.views.is_not(None).desc(), catalog.c.views.desc(), *recent)
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
    items, undated = [], []
    total = undated_total = 0
    with repository.engine.connect() as connection:
        catalog, query = filtered_catalog(
            repository, q=q, category=category, region=region, audience=audience,
            connection=connection,
        )
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
    with repository.engine.connect() as connection:
        catalog = with_popularity(published_catalog(repository), connection)
        row = (
            connection.execute(select(catalog).where(catalog.c.policy_key == policy_key))
            .mappings()
            .first()
        )
        return card(row, full=True) if row else None
