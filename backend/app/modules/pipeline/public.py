"""Raw file -> provider fields -> Codex extraction -> validated review draft."""

import hashlib
import json
from collections.abc import Callable
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.contracts.conditions import CanonicalPolicy
from app.contracts.parsing import ParsedCondition, PolicyExtraction, PolicyOverview, SourcePolicy
from app.core.config import BACKEND_ROOT, Settings, load_settings
from app.core.database import create_database_engine
from app.modules.llm.public import (
    BATCH_PROMPT,
    BATCH_PROMPT_VERSION,
    OVERVIEW_PROMPT,
    OVERVIEW_PROMPT_VERSION,
    PROMPT,
    PROMPT_VERSION,
    CodexRunError,
    extract_policy,
    extract_policy_overview,
)
from app.modules.normalization.public import normalize_conditions
from app.modules.normalization.raw import load_raw_policies
from app.modules.parsers.public import RULE_VERSION, extract_conditions
from app.modules.pipeline.budget import BudgetExhausted, WorkBudget
from app.modules.regions.public import SNAPSHOT
from app.modules.storage.public import PolicyRepository, validate_draft
from app.modules.validation.public import validate_canonical, validate_extraction, validate_overview


def write_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def _safe_validation_summary(error: ValueError) -> str:
    if isinstance(error, ValidationError):
        issues = error.errors(include_input=False, include_context=False, include_url=False)
        return "; ".join(
            f"{'.'.join(map(str, issue['loc']))}: "
            + ("schema_validation_failed" if issue["type"] in {"value_error", "assertion_error"}
               else issue["msg"])
            for issue in issues[:4]
        )[:300] or "schema_validation_failed"
    return type(error).__name__


def _missing_conditions(source: SourcePolicy) -> PolicyExtraction:
    field = "text" if "text" in source.fields else "eligibility"
    missing = ParsedCondition(
        condition_id="missing", field_key="eligibility", subject="unknown", state_code=9,
        operator=None, value=None, unit=None, reference_basis=None, role="eligibility",
        group_id=None, source_field=field, evidence_quote=None, unknown_reason="NOT_STATED",
        review_note="지원대상·선정기준 원문 미기재; 상세 원문 추가 수집 필요",
    )
    return PolicyExtraction(policy_key=source.policy_key, conditions=[missing], groups=[],
                            coverage="partial", unresolved=[missing.review_note])


def processing_signature(settings: Settings) -> dict:
    """Stable analysis identity; run IDs, executable paths and timeouts are excluded."""
    files = (
        "app/contracts/parsing.py", "app/contracts/conditions.py",
        "app/modules/parsers/conditions.py", "app/modules/normalization/conditions.py",
        "app/modules/normalization/raw.py", "app/modules/regions/public.py",
        "app/modules/validation/public.py", "app/modules/pipeline/public.py",
        "app/modules/llm/public.py",
        "app/modules/pipeline/batching.py",
    )
    code_hashes = {name: hashlib.sha256((BACKEND_ROOT / name).read_bytes()).hexdigest()
                   for name in files}
    region = json.loads((SNAPSHOT / "manifest.json").read_text(encoding="utf-8"))
    schemas = {model.__name__: model.model_json_schema()
               for model in (PolicyExtraction, PolicyOverview, CanonicalPolicy)}
    signature = {
        "schema_version": "welfare-parsing-v2", "rule_version": RULE_VERSION,
        "model": settings.codex_model, "fallback_model": settings.codex_fallback_model,
        "reasoning_effort": settings.codex_reasoning_effort,
        "fallback_reasoning_effort": settings.codex_fallback_reasoning_effort,
        "batch_prompt_version": BATCH_PROMPT_VERSION,
        "batch_prompt_hash": hashlib.sha256(BATCH_PROMPT.encode()).hexdigest(),
        "prompt_version": PROMPT_VERSION, "overview_prompt_version": OVERVIEW_PROMPT_VERSION,
        "prompt_hash": hashlib.sha256(PROMPT.encode()).hexdigest(),
        "overview_prompt_hash": hashlib.sha256(OVERVIEW_PROMPT.encode()).hexdigest(),
        "schemas_hash": hashlib.sha256(json.dumps(schemas, sort_keys=True).encode()).hexdigest(),
        "code_hashes": code_hashes,
        "region_snapshot_version": region["version"],
        "region_snapshot_hash": region["csv_sha256"],
    }
    signature["hash"] = hashlib.sha256(
        json.dumps(signature, sort_keys=True).encode()).hexdigest()
    return signature


def parse_policy(source: SourcePolicy, settings: Settings, output: Path,
                 *, prepare_only: bool = False, budget: WorkBudget | None = None,
                 checkpoint: dict | None = None,
                 save_checkpoint: Callable[[dict], None] | None = None) -> dict:
    """Return a draft or explicit failed/pending state. Never publish or write MySQL."""
    base = {"schema_version": "welfare-parsing-v2", "source": source.model_dump(),
            "review_status": "draft", "matching_enabled": False, "attempts": [],
            "overview": None, "overview_status": "not_run", "overview_attempts": [],
            "processing_signature": processing_signature(settings)}
    if prepare_only:
        return {**base, "status": "pending", "processing_state": 8, "analysis": None}
    if checkpoint:
        if checkpoint.get("source") != source.model_dump():
            raise ValueError("Checkpoint source mismatch")
        if checkpoint.get("processing_signature") == base["processing_signature"]:
            restored = validate_draft(checkpoint)
            if restored["status"] == "needs_review":
                return restored
            base["attempts"] = restored.get("attempts", [])
            base["overview_attempts"] = restored.get("overview_attempts", [])
            if restored.get("overview_status") == "validated":
                base.update({key: restored[key] for key in (
                    "overview", "overview_status", "overview_attempts")})

    def save_stage(draft: dict) -> dict:
        if save_checkpoint:
            save_checkpoint(deepcopy(draft))
        return draft

    def pending_stage() -> dict:
        return save_stage({**base, "status": "pending", "processing_state": 8,
                           "analysis": None})

    def save_overview_attempts(attempts: list[dict]) -> None:
        base["overview_attempts"] = attempts
        base["overview_status"] = "failed"
        pending_stage()

    if base["overview_status"] != "validated":
        overview, overview_attempts = _extract_overview(source, settings, output, budget=budget,
            prior_attempts=base["overview_attempts"], save_attempts=save_overview_attempts)
        base["overview"] = overview.model_dump() if overview else None
        base["overview_status"] = "validated" if overview else "failed"
        base["overview_attempts"] = overview_attempts
        if overview:
            pending_stage()
        elif budget is not None or save_checkpoint is not None:
            return save_stage({**base, "status": "failed", "processing_state": None,
                               "analysis": None})
    relevant = [source.fields.get(k, "") for k in ("eligibility", "selection", "text")]
    if not any(text.strip() for text in relevant):
        result = _missing_conditions(source)
        validate_extraction(result, source)
        canonical = normalize_conditions(result)
        validate_canonical(canonical, source)
        return save_stage({**base, "status": "needs_review", "processing_state": None,
                "analysis": result.model_dump(), "method": "code_missing_source",
                "canonical": canonical.model_dump()})
    code = extract_conditions(source)
    base["rule_version"] = RULE_VERSION
    base["unresolved_code_fields"] = code.unresolved_fields
    base["code_analysis"] = code.extraction.model_dump() if code.extraction else None
    if code.extraction:
        validate_extraction(code.extraction, source)
        canonical = normalize_conditions(code.extraction, logic=code.logic)
        validate_canonical(canonical, source)
        base["code_canonical"] = canonical.model_dump()
        if code.complete and canonical.coverage == "complete":
            return save_stage({**base, "status": "needs_review", "processing_state": None,
                    "analysis": code.extraction.model_dump(), "canonical": canonical.model_dump(),
                    "method": "code_rules"})
    models = [settings.codex_model]
    if settings.codex_fallback_model and settings.codex_fallback_model not in models:
        models.append(settings.codex_fallback_model)
    for index, model in enumerate(models, 1):
        if any(a.get("model") == model and a.get("status") == "validation_failed"
               for a in base["attempts"]):
            continue
        model_settings = settings if model == settings.codex_model else settings.model_copy(
            update={"codex_reasoning_effort": settings.codex_fallback_reasoning_effort})
        call_settings = budget.before_model(model_settings) if budget else model_settings
        try:
            result, metadata = extract_policy(
                source, call_settings, output / f"attempt-{index}", model)
            if budget:
                budget.record(metadata)
            validate_extraction(result, source)
            canonical = normalize_conditions(result)
            validate_canonical(canonical, source)
        except CodexRunError as error:
            base["attempts"].append({"model": model, "status": "failed", "error": str(error)})
            pending_stage()
            break  # auth/network/timeout are not quality failures; no expensive retry loop
        except ValueError as error:
            if budget and hasattr(error, "metadata"):
                budget.record(error.metadata)
            base["attempts"].append({
                "model": model, "status": "validation_failed",
                "error": _safe_validation_summary(error),
            })
            pending_stage()
            continue
        except OSError:
            base["attempts"].append({"model": model, "status": "failed", "error": "local_io_error"})
            pending_stage()
            break
        base["attempts"].append({**metadata, "status": "validated"})
        base["reported_coverage"] = result.coverage
        if result.unresolved or any(c.state_code == 9 for c in result.conditions):
            result.coverage = "partial"
        result.conditions.sort(key=lambda c: (c.field_key, c.subject, c.group_id or "",
                                              c.condition_id))
        return save_stage({**base, "status": "needs_review", "processing_state": None,
                "analysis": result.model_dump(), "method": "code_then_codex_cli",
                "canonical": canonical.model_dump()})
    return save_stage({**base, "status": "failed", "processing_state": None, "analysis": None})


def parse_raw_files(
    paths: list[Path], *, settings: Settings | None = None,
    output_root: Path | None = None, prepare_only: bool = False,
    storage: str = "mysql", max_items: int | None = None, budget: WorkBudget | None = None,
) -> tuple[Path | None, dict]:
    settings = settings or load_settings()
    sources = [source for path in paths for source in load_raw_policies(path)]
    if not sources:
        raise ValueError("No source policies")
    if len({s.policy_key for s in sources}) != len(sources):
        raise ValueError("Duplicate policy IDs: choose one authoritative detail per policy")
    if storage == "mysql":
        if not settings.db_enabled:
            raise ValueError("DB_ENABLED=true required; use storage='json' for explicit export")
        engine = create_database_engine(settings)
        try:
            # Fail before spending tokens if schema is absent.
            repository = PolicyRepository(engine, auto_publish=settings.policy_auto_publish)
            return None, persist_sources(sources, settings, repository, prepare_only=prepare_only,
                                         max_items=max_items, budget=budget)
        finally:
            engine.dispose()
    if storage != "json":
        raise ValueError("Unknown storage mode")
    if max_items is not None or budget is not None:
        raise ValueError("Bounded runs require durable MySQL storage")
    output_root = output_root or BACKEND_ROOT / "data/parsed_policies"
    run = output_root / (datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ-") + uuid4().hex[:8])
    run.mkdir(parents=True, exist_ok=False)
    manifest = {"schema_version": "welfare-parsing-v2", "records": [], "status": "running"}
    write_json(run / "manifest.json", manifest)
    for source in sources:
        # External IDs never become filesystem paths.
        identity = hashlib.sha256(source.policy_key.encode()).hexdigest()[:24]
        target = run / identity
        target.mkdir()
        draft = parse_policy(source, settings, target, prepare_only=prepare_only)
        write_json(target / "draft.json", draft)
        manifest["records"].append({"policy_key": source.policy_key, "title": source.title,
                                    "status": draft["status"], "path": f"{identity}/draft.json"})
        write_json(run / "manifest.json", manifest)
    manifest["status"] = "failed" if any(
        r["status"] == "failed" for r in manifest["records"]
    ) else "prepared" if prepare_only else "needs_review"
    write_json(run / "manifest.json", manifest)
    return run, manifest


def persist_sources(sources: list[SourcePolicy], settings: Settings,
                    repository: PolicyRepository, *, prepare_only: bool = False,
                    max_items: int | None = None, budget: WorkBudget | None = None) -> dict:
    """Queue sources durably, parse without a DB transaction, commit each result atomically."""
    run_id = repository.start_run(sources, {
        "origin": "pipeline", "rule_version": RULE_VERSION,
        "model": settings.codex_model, "fallback_model": settings.codex_fallback_model,
        "reasoning_effort": settings.codex_reasoning_effort,
        "processing_signature": processing_signature(settings),
    })
    if prepare_only:
        return repository.finish_run(run_id, prepare_only=True)
    return resume_run(run_id, settings, repository, max_items=max_items, budget=budget)


def resume_run(run_id: str, settings: Settings, repository: PolicyRepository,
               *, max_items: int | None = None, budget: WorkBudget | None = None) -> dict:
    """Resume durable pending/failed items. Already committed revisions are left untouched."""
    processing = repository.run_processing(run_id)
    if processing.get("origin") == "pipeline":
        if processing["rule_version"] != RULE_VERSION:
            raise ValueError("Rule version changed; start a new run")
        settings = settings.model_copy(update={
            "codex_model": processing["model"],
            "codex_fallback_model": processing["fallback_model"],
            "codex_reasoning_effort": processing["reasoning_effort"],
        })
        if (processing.get("processing_signature") is not None
                and processing["processing_signature"] != processing_signature(settings)):
            raise ValueError("Processing configuration changed; start a new run")
    budget_reason = None
    for item in repository.pending_items(run_id, limit=max_items):
        source = SourcePolicy.model_validate(item["source_json"])
        draft = item["result_json"]

        def save_checkpoint(value: dict) -> None:
            nonlocal draft
            draft = value
            # The complete result is committed by save_result immediately below.
            if value["status"] == "pending":
                repository.save_result(run_id, value)

        try:
            if budget:
                budget.check()
            if not draft or draft.get("status") != "needs_review":
                # CLI transport needs temporary files; the durable result lives only in MySQL.
                with TemporaryDirectory(prefix="bokji-parse-") as work:
                    if budget is not None or max_items is not None:
                        draft = parse_policy(source, settings, Path(work), budget=budget,
                                             checkpoint=draft, save_checkpoint=save_checkpoint)
                    else:
                        draft = parse_policy(source, settings, Path(work))
            repository.save_result(run_id, draft)
        except BudgetExhausted as error:
            budget_reason = str(error)
            break
        except (ValueError, OSError, RuntimeError, SQLAlchemyError) as error:
            try:
                repository.mark_failed(run_id, source.policy_key, type(error).__name__, draft)
            except SQLAlchemyError:
                raise RuntimeError(f"Database unavailable; inspect pending run {run_id}") from None
    manifest = repository.finish_run(run_id)
    if budget_reason:
        manifest["budget_exhausted"] = budget_reason
    return manifest


def _extract_overview(source: SourcePolicy, settings: Settings,
                      output: Path, *, budget: WorkBudget | None = None,
                      prior_attempts: list[dict] | None = None,
                      save_attempts: Callable[[list[dict]], None] | None = None
                      ) -> tuple[PolicyOverview | None, list[dict]]:
    models = [settings.codex_model]
    if settings.codex_fallback_model and settings.codex_fallback_model not in models:
        models.append(settings.codex_fallback_model)
    attempts = deepcopy(prior_attempts or [])
    for index, model in enumerate(models, 1):
        if any(a.get("model") == model and a.get("status") == "validation_failed"
               for a in attempts):
            continue
        model_settings = settings if model == settings.codex_model else settings.model_copy(
            update={"codex_reasoning_effort": settings.codex_fallback_reasoning_effort})
        call_settings = budget.before_model(model_settings) if budget else model_settings
        try:
            result, metadata = extract_policy_overview(
                source, call_settings, output / f"overview-attempt-{index}", model)
            if budget:
                budget.record(metadata)
            validate_overview(result, source)
        except CodexRunError as error:
            attempts.append({"model": model, "status": "failed", "error": str(error)})
            if save_attempts:
                save_attempts(attempts)
            break
        except ValueError as error:
            if budget and hasattr(error, "metadata"):
                budget.record(error.metadata)
            attempts.append({"model": model, "status": "validation_failed",
                             "error": _safe_validation_summary(error)})
            if save_attempts:
                save_attempts(attempts)
            continue
        except OSError:
            attempts.append({"model": model, "status": "failed", "error": "local_io_error"})
            if save_attempts:
                save_attempts(attempts)
            break
        attempts.append({**metadata, "status": "validated"})
        return result, attempts
    return None, attempts
