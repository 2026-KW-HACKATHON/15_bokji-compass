"""Provider adapters: preserve source bytes elsewhere, normalize only selected fields."""

import hashlib
import json
from pathlib import Path

from app.contracts.parsing import SourcePolicy
from app.modules.collectors.bokjiro_services import _parse_detail_response, _parse_list_response
from app.modules.normalization.source_urls import policy_source_url


def _text(row: dict, *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None:
            if not isinstance(value, str):
                raise ValueError(f"Expected text field: {key}")
            if value.strip():
                return value.replace("\r\n", "\n").replace("\r", "\n").strip()
    return ""


def _structured_text(row: dict, *keys: str) -> str:
    """Preserve repeated source items as text evidence without flattening their order."""
    for key in keys:
        value = row.get(key)
        if value is None or value == "" or value == [] or value == {}:
            continue
        if isinstance(value, str):
            return _text(row, key)
        if isinstance(value, (list, dict)):
            return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2)
        raise ValueError(f"Expected text or repeated field: {key}")
    return ""


def _add_optional_fields(fields: dict[str, str], row: dict,
                         mapping: dict[str, tuple[str, ...]]) -> None:
    for field, keys in mapping.items():
        text = _structured_text(row, *keys)
        if text:
            fields[field] = text


def normalize_record(row: dict) -> SourcePolicy:
    if not isinstance(row, dict):
        raise ValueError("Raw record must be an object")
    if "서비스ID" in row or "serviceId" in row:
        provider = "gov24"
        identity = _text(row, "서비스ID", "serviceId")
        title = _text(row, "서비스명", "serviceNm")
        organization = _text(row, "소관기관명", "orgNm")
        fields = {
            "purpose_summary": _text(row, "서비스목적요약"),
            "provider_category": _text(row, "서비스분야"),
            "eligibility": _text(row, "지원대상"), "selection": _text(row, "선정기준"),
            "application_period": _text(row, "신청기한"),
            "benefits": _text(row, "지원내용"),
        }
        _add_optional_fields(fields, row, {
            "application_method": ("신청방법",),
            "documents": ("구비서류",),
            "receipt_agency": ("접수기관",),
            "application_url": ("온라인신청사이트URL",),
            "contact": ("전화문의",),
            "laws": ("법령", "근거법령"),
            "support_type": ("지원유형",),
            "attachments": ("첨부파일", "서식"),
        })
        url = _text(row, "상세조회URL")
    elif "servId" in row:
        provider = "bokjiro"
        identity, title = _text(row, "servId"), _text(row, "servNm")
        organization = _text(row, "jurMnofNm")
        fields = {
            "eligibility": _text(row, "tgtrDtlCn"), "selection": _text(row, "slctCritCn"),
            "benefits": _text(row, "alwServCn", "alwnServCn"),
        }
        _add_optional_fields(fields, row, {
            "purpose_summary": ("wlfareInfoOutlCn", "servDgst"),
            "application_period": ("applPeriod", "applPrdCn"),
            "application_method": ("applmetList", "applMethodCn"),
            "contact": ("inqplCtadrList",),
            "attachments": ("basfrmList",),
            "laws": ("baslawList",),
            "support_cycle": ("sprtCycNm",),
            "support_type": ("srvPvsnNm",),
            "source_year": ("crtrYr",),
        })
        url = _text(row, "servDtlLink")
    elif "document_id" in row:
        provider = "notice"
        identity, title = _text(row, "document_id"), _text(row, "title")
        organization = _text(row, "organization")
        fields = {"text": _text(row, "text")}
        _add_optional_fields(fields, row, {
            "application_period": ("application_period",),
            "application_method": ("application_method",),
            "application_url": ("application_url",),
            "contact": ("contact",),
            "published_date": ("published_date",),
            "modified_date": ("modified_date",),
            "attachments": ("attachments",),
            "attachment_files": ("attachment_files",),
            "attachment_status": ("attachment_status",),
            "links": ("links",),
        })
        url = _text(row, "source_url")
    else:
        raise ValueError("Unsupported raw record: require Gov24, Bokjiro or RawDocument")
    if not identity or not title:
        raise ValueError("Policy identifier and title are required")
    digest = hashlib.sha256(json.dumps(
        row, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()).hexdigest()
    return SourcePolicy(policy_key=f"{provider}:{identity}", title=title,
                        organization=organization,
                        source_url=policy_source_url(f"{provider}:{identity}", url, row),
                        fields=fields, source_hash=digest)


def load_raw_policies(path: Path) -> list[SourcePolicy]:
    """Read a single JSON/XML response or saved RawDocument; reject malformed batches."""
    if path.stat().st_size > 20_000_000:
        raise ValueError("Input file exceeds 20 MB")
    payload = path.read_bytes()
    if payload.decode("utf-8-sig").lstrip().startswith("<"):
        if b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
            raise ValueError("XML DTD/entity declarations are unsupported")
        # Reuse the collector's result-code validation and lossless nested field parser.
        if b"wantedList" in payload:
            rows = _parse_list_response(payload)
        else:
            rows = [_parse_detail_response(payload)]
    else:
        obj = json.loads(payload.decode("utf-8-sig"))
        if isinstance(obj, dict) and "data" in obj:
            rows = obj["data"]
        elif isinstance(obj, dict) and "wantedDtl" in obj:
            rows = [obj["wantedDtl"]]
        elif isinstance(obj, dict) and "response" in obj:
            rows = [_parse_detail_response(payload)]
        else:
            rows = obj if isinstance(obj, list) else [obj]
    if not isinstance(rows, list) or not rows:
        raise ValueError("Response contains no records")
    result = [normalize_record(row) for row in rows]
    if len({r.policy_key for r in result}) != len(result):
        raise ValueError("Duplicate source IDs in input")
    return result
