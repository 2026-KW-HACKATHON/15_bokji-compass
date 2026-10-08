"""Read-only totals deduplicate snapshots, saved revisions and collection identities."""

from sqlalchemy import Column, MetaData, String, Table, create_engine, insert

from app.modules.ingestion.models import metadata, records
from app.modules.server_admin.inventory import inventory_counts


def test_inventory_counts_policy_identities_not_revisions_or_jobs():
    engine = create_engine("sqlite://")
    metadata.create_all(engine)
    saved = MetaData()
    documents = Table("condition_documents", saved, Column("revision_id", String, primary_key=True),
                      Column("policy_key", String), Column("review_status", String))
    details = Table("policy_revision_details", saved,
                    Column("revision_id", String, primary_key=True))
    saved.create_all(engine)
    assert inventory_counts(engine) == {
        "available": True, "total": 0, "raw": 0, "analyzed": 0, "published": 0}
    with engine.begin() as connection:
        connection.execute(insert(records), [dict(policy_key=key, provider="gov24",
            external_id=key, last_seen_at=0, source_json=source) for key, source in (
                ("gov24:list-only", None), ("gov24:raw", {"fields": {}}),
                ("gov24:saved", {"fields": {}}))])
        connection.execute(insert(documents), [dict(revision_id=revision, policy_key=key,
            review_status=status) for revision, key, status in (
                ("v1", "gov24:saved", "published"), ("v2", "gov24:saved", "published"),
                ("v3", "gov24:saved", "draft"), ("v4", "notice:unindexed", "reviewed"))])
        connection.execute(insert(details), [{"revision_id": f"v{i}"} for i in range(1, 5)])
    assert inventory_counts(engine) == {
        "available": True, "total": 4, "raw": 3, "analyzed": 2, "published": 1}
    engine.dispose()
