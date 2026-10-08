"""MySQL statement regressions that do not need a database connection."""

from sqlalchemy import Boolean, Column, Date, MetaData, String, Table, Text
from sqlalchemy.dialects.mysql import dialect

from app.modules.storage.repository import _legacy_policy_upsert


def test_legacy_review_compares_original_source_before_mysql_replaces_it():
    policies = Table(
        "policies", MetaData(),
        Column("source_key", String(255)), Column("title", String(1000)),
        Column("organization", String(1000)), Column("source_url", Text),
        Column("source_text", Text), Column("application_start", Date),
        Column("application_end", Date), Column("review_status", String(20)),
        Column("is_synthetic", Boolean),
    )
    statement = _legacy_policy_upsert(policies, {
        "source_key": "notice:review-order", "title": "Example",
        "organization": "Example", "source_url": "https://example.test/notice",
        "source_text": '{"title": "Example"}', "review_status": "draft",
        "is_synthetic": False,
    })
    updates = str(statement.compile(dialect=dialect())).split("ON DUPLICATE KEY UPDATE ")[1]
    assert updates.startswith("review_status = CASE WHEN ")
    assert updates.index("review_status = ") < updates.index("source_text = VALUES(source_text)")
    assert "CAST(policies.source_text AS BINARY)" in updates
    assert "CAST(VALUES(source_text) AS BINARY)" in updates
