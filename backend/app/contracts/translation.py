"""Display translations of public policies; no identity or eligibility values are generated."""

from typing import Annotated, Literal

from pydantic import Field

from app.contracts.parsing import StrictModel

PolicyLanguage = Literal["ko", "en", "zh", "vi", "ja"]
TranslationText = Annotated[str, Field(max_length=60000)]
SourceFieldKey = Annotated[str, Field(min_length=1, max_length=255)]


class PolicyTranslation(StrictModel):
    title: TranslationText
    summary: TranslationText
    audience: TranslationText
    organization: TranslationText
    benefit: TranslationText
    applicationPeriod: TranslationText
    paymentSchedule: TranslationText | None
    content: TranslationText
    gender: TranslationText
    contact: TranslationText
    applicationMethod: TranslationText
    otherConditions: list[TranslationText] = Field(max_length=128)
    sourceFields: dict[SourceFieldKey, TranslationText] = Field(max_length=64)
    budgetNotice: TranslationText | None


class PolicyTranslationResponse(StrictModel):
    policy_id: str
    revision_id: str
    language: PolicyLanguage
    source_language: Literal["ko"]
    source_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    translation: PolicyTranslation
    cached: bool
