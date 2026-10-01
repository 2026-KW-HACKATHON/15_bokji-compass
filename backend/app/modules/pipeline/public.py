"""Raw file -> provider fields -> Codex extraction -> validated review draft."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from sqlalchemy.exc import SQLAlchemyError

from app.contracts.parsing import ParsedCondition, PolicyExtraction, PolicyOverview, SourcePolicy
from app.core.config import BACKEND_ROOT, Settings, load_settings
from app.core.database import create_database_engine
from app.modules.llm.public import CodexRunError, extract_policy, extract_policy_overview
from app.modules.normalization.public import normalize_conditions
from app.modules.normalization.raw import load_raw_policies
from app.modules.parsers.public import RULE_VERSION, extract_conditions
from app.modules.storage.public import PolicyRepository
from app.modules.validation.public import validate_canonical, validate_extraction, validate_overview


def write_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


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


def parse_policy(source: SourcePolicy, settings: Settings, output: Path,
                 *, prepare_only: bool = False) -> dict:
    """Return a draft or explicit failed/pending state. Never publish or write MySQL."""
    base = {"schema_version": "welfare-parsing-v2", "source": source.model_dump(),
            "review_status": "draft", "matching_enabled": False, "attempts": [],
            "overview": None, "overview_status": "not_run", "overview_attempts": []}
    if prepare_only:
        return {**base, "status": "pending", "processing_state": 8, "analysis": None}
    overview, overview_attempts = _extract_overview(source, settings, output)
    base["overview"] = overview.model_dump() if overview else None
    base["overview_status"] = "validated" if overview else "failed"
    base["overview_attempts"] = overview_attempts
    relevant = [source.fields.get(k, "") for k in ("eligibility", "selection", "text")]
    if not any(text.strip() for text in relevant):
        result = _missing_conditions(source)
        validate_extraction(result, source)
        canonical = normalize_conditions(result)
        validate_canonical(canonical, source)
        return {**base, "status": "needs_review", "processing_state": None,
                "analysis": result.model_dump(), "method": "code_missing_source",
                "canonical": canonical.model_dump()}
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
            return {**base, "status": "needs_review", "processing_state": None,
                    "analysis": code.extraction.model_dump(), "canonical": canonical.model_dump(),
                    "method": "code_rules"}
    models = [settings.codex_model]
    if settings.codex_fallback_model and settings.codex_fallback_model not in models:
        models.append(settings.codex_fallback_model)
    for index, model in enumerate(models, 1):
        try:
            result, metadata = extract_policy(source, settings, output / f"attempt-{index}", model)
            validate_extraction(result, source)
            canonical = normalize_conditions(result)
            validate_canonical(canonical, source)
        except CodexRunError as error:
            base["attempts"].append({"model": model, "status": "failed", "error": str(error)})
            break  # auth/network/timeout are not quality failures; no expensive retry loop
        except ValueError:
            base["attempts"].append({"model": model, "status": "validation_failed"})
            continue
        except OSError:
            base["attempts"].append({"model": model, "status": "failed", "error": "local_io_error"})
            break
        base["attempts"].append({**metadata, "status": "validated"})
        base["reported_coverage"] = result.coverage
        if result.unresolved or any(c.state_code == 9 for c in result.conditions):
            result.coverage = "partial"
        result.conditions.sort(key=lambda c: (c.field_key, c.subject, c.group_id or "",
                                              c.condition_id))
        return {**base, "status": "needs_review", "processing_state": None,
                "analysis": result.model_dump(), "method": "code_then_codex_cli",
                "canonical": canonical.model_dump()}
    return {**base, "status": "failed", "processing_state": None, "analysis": None}


def parse_raw_files(
    paths: list[Path], *, settings: Settings | None = None,
    output_root: Path | None = None, prepare_only: bool = False,
    storage: str = "mysql",
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
            repository = PolicyRepository(engine)
            return None, persist_sources(sources, settings, repository, prepare_only=prepare_only)
        finally:
            engine.dispose()
    if storage != "json":
        raise ValueError("Unknown storage mode")
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
                    repository: PolicyRepository, *, prepare_only: bool = False) -> dict:
    """Queue sources durably, parse without a DB transaction, commit each result atomically."""
    run_id = repository.start_run(sources, {
        "origin": "pipeline", "rule_version": RULE_VERSION,
        "model": settings.codex_model, "fallback_model": settings.codex_fallback_model,
        "reasoning_effort": settings.codex_reasoning_effort,
    })
    if prepare_only:
        return repository.finish_run(run_id, prepare_only=True)
    return resume_run(run_id, settings, repository)


def resume_run(run_id: str, settings: Settings, repository: PolicyRepository) -> dict:
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
    for item in repository.pending_items(run_id):
        source = SourcePolicy.model_validate(item["source_json"])
        draft = item["result_json"]
        try:
            if not draft or draft.get("status") != "needs_review":
                # CLI transport needs temporary files; the durable result lives only in MySQL.
                with TemporaryDirectory(prefix="bokji-parse-") as work:
                    draft = parse_policy(source, settings, Path(work))
            repository.save_result(run_id, draft)
        except (ValueError, OSError, RuntimeError, SQLAlchemyError) as error:
            try:
                repository.mark_failed(run_id, source.policy_key, type(error).__name__, draft)
            except SQLAlchemyError:
                raise RuntimeError(f"Database unavailable; inspect pending run {run_id}") from None
    return repository.finish_run(run_id)


def _extract_overview(source: SourcePolicy, settings: Settings,
                      output: Path) -> tuple[PolicyOverview | None, list[dict]]:
    models = [settings.codex_model]
    if settings.codex_fallback_model and settings.codex_fallback_model not in models:
        models.append(settings.codex_fallback_model)
    attempts = []
    for index, model in enumerate(models, 1):
        try:
            result, metadata = extract_policy_overview(
                source, settings, output / f"overview-attempt-{index}", model)
            validate_overview(result, source)
        except CodexRunError as error:
            attempts.append({"model": model, "status": "failed", "error": str(error)})
            break
        except ValueError:
            attempts.append({"model": model, "status": "validation_failed"})
            continue
        except OSError:
            attempts.append({"model": model, "status": "failed", "error": "local_io_error"})
            break
        attempts.append({**metadata, "status": "validated"})
        return result, attempts
    return None, attempts
