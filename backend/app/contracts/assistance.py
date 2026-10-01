"""Initial, read-only personal guidance contracts; no eligibility decision or side effects."""

from typing import Literal

from pydantic import Field, model_validator

from app.contracts.parsing import SourceEvidence, StrictModel


class GuidanceProfile(StrictModel):
    region: str | None = Field(default=None, max_length=100)
    age_band: str | None = Field(default=None, max_length=50)
    interests: list[str] = Field(default_factory=list, max_length=6)


class PolicyAnswer(StrictModel):
    status: Literal["grounded", "insufficient_source"]
    answer: str = Field(min_length=1, max_length=4000)
    citations: list[SourceEvidence] = Field(max_length=12)
    follow_up_questions: list[str] = Field(max_length=5)

    @model_validator(mode="after")
    def require_evidence(self):
        if self.status == "grounded" and not self.citations:
            raise ValueError("A grounded answer requires source evidence")
        return self
