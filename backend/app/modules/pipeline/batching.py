"""Small, independently validated policy bundles; no network/tool retry on failure."""

from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from app.contracts.parsing import PolicyExtraction, PolicyOverview
from app.modules.llm.public import CodexOutputError, CodexRunError, extract_policy_batch
from app.modules.normalization.public import normalize_conditions
from app.modules.parsers.public import RULE_VERSION, extract_conditions
from app.modules.pipeline.public import _missing_conditions, processing_signature
from app.modules.storage.public import validate_draft
from app.modules.validation.public import validate_canonical, validate_extraction, validate_overview


def requests_for(sources, checkpoints=None):
    checkpoints = checkpoints or {}
    return [(source, not (checkpoints.get(source.policy_key) or {}).get("overview_status")
             == "validated", not _code_result(source)[1]) for source in sources]


def _code_result(source):
    if not any(source.fields.get(key, "").strip() for key in ("eligibility", "selection", "text")):
        return _missing_conditions(source), True, None, "code_missing_source", None
    code = extract_conditions(source)
    if code.extraction and code.complete:
        canonical = normalize_conditions(code.extraction, logic=code.logic)
        if canonical.coverage == "complete":
            return code.extraction, True, code.logic, "code_rules", code
    return None, False, None, "code_then_codex_cli_batch", code


def parse_policy_batch(sources, settings, output: Path, *, budget, checkpoints=None,
                       save_checkpoint=None, stop_on_transport_error=False):
    """Yield each committed draft. Successful items never participate in fallback calls.

    The outer CLI JSON schema describes each item, but validation is performed per
    policy so one bad quote, duplicate identity or malformed result cannot discard
    successful neighbors. The shared usage is charged once to the worker budget.
    """
    checkpoints = checkpoints or {}
    signature = processing_signature(settings)
    bases, code_results = {}, {}
    for source in sources:
        old = checkpoints.get(source.policy_key)
        base = {"schema_version": "welfare-parsing-v2", "source": source.model_dump(),
            "review_status": "draft", "matching_enabled": False, "attempts": [],
            "overview": None, "overview_status": "not_run", "overview_attempts": [],
            "processing_signature": signature, "status": "pending", "processing_state": 8,
            "analysis": None, "rule_version": RULE_VERSION}
        if old:
            if old["source"] != source.model_dump():
                raise ValueError("Checkpoint source mismatch")
            if old.get("processing_signature") == signature:
                base = deepcopy(validate_draft(old))
        bases[source.policy_key] = base
        code_results[source.policy_key] = _code_result(source)
        code = code_results[source.policy_key][4]
        if code:
            base["unresolved_code_fields"] = code.unresolved_fields
            base["code_analysis"] = code.extraction.model_dump() if code.extraction else None
            if code.extraction:
                validate_extraction(code.extraction, source)
                canonical = normalize_conditions(code.extraction, logic=code.logic)
                validate_canonical(canonical, source)
                base["code_canonical"] = canonical.model_dump()

    def persist(key):
        if save_checkpoint:
            save_checkpoint(key, deepcopy(bases[key]))

    def attempt(items, model, directory, effort):
        requested = [(s, bases[s.policy_key]["overview_status"] != "validated",
                      not code_results[s.policy_key][1]) for s in items]
        limited = budget.before_model(settings.model_copy(
            update={"codex_reasoning_effort": effort}))
        transport_failed = False
        try:
            rows, meta = extract_policy_batch(requested, limited, directory, model)
            budget.record(meta)
        except CodexOutputError as error:
            budget.record(error.metadata)
            rows, meta = [], error.metadata
        except (CodexRunError, OSError):
            if stop_on_transport_error:
                raise
            # Auth, network and timeout failures are never reasons to escalate cost.
            transport_failed, rows, meta = True, [], {}
        shared = {key: value for key, value in meta.items() if key != "usage"}
        shared.update(model=model, batch_id=uuid4().hex, shared_usage=True)
        failed = []
        for source in items:
            key, base = source.policy_key, bases[source.policy_key]
            row = [r for r in rows if isinstance(r, dict) and r.get("policy_key") == key]
            result = row[0] if len(row) == 1 and set(row[0]) == {
                "policy_key", "overview", "extraction"} else {}
            overview_ok = base["overview_status"] == "validated"
            if not overview_ok:
                try:
                    overview = PolicyOverview.model_validate({**(result.get("overview") or {}),
                        "title": source.title, "source_url": source.source_url})
                    validate_overview(overview, source)
                except (ValueError, TypeError):
                    base["overview_attempts"].append({**shared, "status": "failed" if
                        transport_failed else "validation_failed",
                        "error": "batch_overview_failed"})
                    base["overview_status"] = "failed"
                else:
                    base.update(overview=overview.model_dump(), overview_status="validated")
                    base["overview_attempts"].append({**shared, "status": "validated"})
                    overview_ok = True
                persist(key)
            extraction, complete, logic, method, _ = code_results[key]
            if not complete:
                try:
                    extraction = PolicyExtraction.model_validate(
                        {**(result.get("extraction") or {}), "policy_key": key})
                    validate_extraction(extraction, source)
                    canonical = normalize_conditions(extraction)
                    validate_canonical(canonical, source)
                except (ValueError, TypeError):
                    extraction = None
                    base["attempts"].append({**shared, "status": "failed" if transport_failed
                        else "validation_failed", "error": "batch_extraction_failed"})
                    persist(key)
                else:
                    base["attempts"].append({**shared, "status": "validated"})
            if overview_ok and extraction:
                validate_extraction(extraction, source)
                base["reported_coverage"] = extraction.coverage
                if extraction.unresolved or any(c.state_code == 9 for c in extraction.conditions):
                    extraction = extraction.model_copy(update={"coverage": "partial"})
                canonical = normalize_conditions(extraction, logic=logic)
                validate_canonical(canonical, source)
                base.update(status="needs_review", processing_state=None,
                            analysis=extraction.model_dump(), canonical=canonical.model_dump(),
                            method=method)
                persist(key)
            else:
                failed.append(source)
        return failed, transport_failed

    pending = []
    for source in sources:
        base = bases[source.policy_key]
        if base["status"] == "needs_review":
            yield source.policy_key, base
        else:
            pending.append(source)
    primary = [s for s in pending if not any(a.get("model") == settings.codex_model
        and a.get("status") in {"failed", "validation_failed"} for a in
        bases[s.policy_key]["attempts"] + bases[s.policy_key]["overview_attempts"])]
    failed, transport_failed = attempt(primary, settings.codex_model, output / "primary",
        settings.codex_reasoning_effort) if primary else ([], False)
    for source in primary:
        if source not in failed:
            yield source.policy_key, bases[source.policy_key]
    for index, source in enumerate([s for s in pending if s not in primary or s in failed]):
        base = bases[source.policy_key]
        history = base["attempts"] + base["overview_attempts"]
        if (not transport_failed and settings.codex_fallback_model
                and settings.codex_fallback_model != settings.codex_model
                and not any(a.get("status") == "failed" or a.get("model") ==
                    settings.codex_fallback_model for a in history)):
            attempt([source], settings.codex_fallback_model, output / f"fallback-{index}",
                    settings.codex_fallback_reasoning_effort)
        if base["status"] != "needs_review":
            base.update(status="failed", processing_state=None, analysis=None)
            persist(source.policy_key)
        yield source.policy_key, base
