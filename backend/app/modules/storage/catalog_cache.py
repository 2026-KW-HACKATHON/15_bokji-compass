"""Bounded public read cache, checked against live immutable publication identities."""

import json
import time
from collections import OrderedDict
from concurrent.futures import Future
from contextlib import nullcontext
from copy import deepcopy
from datetime import datetime
from functools import wraps
from inspect import signature
from threading import RLock
from zoneinfo import ZoneInfo

from sqlalchemy import Text, cast, func, inspect, select

from app.modules.ingestion.models import records as collection_records


class PublicCatalogCache:
    """Share concurrent misses; bound response bytes, entries and snapshot retention.

    Publication identities are checked in the DB on every request. A failed check
    propagates instead of serving stale public data. Source/draft revisions are
    immutable; manual edits create another revision. Listing metadata has its own
    content digest so popularity updates invalidate without a new revision.
    """

    def __init__(self, *, ttl_seconds=30, max_entries=256, max_bytes=16 * 1024**2,
                 clock=time.monotonic):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.max_bytes = max_bytes
        self.clock = clock
        self.lock = RLock()
        self.version = None
        self.entries = OrderedDict()
        self.bytes = 0
        self.pending = {}
        self.snapshot_entry = None

    def publication_token(self, repository, connection=None):
        documents = repository.tables["condition_documents"]
        details = repository.tables["policy_revision_details"]
        columns = [documents.c.revision_id]
        if "source_hash" in documents.c:
            columns.append(documents.c.source_hash)
        if "fingerprint" in details.c:
            columns.append(details.c.fingerprint)
        query = select(*columns).join(
            details, details.c.revision_id == documents.c.revision_id
        ).where(documents.c.review_status == "published")
        with (repository.engine.connect() if connection is None
              else nullcontext(connection)) as connection:
            if inspect(connection).has_table(collection_records.name):
                # Hash compact listing metadata in the DB, never transfer raw bodies
                # merely to validate a cache hit. SQLite fixtures register sha2 too.
                query = query.add_columns(func.sha2(
                    cast(collection_records.c.listing_json, Text), 256
                )).outerjoin(collection_records,
                             collection_records.c.policy_key == documents.c.policy_key)
            return tuple(tuple(row) for row in connection.execute(
                query.order_by(documents.c.revision_id)))

    def get_or_compute(self, version, key, compute, *, snapshot=False):
        now = self.clock()
        flight = version, key, snapshot
        with self.lock:
            if self.version != version:
                self.version = version
                self.entries.clear()
                self.bytes = 0
                self.snapshot_entry = None
            if snapshot:
                cached = self.snapshot_entry
                if cached is not None and cached[0] > now:
                    return cached[1]
            else:
                cached = self.entries.get(key)
                if cached is not None and cached[0] > now:
                    self.entries.move_to_end(key)
                    return json.loads(cached[1])
                if cached is not None:
                    self.bytes -= cached[2]
                    del self.entries[key]
            future = self.pending.get(flight)
            owner = future is None
            if owner:
                future = self.pending[flight] = Future()
        if not owner:
            value = future.result()
            return value if snapshot else deepcopy(value)
        try:
            value = compute()
            encoded = None if snapshot else json.dumps(
                value, ensure_ascii=False, separators=(",", ":")
            )
            size = len(encoded.encode("utf-8")) if encoded is not None else 0
            with self.lock:
                if self.version == version:
                    expires = self.clock() + self.ttl_seconds
                    if snapshot:
                        self.snapshot_entry = expires, value
                    elif size <= self.max_bytes:
                        # Expiration is lazy; the LRU byte/entry bounds apply always.
                        self.entries[key] = expires, encoded, size
                        self.bytes += size
                        while (len(self.entries) > self.max_entries
                               or self.bytes > self.max_bytes):
                            _, evicted = self.entries.popitem(last=False)
                            self.bytes -= evicted[2]
                future.set_result(value if snapshot else deepcopy(value))
            return value
        except BaseException as error:
            future.set_exception(error)
            raise
        finally:
            with self.lock:
                self.pending.pop(flight, None)


def cache_public_read(function):
    """Cache complete public responses; member eligibility never enters this cache."""
    parameters = signature(function)

    @wraps(function)
    def cached(repository, *args, **kwargs):
        cache = getattr(repository, "catalog_cache", None)
        if cache is None:
            return function(repository, *args, **kwargs)
        bound = parameters.bind(repository, *args, **kwargs)
        bound.apply_defaults()
        values = {key: value for key, value in bound.arguments.items() if key != "repository"}
        if values.get("eligible_only") or values.get("member") is not None:
            return function(repository, *args, **kwargs)
        today = datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
        key = function.__name__, today, json.dumps(values, sort_keys=True, ensure_ascii=False)
        version = cache.publication_token(repository)
        return cache.get_or_compute(version, key,
                                    lambda: function(repository, *args, **kwargs))

    return cached
