"""Seed commands are fenced using fake CLI dependencies and in-memory SQLite only."""

import json
import time
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import (
    JSON,
    Column,
    Float,
    MetaData,
    String,
    Table,
    create_engine,
    delete,
    insert,
    select,
)

from app.core.config import Settings
from app.modules.ingestion import __main__ as cli
from app.modules.ingestion import models as m
from app.modules.ingestion import repository as ingestion_repository
from app.modules.ingestion.repository import IngestionRepository, LeaseLost
from app.modules.normalization.raw import normalize_record


@pytest.mark.parametrize("outcome", ["success", "busy", "failure"])
def test_seed_cli_acquires_after_signature_and_releases_only_owned_lease(
        monkeypatch, capsys, outcome):
    events = []
    engine, repository, policy_repository = Mock(), Mock(), Mock()
    settings = Settings(_env_file=None, db_enabled=True, db_password="synthetic-only",
                        ingestion_max_seconds=120)
    signature = {"hash": "synthetic-signature"}
    monkeypatch.setattr(cli, "load_settings", lambda: settings)
    monkeypatch.setattr(cli, "create_database_engine", lambda settings: engine)
    monkeypatch.setattr(cli, "IngestionRepository", lambda value: repository)
    monkeypatch.setattr(cli, "uuid4", lambda: "worker-token")
    monkeypatch.setattr(cli.time, "time", lambda: 100)

    def processing_signature(settings):
        events.append("signature")
        return signature

    def acquire_worker(*args):
        events.append("acquire")
        return outcome != "busy"

    def policy_store(value):
        events.append("policy_store")
        return policy_repository

    def seed_existing(*args, **kwargs):
        events.append("seed")
        if outcome == "failure":
            raise ValueError("synthetic seed rejection")
        return {"indexed": 1, "reused": 1, "complete": True}

    repository.acquire_worker.side_effect = acquire_worker
    repository.seed_existing.side_effect = seed_existing
    repository.release_worker.side_effect = lambda token: events.append("release")
    monkeypatch.setattr(cli, "processing_signature", processing_signature)
    monkeypatch.setattr(cli, "PolicyRepository", policy_store)
    assert cli.main(["seed-existing", "--limit", "1", "--adopt-legacy-results"]) == int(
        outcome == "failure")
    repository.acquire_worker.assert_called_once_with("worker-token", 100, 180)
    result = json.loads(capsys.readouterr().out)
    if outcome == "busy":
        assert result == {"status": "busy", "reason": "another_worker"}
        assert events == ["signature", "acquire"]
        repository.seed_existing.assert_not_called()
        repository.release_worker.assert_not_called()
    else:
        assert events == ["signature", "acquire", "policy_store", "seed", "release"]
        repository.seed_existing.assert_called_once_with(policy_repository, signature, 100,
            limit=1, adopt_legacy=True, worker_token="worker-token")
        repository.release_worker.assert_called_once_with("worker-token")
        assert result.get("status") == ("failed" if outcome == "failure" else None)
    engine.dispose.assert_called_once()


@pytest.fixture
def seeded_repository():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    m.metadata.create_all(engine)
    repository = IngestionRepository(engine, allow_sqlite_for_tests=True)
    metadata = MetaData()
    docs = Table("condition_documents", metadata, Column("revision_id", String, primary_key=True),
                 Column("policy_key", String), Column("created_at", Float))
    details = Table("policy_revision_details", metadata,
                    Column("revision_id", String, primary_key=True),
                    Column("draft_json", JSON), Column("processing_json", JSON))
    metadata.create_all(engine)
    with engine.begin() as c:
        c.execute(insert(docs).values(revision_id="synthetic-revision",
                                     policy_key="notice:synthetic", created_at=1))
        c.execute(insert(details).values(revision_id="synthetic-revision", draft_json={},
                                        processing_json={}))
    existing = SimpleNamespace(engine=engine, tables={
        "condition_documents": docs, "policy_revision_details": details})
    yield repository, existing
    engine.dispose()


@pytest.mark.parametrize("lost", ["expired", "replaced"])
def test_seed_rechecks_current_worker_lease_before_any_writes(
        seeded_repository, monkeypatch, lost):
    repository, existing = seeded_repository
    assert repository.acquire_worker("old-worker", 100, 50)
    if lost == "replaced":
        assert repository.acquire_worker("new-worker", 200, 1000)
    repository.set_state("existing_index", {"cursor": "", "complete": False})
    before_cursor = repository.get_state("existing_index")
    with repository.engine.connect() as c:
        before_worker = dict(c.execute(select(m.state).where(
            m.state.c.state_key == "worker")).mappings().one())
    monkeypatch.setattr(ingestion_repository.time, "time", lambda: 200)
    with pytest.raises(LeaseLost, match="expired"):
        # The originally supplied timestamp cannot keep an expired lease valid.
        repository.seed_existing(existing, {"hash": "signature"}, 110,
                                 worker_token="old-worker")
    assert repository.get_state("existing_index") == before_cursor
    with repository.engine.connect() as c:
        assert dict(c.execute(select(m.state).where(
            m.state.c.state_key == "worker")).mappings().one()) == before_worker
        for table in (m.records, m.snapshots, m.jobs):
            assert c.execute(select(table)).first() is None


def test_seed_all_commits_201_policies_and_reports_progress(seeded_repository):
    repository, existing = seeded_repository
    docs = existing.tables["condition_documents"]
    details = existing.tables["policy_revision_details"]
    with repository.engine.begin() as c:
        c.execute(delete(docs))
        c.execute(delete(details))
        for index in range(201):
            source = normalize_record({"document_id": str(index), "title": "합성 공고",
                                       "text": "별도 심사"})
            draft = {"schema_version": "welfare-parsing-v2", "source": source.model_dump(),
                "status": "pending", "processing_state": 8, "review_status": "draft",
                "matching_enabled": False, "analysis": None, "attempts": [],
                "overview": None, "overview_status": "not_run", "overview_attempts": []}
            c.execute(insert(docs).values(revision_id=str(index), policy_key=source.policy_key,
                                          created_at=1))
            c.execute(insert(details).values(revision_id=str(index), draft_json=draft,
                                             processing_json={}))
    assert repository.acquire_worker("seed-worker", time.time(), 60)
    progress = []
    result = repository.seed_all_existing(existing, {"hash": "current"},
                                          worker_token="seed-worker", progress=progress.append)
    assert result == {"indexed": 201, "reused": 0, "scanned": 201, "batches": 3, "complete": True}
    assert [item["scanned"] for item in progress] == [100, 200, 201]
    again = repository.seed_all_existing(existing, {"hash": "current"}, worker_token="seed-worker")
    assert again["scanned"] == again["indexed"] == 0 and again["complete"] is True


def test_seed_all_stops_when_worker_ownership_changes(seeded_repository, monkeypatch):
    repository, existing = seeded_repository
    assert repository.acquire_worker("old", 100, 60)
    monkeypatch.setattr(ingestion_repository.time, "time", lambda: 110)
    called = []
    def seed(*args, **kwargs):
        called.append(1)
        return {"indexed": 1, "reused": 0, "scanned": 100, "complete": False}
    def progress(_):
        with repository.engine.begin() as c:
            c.execute(m.state.update().where(m.state.c.state_key == "worker").values(
                lease_token="new"))
    monkeypatch.setattr(repository, "seed_existing", seed)
    with pytest.raises(LeaseLost):
        repository.seed_all_existing(existing, {}, worker_token="old", progress=progress)
    assert len(called) == 1
