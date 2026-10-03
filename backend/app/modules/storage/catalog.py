"""Published read model. Filters and pagination run in MySQL, never in the LLM."""

from datetime import date

from sqlalchemy import and_, func, or_, select

from app.modules.storage.application_dates import application_period, application_schedule


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
    period = application_period(fields)
    return {
        "id": record["policy_key"],
        "revisionId": record["revision_id"],
        "title": source["title"],
        "organization": source["organization"],
        "summary": fields.get("purpose_summary") or section(
            "benefits", fields.get("benefits") or "지원 내용 확인 필요"),
        "benefit": section("benefits", fields.get("benefits") or "지원 내용 확인 필요"),
        "region": section("region_conditions", "지역 확인 필요"),
        "audience": section("age_conditions", "지원 대상 확인 필요"),
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
                    json_text(catalog.c.draft_json, "$.overview.region_conditions.text").contains(
                        region, autoescape=True
                    ),
                ),
                region_status == "unrestricted",
            )
        )
    if audience and audience != "전체":
        query = query.where(
            json_text(catalog.c.draft_json, "$.overview.age_conditions.text").contains(
                audience, autoescape=True
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
