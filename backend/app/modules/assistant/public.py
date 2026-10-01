"""Initial DB-backed Q&A, invoked locally until account/API integration is implemented."""

from pathlib import Path
from tempfile import TemporaryDirectory

from app.contracts.assistance import GuidanceProfile
from app.contracts.parsing import SourcePolicy
from app.core.config import Settings
from app.modules.llm.public import answer_policy_question
from app.modules.storage.public import PolicyRepository


def answer_question(repository: PolicyRepository, revision_id: str, question: str,
                    profile: GuidanceProfile, settings: Settings, *,
                    include_drafts: bool = False) -> dict:
    """Read an explicit immutable DB revision. Draft access is local operator preview only."""
    question = question.strip()
    if not question or len(question) > 2000:
        raise ValueError("Question must contain 1 to 2000 characters")
    record = repository.get_revision(revision_id, published_only=not include_drafts)
    if record is None or record["review_status"] == "rejected":
        raise ValueError("Policy revision is unavailable")
    source = SourcePolicy.model_validate(record["source_json"])
    with TemporaryDirectory(prefix="bokji-guidance-") as directory:
        answer, metadata = answer_policy_question(source, question, profile, settings,
                                                   Path(directory) / "answer")
    for evidence in answer.citations:
        original = (source.title if evidence.source_field == "title" else source.organization
                    if evidence.source_field == "organization"
                    else source.fields.get(evidence.source_field, ""))
        if evidence.quote not in original:
            raise ValueError("Answer cites material absent from this policy")
    return {**answer.model_dump(), "revision_id": revision_id,
            "policy_key": source.policy_key, "source_url": source.source_url,
            "review_status": record["review_status"], "eligibility_decided": False,
            "preview": record["review_status"] != "published", "model": metadata["model"]}
