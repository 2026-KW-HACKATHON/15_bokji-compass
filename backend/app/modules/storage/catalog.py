"""Published read model. Filters and pagination run in MySQL, never in the LLM."""

from datetime import date

from sqlalchemy import and_, func, or_, select

from app.modules.storage.application_dates import (
    application_period,
    application_schedule,
    resolved_application_period,
)


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


def raw_document_card(record):
    text = record["text"]
    period = application_period({"text": text})
    schedule = application_schedule(period)
    published_at = record["published_at"]
    collected_at = record["collected_at"]
    date_value = published_at or (collected_at[:10] if collected_at else "")
    category = "생활·금융"
    summary = " ".join(text.split())[:320] or "광운대학교 공지사항"
    return {
        "id": f"kwangwoon:{record['document_id']}",
        "revisionId": None,
        "title": record["title"],
        "organization": "광운대학교",
        "summary": summary,
        "benefit": text or "공식 공고에서 확인해 주세요.",
        "region": "지역 확인 필요",
        "audience": "지원 대상 확인 필요",
        "applicationPeriod": period or "공식 공고에서 확인",
        **schedule,
        "date": date_value,
        "sourceUrl": record["source_url"],
        "category": category,
        "tags": [category],
    }


def raw_document_cards(
    repository, connection, *, q="", category="", region="", audience="", tag=""
):
    table = repository.tables["raw_documents"]
    statement = select(table).where(table.c.source_url.contains("DUID="))
    documents = connection.execute(statement).mappings()
    terms = q.casefold().split()
    if region and region != "전국":
        return []
    if audience and audience != "전체":
        return []
    if category and category not in {"전체", "생활·금융"}:
        return []
    if tag and tag not in {"전체", "생활·금융"}:
        return []
    cards = []
    for document in documents:
        searchable = " ".join(
            (document["title"], "광운대학교", document["text"])
        ).casefold()
        if all(term in searchable for term in terms):
            cards.append(raw_document_card(document))
    return cards


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
        policy_total = connection.scalar(
            select(func.count()).select_from(query.subquery())
        )
        records = connection.execute(
            query.order_by(*order).limit(offset + limit)
        ).mappings()
        items = [card(row) for row in records]
        raw_items = raw_document_cards(
            repository,
            connection,
            q=q,
            category=category,
            region=region,
            audience=audience,
            tag=tag,
        )
        items.extend(raw_items)
    if sort == "name":
        items.sort(key=lambda item: (item["title"].casefold(), item["id"]))
    else:
        items.sort(key=lambda item: item["id"])
        items.sort(key=lambda item: item["date"], reverse=True)
    total = policy_total + len(raw_items)
    items = items[offset : offset + limit]
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
        policies = [card(record) for record in records]
        policies.extend(
            raw_document_cards(
                repository,
                connection,
                q=q,
                category=category,
                region=region,
                audience=audience,
            )
        )
        for item in policies:
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
    if policy_key.startswith("kwangwoon:"):
        document_id = policy_key.removeprefix("kwangwoon:")
        table = repository.tables["raw_documents"]
        with repository.engine.connect() as connection:
            row = (
                connection.execute(
                    select(table).where(table.c.document_id == document_id)
                )
                .mappings()
                .first()
            )
            if row and "DUID=" in row["source_url"]:
                return raw_document_card(row)
        return None

    catalog = published_catalog(repository)
    with repository.engine.connect() as connection:
        row = (
            connection.execute(select(catalog).where(catalog.c.policy_key == policy_key))
            .mappings()
            .first()
        )
        return card(row) if row else None
