"""Per-worker deadlines and model budgets, independent of external services."""

import math
import time
from dataclasses import dataclass, field

from app.core.config import Settings


class BudgetExhausted(RuntimeError):
    """Work must wait for another tick; this is not a failed policy extraction."""


@dataclass
class WorkBudget:
    """Use a monotonic absolute deadline. Token limits stop subsequent calls."""

    deadline: float
    max_model_calls: int = 4
    max_tokens: int = 100000
    model_calls: int = field(default=0, init=False)
    tokens: int = field(default=0, init=False)
    input_tokens: int = field(default=0, init=False)
    cached_input_tokens: int = field(default=0, init=False)
    output_tokens: int = field(default=0, init=False)
    reasoning_tokens: int = field(default=0, init=False)

    def __post_init__(self) -> None:
        if not math.isfinite(self.deadline):
            raise ValueError("Deadline must be finite")
        if self.max_model_calls < 0 or self.max_tokens < 0:
            raise ValueError("Model budgets must be nonnegative")

    def check(self) -> None:
        """Check the overall deadline before starting another work item."""
        if time.monotonic() >= self.deadline:
            raise BudgetExhausted("deadline")

    def before_model(self, settings: Settings) -> Settings:
        """Reserve one attempt, including fallback, and bound its timeout."""
        remaining = math.floor(self.deadline - time.monotonic())
        if remaining < 10:
            raise BudgetExhausted("deadline")
        if self.model_calls >= self.max_model_calls:
            raise BudgetExhausted("model_calls")
        if self.tokens >= self.max_tokens:
            raise BudgetExhausted("tokens")
        self.model_calls += 1
        return settings.model_copy(update={
            "codex_timeout_seconds": min(settings.codex_timeout_seconds, remaining),
        })

    def record(self, metadata: dict) -> None:
        """Count reported input/output once; cached input is already part of input."""
        usage = metadata.get("usage", [])
        if isinstance(usage, dict):
            usage = [usage]
        if not isinstance(usage, list):
            return
        for event in usage:
            if not isinstance(event, dict):
                continue
            total = event.get("total_tokens")
            if isinstance(total, int) and not isinstance(total, bool) and total >= 0:
                self.tokens += total
            else:
                for key in ("input_tokens", "output_tokens"):
                    value = event.get(key)
                    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                        self.tokens += value
            for key in ("input_tokens", "output_tokens", "cached_input_tokens", "reasoning_tokens"):
                value = event.get(key)
                details = event.get("input_tokens_details" if key == "cached_input_tokens"
                                    else "output_tokens_details")
                if value is None and isinstance(details, dict):
                    value = details.get("cached_tokens" if key == "cached_input_tokens"
                                        else "reasoning_tokens") if key in {
                                            "cached_input_tokens", "reasoning_tokens"} else None
                if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                    setattr(self, key, getattr(self, key) + value)
