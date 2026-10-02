"""Collection tables, also used by isolated SQLite tests; production uses MySQL only."""

from sqlalchemy import JSON, Column, Float, Integer, MetaData, String, Table, UniqueConstraint

metadata = MetaData()
json_type = JSON(none_as_null=True)
state = Table("collection_state", metadata,
    Column("state_key", String(100), primary_key=True),
    Column("payload", json_type, nullable=False),
    Column("lease_token", String(36)), Column("lease_until", Float, nullable=False, default=0))
records = Table("collection_records", metadata,
    Column("policy_key", String(255), primary_key=True),
    Column("provider", String(40), nullable=False),
    Column("external_id", String(255), nullable=False),
    Column("url_hash", String(64)),
    Column("listing_json", json_type), Column("listing_hash", String(64)),
    Column("snapshot_id", String(36)), Column("content_hash", String(64)),
    Column("source_json", json_type), Column("conditions_json", json_type),
    Column("last_seen_at", Float, nullable=False), Column("last_checked_at", Float),
    Column("next_check_at", Float, nullable=False, default=0),
    Column("revision_id", String(36)),
    UniqueConstraint("provider", "external_id", name="uq_collection_record_identity"))
snapshots = Table("collection_snapshots", metadata,
    Column("snapshot_id", String(36), primary_key=True),
    Column("policy_key", String(255), nullable=False),
    Column("content_hash", String(64), nullable=False),
    Column("raw_hash", String(64), nullable=False),
    Column("source_json", json_type, nullable=False), Column("raw_json", json_type, nullable=False),
    Column("raw_path", String(255)), Column("previous_snapshot_id", String(36)),
    Column("changed_fields", json_type, nullable=False),
    Column("observed_at", Float, nullable=False))
jobs = Table("collection_jobs", metadata,
    Column("job_id", String(36), primary_key=True),
    Column("work_key", String(64), nullable=False, unique=True),
    Column("kind", String(20), nullable=False), Column("policy_key", String(255), nullable=False),
    Column("payload", json_type, nullable=False), Column("status", String(20), nullable=False),
    Column("priority", Integer, nullable=False, default=20),
    Column("attempts", Integer, nullable=False, default=0),
    Column("next_attempt_at", Float, nullable=False), Column("lease_token", String(36)),
    Column("lease_until", Float, nullable=False, default=0),
    Column("checkpoint", json_type), Column("run_id", String(36)),
    Column("revision_id", String(36)), Column("error_code", String(80)),
    Column("created_at", Float, nullable=False), Column("updated_at", Float, nullable=False))
usage = Table("collection_usage", metadata,
    Column("provider", String(40), primary_key=True), Column("day", String(10), primary_key=True),
    Column("calls", Integer, nullable=False, default=0))
candidates = Table("collection_candidates", metadata,
    Column("candidate_id", String(64), primary_key=True),
    Column("url", String(2048), nullable=False),
    Column("candidate_json", json_type, nullable=False),
    Column("status", String(24), nullable=False),
    Column("possible_matches", json_type, nullable=False),
    Column("first_seen_at", Float, nullable=False), Column("last_seen_at", Float, nullable=False))
