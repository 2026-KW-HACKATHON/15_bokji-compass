"""Translate only the current published policy; validate and persist display fields separately."""

import hashlib
import json
import re
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.exc import SQLAlchemyError

from app.contracts.translation import PolicyTranslation, PolicyTranslationResponse
from app.modules.llm.public import (
    TRANSLATION_PROMPT_VERSION,
    CodexRunError,
    translate_policy_display,
)
from app.modules.policy_translation.cache import TranslationCache
from app.modules.storage import catalog

PROMPT_VERSION = TRANSLATION_PROMPT_VERSION
NUMBER = re.compile(r"(?<![0-9])[+-]?[0-9]+(?:[.,][0-9]+)*")
DATE = re.compile(r"(?<![0-9])[12][0-9]{3}[-/.][01]?[0-9][-/.][0-3]?[0-9](?![0-9])")
URL = re.compile(r"https?://[^\s<>\"'\u3000-\u303f\uff00-\uffef]+", re.IGNORECASE)
ASCII_URL_PARTICLE = re.compile(
    r"(https?://[\x21-\x7e]*(?:[a-z0-9_~%-]|[)\]]))"
    r"(?:으로부터|에서부터|에서는|에서도|으로는|으로도|에서|으로|부터|까지|에는|에도|"
    r"이며|이고|은|는|을|를|과|와|에|로)", re.IGNORECASE,
)
EMAIL = re.compile(r"[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
KOREAN = re.compile(r"[\uac00-\ud7a3]")


class TranslationError(Exception):
    def __init__(self, code, status_code=503, retry_after=30):
        self.code = code
        self.status_code = status_code
        self.retry_after = retry_after
        super().__init__(code)


def display_fields(policy: dict) -> PolicyTranslation:
    """The allowlist deliberately excludes all identity, dates and categorical API values."""
    values = {key: policy.get(key) for key in PolicyTranslation.model_fields}
    for key in PolicyTranslation.model_fields:
        if values[key] is None and key not in {
            "paymentSchedule", "budgetNotice", "otherConditions", "sourceFields"
        }:
            values[key] = ""
    values["otherConditions"] = values["otherConditions"] or []
    values["sourceFields"] = values["sourceFields"] or {}
    return PolicyTranslation.model_validate(values)


def source_hash(display: PolicyTranslation) -> str:
    encoded = json.dumps(display.model_dump(), ensure_ascii=False, sort_keys=True,
                         separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _protected(text, pattern):
    if pattern is URL:
        return Counter(_url_token(match.group()) for match in pattern.finditer(text))
    return Counter(token.rstrip(".,;:!?\u3002\uff0c") for token in pattern.findall(text))


def _url_token(token):
    """Remove prose wrapping while preserving path/query bytes and balanced URL parentheses."""
    pairs = {"(": ")", "[": "]", "{": "}"}
    while token:
        shortened = token
        for opening, closing in pairs.items():
            if token.endswith(closing) and token.count(closing) > token.count(opening):
                token = token[:-1]
                break
        else:
            # A sentence period after a wrapper is also outside the link. Without a
            # wrapper, punctuation in paths/queries can be a legitimate target byte.
            if token[-1] in ".,;:!?" and any(
                token[:-1].endswith(closing) and token.count(closing) > token.count(opening)
                for opening, closing in pairs.items()
            ):
                token = token[:-1]
        if token == shortened:
            break
    authority = token.split("://", 1)[-1]
    if not any(delimiter in authority for delimiter in "/?#"):
        token = token.rstrip(".,;:!")
    # Recognize only an entirely ASCII URL followed by exactly a known particle.
    # Genuine Unicode path/query words and values consisting solely of that
    # particle remain exact. ASCII-target + particle text is inherently ambiguous.
    attached = ASCII_URL_PARTICLE.fullmatch(token)
    if attached:
        token = attached.group(1)
    return token


def _validate_text(source, translated):
    if source is None:
        if translated is not None:
            raise ValueError("Missing source cannot acquire translated content")
        return
    if translated is None or bool(source.strip()) != bool(translated.strip()):
        raise ValueError("Translation omitted or fabricated a display field")
    for pattern in (NUMBER, DATE, URL, EMAIL):
        if _protected(source, pattern) != _protected(translated, pattern):
            raise ValueError("Translation altered protected numbers, links or email")


def validate_translation(source: PolicyTranslation, translated: PolicyTranslation):
    if source.sourceFields.keys() != translated.sourceFields.keys():
        raise ValueError("Source field keys changed")
    if len(source.otherConditions) != len(translated.otherConditions):
        raise ValueError("Conditions were omitted or fabricated")
    for key, value in source.model_dump().items():
        target = getattr(translated, key)
        if key == "sourceFields":
            for name, text in value.items():
                _validate_text(text, target[name])
        elif key == "otherConditions":
            for text, result in zip(value, target, strict=True):
                _validate_text(text, result)
        else:
            _validate_text(value, target)
    if source == translated and KOREAN.search(source.model_dump_json()):
        raise ValueError("Korean source was returned without translation")


def _current(repository, policy_id, revision_id, digest):
    current = catalog.get_policy(repository, policy_id)
    if (current is None or current["revisionId"] != revision_id
            or source_hash(display_fields(current)) != digest):
        raise TranslationError("policy_not_found", 404)


def translate_public_policy(repository, policy_id, language, settings, slots):
    """No raw client text enters this service. Always authorize publication before cache reads."""
    if language not in {"ko", "en", "zh", "vi", "ja"}:
        raise TranslationError("translation_invalid_request", 422)
    try:
        policy = catalog.get_policy(repository, policy_id)
        if policy is None:
            raise TranslationError("policy_not_found", 404)
        original = display_fields(policy)
        digest = source_hash(original)
        revision = policy["revisionId"]
        response = {
            "policy_id": policy_id, "revision_id": revision, "language": language,
            "source_language": "ko", "source_hash": digest,
        }
        if language == "ko":
            return PolicyTranslationResponse(**response, translation=original, cached=False)
        if not settings.policy_translation_enabled:
            raise TranslationError("translation_unavailable")
        cache = TranslationCache(repository.engine)
        key = cache.key(policy_id, revision, digest, language, PROMPT_VERSION)
        cached = cache.get(key)
        if cached is not None:
            validate_translation(original, cached)
            _current(repository, policy_id, revision, digest)
            return PolicyTranslationResponse(**response, translation=cached, cached=True)
        if not slots.acquire(blocking=False):
            raise TranslationError("translation_busy", 429)
        try:
            # Another request may have completed while this one acquired the slot.
            cached = cache.get(key)
            if cached is not None:
                validate_translation(original, cached)
                _current(repository, policy_id, revision, digest)
                return PolicyTranslationResponse(**response, translation=cached, cached=True)
            if len(original.model_dump_json()) > settings.policy_translation_max_input_chars:
                raise TranslationError("translation_unavailable")
            now = datetime.now(UTC)
            if not cache.reserve_call(
                now.date().isoformat(), settings.policy_translation_daily_calls
            ):
                tomorrow = datetime.combine(
                    now.date() + timedelta(days=1), datetime.min.time(), UTC)
                raise TranslationError(
                    "translation_busy", 429, max(1, int((tomorrow - now).total_seconds()) + 1))
            bounded = settings.model_copy(update={
                "codex_timeout_seconds": min(settings.codex_timeout_seconds, 60),
                # A translation includes the full public body. Never truncate the source.
                "parsing_max_input_chars": settings.policy_translation_max_input_chars + 4000,
            })
            with TemporaryDirectory(prefix="bokji-policy-translation-") as directory:
                translated, _metadata = translate_policy_display(
                    original, language, bounded, Path(directory) / "run")
            translated = PolicyTranslation.model_validate(translated)
            validate_translation(original, translated)
            _current(repository, policy_id, revision, digest)
            cache.put(key, policy_id, revision, digest, language, PROMPT_VERSION, translated)
            # Publication can change while the cache transaction completes.
            _current(repository, policy_id, revision, digest)
            return PolicyTranslationResponse(**response, translation=translated, cached=False)
        finally:
            slots.release()
    except (SQLAlchemyError, CodexRunError, ValueError, OSError):
        raise TranslationError("translation_unavailable") from None
