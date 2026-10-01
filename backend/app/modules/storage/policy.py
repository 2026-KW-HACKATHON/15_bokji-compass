"""Persist normalized policy JSON in the MySQL policy tables."""

import json
from pathlib import Path
from typing import Any, Protocol

from app.modules.normalization.policy import normalize_policy_json


class _Cursor(Protocol):
    lastrowid: int

    def execute(self, operation: str, parameters: tuple[Any, ...]) -> None: ...


class _Connection(Protocol):
    def cursor(self) -> _Cursor: ...

    def commit(self) -> None: ...

    def rollback(self) -> None: ...


def save_policy_json_file(path: Path, connection: _Connection) -> int:
    """Read one policy JSON file and insert it into policies and requirements."""

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("policy JSON file must contain one object")
    return save_policy_json(payload, connection)


def save_policy_json(payload: dict[str, Any], connection: _Connection) -> int:
    """Normalize and transactionally persist one policy JSON object."""

    policy = normalize_policy_json(payload)
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO policies
                (title, organization, source_url, source_text,
                 application_start, application_end, is_synthetic)
            VALUES (%s, %s, %s, %s, %s, %s, FALSE)
            """,
            (
                policy.title,
                policy.organization,
                policy.source_url,
                policy.source_text,
                policy.application_start,
                policy.application_end,
            ),
        )
        policy_id = cursor.lastrowid
        for requirement in policy.requirements:
            cursor.execute(
                """
                INSERT INTO policy_requirements
                    (policy_id, condition_type, information_state, evidence_text)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    policy_id,
                    requirement.condition_type,
                    requirement.information_state,
                    requirement.evidence_text,
                ),
            )
        connection.commit()
        return policy_id
    except Exception:
        connection.rollback()
        raise