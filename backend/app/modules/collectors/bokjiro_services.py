"""Client for the central-government welfare services API."""

import json
import xml.etree.ElementTree as ET
from collections.abc import Mapping
from typing import Any

from app.core.config import load_settings
from app.modules.collectors.data_go_kr import request_data_go_kr

DEFAULT_BOKJIRO_API_BASE_URL = (
    "https://apis.data.go.kr/B554287/NationalWelfareInformationsV001"
)
BOKJIRO_API_KEY_ENV = "BokjiRO_API_KEY"
LIST_PATH = "/NationalWelfarelistV001"
DETAIL_PATH = "/NationalWelfaredetailedV001"


def fetch_bokjiro_services(
    *,
    page_no: int = 1,
    num_of_rows: int = 10,
    search_keyword: str | None = None,
    life_array: str | None = None,
    household_situation: str | None = None,
    desire: str | None = None,
    api_key: str | None = None,
    api_base_url: str = DEFAULT_BOKJIRO_API_BASE_URL,
) -> list[dict[str, Any]]:
    """Fetch a page of Bokjiro welfare services."""

    if page_no < 1 or num_of_rows < 1:
        raise ValueError("page_no and num_of_rows must be positive integers")

    params: dict[str, object] = {
        "callTp": "O",
        "srchKeyCode": "001",
        "searchWrd": search_keyword or "",
        "pageNo": page_no,
        "numOfRows": num_of_rows,
        "lifeArray": life_array or "",
        "charArray": household_situation or "",
        "desireArray": desire or "",
    }

    payload = _request(
        f"{api_base_url.rstrip('/')}{LIST_PATH}", params=params, api_key=api_key
    )
    return _parse_list_response(payload)


def fetch_bokjiro_service_detail(
    service_id: str,
    *,
    api_key: str | None = None,
    api_base_url: str = DEFAULT_BOKJIRO_API_BASE_URL,
) -> dict[str, Any]:
    """Fetch the detailed eligibility and application information for a service."""

    if not isinstance(service_id, str) or not service_id.strip():
        raise ValueError("service_id must be a non-empty string")

    payload = _request(
        f"{api_base_url.rstrip('/')}{DETAIL_PATH}",
        params={"callTp": "D", "servId": service_id.strip()},
        api_key=api_key,
    )
    return _parse_detail_response(payload)


def _request(
    url: str, *, params: Mapping[str, object], api_key: str | None
) -> bytes:
    resolved_key = api_key or load_settings().bokjiro_api_key.get_secret_value()
    if not resolved_key or not resolved_key.strip():
        raise ValueError(f"api_key or {BOKJIRO_API_KEY_ENV} must be provided")
    return request_data_go_kr(url, params=params, api_key=resolved_key)


def _parse_list_response(payload: bytes) -> list[dict[str, Any]]:
    decoded = _decode_payload(payload)
    if isinstance(decoded, dict):
        body = _response_body(decoded)
        items = body.get("items", [])
        if isinstance(items, dict):
            items = items.get("item", [])
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
    else:
        body = _xml_response_body(decoded)
        items = body.findall(".//item") or body.findall(".//servList")
        return [_xml_item(item) for item in items]
    raise ValueError("Bokjiro list response must contain body.items")


def _parse_detail_response(payload: bytes) -> dict[str, Any]:
    decoded = _decode_payload(payload)
    if isinstance(decoded, dict):
        item = _response_body(decoded).get("item")
        if isinstance(item, dict):
            return item
    else:
        root = _xml_response_body(decoded)
        items = root.findall(".//item")
        if items:
            return _xml_item(items[0])
        if root.tag == "wantedDtl":
            return _xml_item(root)
    raise ValueError("Bokjiro detail response must contain body.item")


def _decode_payload(payload: bytes) -> dict[str, Any] | ET.Element:
    text = payload.decode("utf-8-sig").strip()
    if not text:
        raise ValueError("Bokjiro response must not be empty")
    if text.startswith("{"):
        decoded = json.loads(text)
        if not isinstance(decoded, dict):
            raise ValueError("Bokjiro JSON response must be an object")
        _validate_json_result(decoded)
        return decoded
    root = ET.fromstring(text)
    _validate_xml_result(root)
    return root


def _response_body(payload: dict[str, Any]) -> dict[str, Any]:
    response = payload.get("response", payload)
    body = response.get("body") if isinstance(response, dict) else None
    if not isinstance(body, dict):
        raise ValueError("Bokjiro response must contain response.body")
    return body


def _xml_response_body(root: ET.Element) -> ET.Element:
    body = root.find(".//body")
    return body if body is not None else root


def _validate_json_result(payload: dict[str, Any]) -> None:
    response = payload.get("response", payload)
    header = response.get("header", response) if isinstance(response, dict) else {}
    code = str(header.get("resultCode", "00")) if isinstance(header, dict) else "00"
    if code not in {"00", "0"}:
        message = header.get("resultMsg", "unknown error")
        raise RuntimeError(f"Bokjiro API error {code}: {message}")


def _validate_xml_result(root: ET.Element) -> None:
    code = root.findtext(".//resultCode", "00")
    if code not in {"00", "0"}:
        message = root.findtext(".//resultMsg") or root.findtext(
            ".//resultMessage", "unknown error"
        )
        raise RuntimeError(f"Bokjiro API error {code}: {message}")


def _xml_item(item: ET.Element) -> dict[str, Any]:
    result: dict[str, Any] = {}
    repeated: set[str] = set()
    for child in item:
        value = _xml_item(child) if len(child) else child.text or ""
        if child.tag in result:
            if child.tag not in repeated:
                result[child.tag] = [result[child.tag]]
                repeated.add(child.tag)
            result[child.tag].append(value)
        else:
            result[child.tag] = value
    return result
