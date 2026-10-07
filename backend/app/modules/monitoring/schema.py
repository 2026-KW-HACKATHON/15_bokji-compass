"""Explicit additive monitoring migration; never perform MySQL DDL in an HTTP request."""

from app.modules.monitoring.storage import metadata


def initialize_monitoring_schema(engine):
    metadata.create_all(engine)
