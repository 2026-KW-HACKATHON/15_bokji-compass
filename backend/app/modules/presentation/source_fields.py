"""Readable source details; stored JSON evidence and its order stay unchanged."""

import json
import re

NAME_KEYS = (
    "servSeDetailNm", "applmetNm", "inqplNm", "baslawNm", "basfrmNm",
    "label", "name", "title", "fileName", "filename",
)
DETAIL_KEYS = (
    "servSeDetailLink", "applmetCn", "inqplCtadr", "baslawLink", "basfrmLink",
    "url", "href", "link", "fileUrl", "downloadUrl", "phone", "tel",
    "description", "content", "text", "value",
)
APPLICATION_STAGES = {
    "신청기관연락처목록": "신청",
    "조사기관연락처목록": "조사 및 심사",
    "결정기관연락처목록": "지원 결정",
    "지급기관연락처목록": "서비스 제공",
    "사후관리기관목록": "사후 관리",
    "이의신청접수기관연락처목록": "이의 신청",
}
LABELS = {
    "phone": "전화", "tel": "전화", "email": "이메일", "address": "주소",
    "description": "안내", "content": "내용", "text": "내용",
    "url": "주소", "href": "주소", "link": "주소",
}
METADATA = re.compile(r"(?:.*(?:Code|Id|ID)|code|id|resultMessage|_.*)$")


def format_source_field(value: str, *, field: str = "") -> str:
    """Unpack a complete JSON object/array; ordinary text passes through verbatim."""
    if not isinstance(value, str):
        return ""
    stripped = value.strip()
    if not stripped.startswith(("{", "[")):
        return value
    try:
        structured = json.loads(stripped)
    except (ValueError, RecursionError):
        return value
    if not isinstance(structured, (dict, list)):
        return value
    return _readable(structured, field=field)


def format_source_fields(fields: dict[str, str]) -> dict[str, str]:
    """Return nonempty public display fields, omitting internal editor metadata."""
    return {
        key: text
        for key, value in fields.items()
        if not key.startswith("_editor_")
        and (text := format_source_field(value, field=key)).strip()
    }


def _readable(value, *, field, depth=0):
    if value is None or depth > 20:
        return ""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith(("{", "[")):
            try:
                structured = json.loads(text)
            except (ValueError, RecursionError):
                pass
            else:
                if isinstance(structured, (dict, list)):
                    return _readable(structured, field=field, depth=depth + 1)
        return text
    if isinstance(value, bool):
        return "예" if value else "아니요"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(
            text for item in value
            if (text := _readable(item, field=field, depth=depth + 1))
        )
    if not isinstance(value, dict):
        return ""

    name_key = next((key for key in NAME_KEYS if value.get(key)), None)
    detail_key = next(
        (key for key in DETAIL_KEYS if key in value and value[key] not in (None, "")), None
    )
    name = _readable(value[name_key], field=field, depth=depth + 1) if name_key else ""
    detail = _readable(value[detail_key], field=field, depth=depth + 1) if detail_key else ""
    if field == "application_method":
        name = APPLICATION_STAGES.get(name, name)
    lines = [f"{name}: {detail}" if name and detail and name != detail else name or detail]
    for key, item in value.items():
        if key in {name_key, detail_key} or METADATA.fullmatch(key):
            continue
        text = _readable(item, field=field, depth=depth + 1)
        if not text:
            continue
        label = LABELS.get(key) or (key if re.search(r"[가-힣]", key) else "")
        lines.append(f"{label}: {text}" if label else text)
    return "\n".join(line for line in lines if line)
