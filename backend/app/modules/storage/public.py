"""File-based storage for collected raw documents."""

import json
from collections.abc import Iterable
from pathlib import Path

from app.contracts.public import RawDocument
from app.modules.storage.repository import PolicyRepository, validate_draft
from app.modules.storage.schema import initialize_policy_schema

__all__ = ["PolicyRepository", "initialize_policy_schema", "validate_draft",
           "save_raw_document", "list_raw_documents"]

DEFAULT_STORAGE_PATH = Path(__file__).resolve().parents[3] / "data" / "raw_documents"


def save_raw_document(
    document: RawDocument, storage_path: Path = DEFAULT_STORAGE_PATH
) -> RawDocument:
    """Persist one raw document as UTF-8 JSON and return the saved document."""

    storage_path.mkdir(parents=True, exist_ok=True)
    target = storage_path / f"{document.document_id}.json"
    target.write_text(
        json.dumps(document.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return document


def list_raw_documents(
    storage_path: Path = DEFAULT_STORAGE_PATH,
) -> Iterable[RawDocument]:
    """Read all saved raw documents ordered by filename."""

    if not storage_path.exists():
        return []

    documents = []
    for path in sorted(storage_path.glob("*.json")):
        documents.append(RawDocument(**json.loads(path.read_text(encoding="utf-8"))))
    return documents
