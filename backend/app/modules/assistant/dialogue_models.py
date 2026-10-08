"""Inputs and expiring, account-bound context for guided welfare conversations."""

import secrets
import time
from collections import OrderedDict
from copy import deepcopy
from dataclasses import dataclass, field
from threading import RLock
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.contracts.parsing import StrictModel
from app.contracts.search import SearchPlan
from app.modules.monitoring.models import MonitoringProfile

Topic = Literal["housing_repair", "employment", "disaster_recovery", "housing_leak", "general"]
Slot = Literal[
    "subject", "topic", "support_interest", "housing_tenure", "building_year", "housing_type",
    "repair_needed", "occupation", "job_seeking", "disaster_damage", "disaster_type",
    "disaster_occurred_on", "region", "search_query",
]


class DialogueAnswer(StrictModel):
    slot: Slot
    value: str | int | bool | None

    @field_validator("value")
    @classmethod
    def bound_text(cls, value):
        if isinstance(value, str) and len(value) > 2000:
            raise ValueError("답변은 2,000자 이내로 입력해 주세요.")
        return value


class DialogueInput(StrictModel):
    question: str | None = Field(default=None, min_length=1, max_length=2000)
    revision_id: str | None = Field(
        default=None, pattern=r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$")
    continuation: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{43}$")
    answer: DialogueAnswer | None = None

    @field_validator("question")
    @classmethod
    def nonempty_question(cls, value):
        if value is not None and not value.strip():
            raise ValueError("질문을 입력해 주세요.")
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def one_turn(self):
        if self.question is not None:
            if self.answer is not None or self.continuation is not None:
                raise ValueError("새 질문과 이전 질문의 답변을 함께 보낼 수 없어요.")
        elif self.answer is None or self.continuation is None or self.revision_id is not None:
            raise ValueError("이어지는 답변에는 대화 연결 정보가 필요해요.")
        return self


class DialogueError(ValueError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass
class DialogueState:
    topic: Topic
    revision_id: str | None = None
    practical_help: bool = False
    subject: str | None = None
    region: str | None = None
    support_interest: bool | None = None
    search_plan: SearchPlan | None = None
    needs_search_details: bool = False
    profile: MonitoringProfile = field(default_factory=MonitoringProfile)
    answered: set[str] = field(default_factory=set)
    confirmed: set[str] = field(default_factory=set)
    # Search intent contains derived terms only, never the original full question.
    # No transcript, member details or policy results are retained here.


class DialogueStore:
    """Opaque handles contain no facts; only this process can create conversation state.

    A fixed expiry starts at the first question, and reads do not extend it. Capacity
    bounds retained state even when many accounts start conversations. Another process
    or a restart safely asks the user to begin again instead of trusting client facts.
    """

    def __init__(self, *, ttl_seconds=1800, capacity=2000, clock=time.monotonic):
        if ttl_seconds <= 0 or capacity <= 0:
            raise ValueError("Conversation retention must be positive")
        self.ttl_seconds = ttl_seconds
        self.capacity = capacity
        self._clock = clock
        self._entries = OrderedDict()
        self._lock = RLock()

    def _prune(self, now):
        for token in [key for key, row in self._entries.items() if row[1] <= now]:
            del self._entries[token]

    def prune_expired(self) -> int:
        """Called periodically by the application even when this account is idle."""
        with self._lock:
            before = len(self._entries)
            self._prune(self._clock())
            return before - len(self._entries)

    def create(self, account_id: str, state: DialogueState) -> str:
        with self._lock:
            now = self._clock()
            self._prune(now)
            while len(self._entries) >= self.capacity:
                self._entries.popitem(last=False)
            token = secrets.token_urlsafe(32)
            self._entries[token] = (account_id, now + self.ttl_seconds, deepcopy(state), 0)
            return token

    def read(self, token: str, account_id: str) -> tuple[DialogueState, int]:
        with self._lock:
            self._prune(self._clock())
            entry = self._entries.get(token)
            if entry is None or not secrets.compare_digest(entry[0], account_id):
                raise DialogueError(410, "대화 연결이 만료되었어요. 질문을 다시 입력해 주세요.")
            return deepcopy(entry[2]), entry[3]

    def update(self, token: str, account_id: str, state: DialogueState, version: int):
        with self._lock:
            _, current = self.read(token, account_id)
            if current != version:
                raise DialogueError(409, "다른 답변이 먼저 반영되었어요. "
                                    "새 질문으로 다시 시작해 주세요.")
            owner, expires, _, _ = self._entries[token]
            self._entries[token] = (owner, expires, deepcopy(state), current + 1)

    def discard_account(self, account_id: str):
        with self._lock:
            for token in [key for key, row in self._entries.items() if row[0] == account_id]:
                del self._entries[token]

    def clear(self):
        with self._lock:
            self._entries.clear()

    def get_confirmed(self, account_id: str, continuation: str) -> dict:
        state, _ = self.read(continuation, account_id)
        if state.subject != "self":
            raise DialogueError(409, "본인의 현재 상황으로 확인한 정보만 저장할 수 있어요.")
        return {key: getattr(state.profile, key) for key in state.confirmed
                if key in MonitoringProfile.model_fields
                and getattr(state.profile, key) is not None}

    def consume_confirmed(self, account_id: str, continuation: str, *, expected: dict):
        """After a successful consented save, prevent a second accidental save of old values."""
        with self._lock:
            state, version = self.read(continuation, account_id)
            state.confirmed.difference_update(
                key for key, value in expected.items()
                if key in MonitoringProfile.model_fields and getattr(state.profile, key) == value)
            self.update(continuation, account_id, state, version)

    def save_confirmed(self, account_id: str, continuation: str, persist_callback):
        """Serialize an explicit save with answers; the callback must only do a short DB write."""
        with self._lock:
            patch = self.get_confirmed(account_id, continuation)
            if not patch:
                raise DialogueError(409, "이번 대화에서 새로 확인한 저장할 정보가 없어요.")
            result = persist_callback(deepcopy(patch))
            # The successful write remains successful even if the TTL elapsed during it.
            owner, expires, state, version = self._entries[continuation]
            state = deepcopy(state)
            state.confirmed.difference_update(patch)
            if expires <= self._clock():
                del self._entries[continuation]
            else:
                self._entries[continuation] = (owner, expires, state, version + 1)
            return result
