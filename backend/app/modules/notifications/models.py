"""Strict categories; OS permission is separate from account consent."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal[
    "policy_changes", "similar_policies", "eligible_policies", "application_results"
]


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    enabled: bool = False
    policy_changes: bool = True
    similar_policies: bool = True
    eligible_policies: bool = True
    application_results: bool = True


class DeviceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    push_token: str = Field(
        max_length=256, pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$"
    )
    platform: Literal["android", "ios"]


class NotificationEvent(BaseModel):
    """An upstream worker must establish the relationship/eligibility before calling."""

    model_config = ConfigDict(extra="forbid", strict=True)

    account_id: str = Field(min_length=1, max_length=64)
    category: Category
    policy_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=500)
