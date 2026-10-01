"""Published read model. Filters and pagination run in MySQL, never in the LLM."""

from sqlalchemy import and_, func, or_, select


def published_catalog(repository):
    documents = repository.tables["condition_documents"]
    details = repository.tables["policy_revision_details"]
    ranked = select(
        documents.c.policy_key, documents.c.revision_id, documents.c.created_at,
        documents.c.source_json, details.c.draft_json, details.c.title, details.c.category,
        func.row_number().over(partition_by=documents.c.policy_key, order_by=(
            documents.c.created_at.desc(), documents.c.revision_id.desc())).label("position"),
    ).join(details, details.c.revision_id == documents.c.revision_id).where(
        documents.c.review_status == "published").subquery()
    return select(ranked).where(ranked.c.position == 1).subquery()


def json_text(column, path):
    return func.coalesce(func.nullif(func.json_unquote(func.json_extract(column, path)),
                                   "null"), "")


def card(record):
    source = record["source_json"]
    fields = source["fields"]
    overview = record["draft_json"].get("overview") or {}

    def section(name, fallback):
        value = overview.get(name) or {}
        return value.get("text") if value.get("status") in {
            "specified", "unrestricted"} and value.get("text") else fallback

    category = record["category"] or "기타"
    return {
        "id": record["policy_key"], "revisionId": record["revision_id"],
        "title": source["title"], "organization": source["organization"],
        "summary": fields.get("purpose_summary") or section("benefits", "지원 내용 확인 필요"),
        "benefit": section("benefits", fields.get("benefits") or "지원 내용 확인 필요"),
        "region": section("region_conditions", "지역 확인 필요"),
        "audience": section("age_conditions", "지원 대상 확인 필요"),
        "applicationPeriod": fields.get("application_period") or "공식 공고에서 확인",
        "date": record["created_at"].date().isoformat(),
        "sourceUrl": source["source_url"], "category": category, "tags": [category],
    }


def list_policies(repository, *, limit=20, offset=0, sort="recent", q="", category="",
                  region="", audience="", tag=""):
    catalog = published_catalog(repository)
    query = select(catalog)
    search = func.concat(catalog.c.title, " ",
                         json_text(catalog.c.source_json, "$.organization"), " ",
                         json_text(catalog.c.source_json, "$.fields"))
    for term in q.split():
        query = query.where(search.contains(term, autoescape=True))
    for value in (category, tag):
        if value and value != "전체":
            query = query.where(func.coalesce(catalog.c.category, "기타") == value)
    if region and region != "전국":
        region_status = json_text(catalog.c.draft_json, "$.overview.region_conditions.status")
        query = query.where(or_(
            and_(region_status == "specified",
                 json_text(catalog.c.draft_json, "$.overview.region_conditions.text").contains(
                     region, autoescape=True)),
            region_status == "unrestricted",
        ))
    if audience and audience != "전체":
        query = query.where(json_text(catalog.c.draft_json,
            "$.overview.age_conditions.text").contains(audience, autoescape=True))
    order = ((catalog.c.title, catalog.c.policy_key) if sort == "name" else
             (catalog.c.created_at.desc(), catalog.c.policy_key))
    with repository.engine.connect() as connection:
        # Both statements share MySQL's repeatable-read snapshot.
        total = connection.scalar(select(func.count()).select_from(query.subquery()))
        records = connection.execute(query.order_by(*order).limit(limit).offset(offset)).mappings()
        items = [card(row) for row in records]
    return {"items": items, "total": total,
            "nextCursor": str(offset + limit) if offset + limit < total else None}


def get_policy(repository, policy_key):
    catalog = published_catalog(repository)
    with repository.engine.connect() as connection:
        row = connection.execute(select(catalog).where(
            catalog.c.policy_key == policy_key)).mappings().first()
        return card(row) if row else None
