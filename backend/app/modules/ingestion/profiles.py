"""Reviewed starting budgets, shared by the console and scheduled CLI worker.

Provider daily allowances remain those saved by the operator. These profiles are
not a claim about the provider's quota or this account's Codex credit allowance.
"""

COMMON = {
    "codex_model": "gpt-6-luna", "codex_reasoning_effort": "low",
    "codex_fallback_model": "gpt-6.1-sol", "codex_fallback_reasoning_effort": "medium",
    "codex_timeout_seconds": 240,
    "ingestion_ai_batch_size": 4, "ingestion_ai_batch_input_chars": 24000,
    "ingestion_page_size": 100, "ingestion_max_seconds": 540,
    "ingestion_http_interval_seconds": 1.0, "ingestion_discovery_enabled": False,
    "ingestion_scan_interval_seconds": 21600, "ingestion_recheck_seconds": 86400,
}
PROFILES = {
    "bootstrap": {**COMMON, "ingestion_profile": "bootstrap",
        "ingestion_max_pages": 30, "ingestion_max_jobs": 100,
        "ingestion_max_http_calls": 80, "ingestion_max_model_calls": 12,
        "ingestion_max_tokens": 200000, "ingestion_daily_model_calls": 120,
        "ingestion_queue_limit": 50000},
    "steady": {**COMMON, "ingestion_profile": "steady",
        "ingestion_max_pages": 8, "ingestion_max_jobs": 24,
        "ingestion_max_http_calls": 24, "ingestion_max_model_calls": 4,
        "ingestion_max_tokens": 60000, "ingestion_daily_model_calls": 40,
        "ingestion_queue_limit": 50000},
}


def apply_profile(settings, name):
    return type(settings).model_validate({**settings.model_dump(), **PROFILES[name]})


def runtime_settings(settings, bootstrap_complete):
    if settings.ingestion_profile != "bootstrap" or not bootstrap_complete:
        return settings
    steady = apply_profile(settings, "steady")
    return steady.model_copy(update={name: getattr(settings, name) for name in (
        "codex_model", "codex_fallback_model", "codex_reasoning_effort",
        "codex_fallback_reasoning_effort", "codex_timeout_seconds",
        "ingestion_ai_batch_size", "ingestion_ai_batch_input_chars")})
