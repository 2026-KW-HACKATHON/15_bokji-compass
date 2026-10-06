"""Count held policies once per identity, independently of revision and job counts."""

from sqlalchemy import column, func, select, table

from app.modules.ingestion.models import records


def inventory_counts(engine):
    documents = table("condition_documents", column("revision_id"), column("policy_key"),
                      column("review_status"))
    details = table("policy_revision_details", column("revision_id"))
    held = select(records.c.policy_key).union(select(documents.c.policy_key)).subquery()
    raw = select(records.c.policy_key).where(records.c.source_json.is_not(None)).union(
        select(documents.c.policy_key)).subquery()
    stored = documents.join(details, documents.c.revision_id == details.c.revision_id)
    query = select(
        select(func.count()).select_from(held).scalar_subquery().label("total"),
        select(func.count()).select_from(raw).scalar_subquery().label("raw"),
        select(func.count(func.distinct(documents.c.policy_key))).select_from(stored)
            .scalar_subquery().label("analyzed"),
        select(func.count(func.distinct(documents.c.policy_key))).select_from(stored)
            .where(documents.c.review_status == "published")
            .scalar_subquery().label("published"),
    )
    with engine.connect() as connection:
        return {"available": True, **dict(connection.execute(query).mappings().one())}
