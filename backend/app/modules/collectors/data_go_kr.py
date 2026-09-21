"""Shared HTTP client for data.go.kr public APIs.

This module handles common request concerns such as service-key injection,
query encoding, and HTTP transport. Dataset-specific collectors such as
``gov24_services`` and ``bokjiro_services`` remain responsible for parsing
their own response formats and applying dataset-specific rules.
"""

from collections.abc import Mapping
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import load_settings


def request_data_go_kr(
    api_url: str,
    *,
    params: Mapping[str, object] | None = None,
    api_key: str | None = None,
    timeout: int = 15,
) -> bytes:
    """Request a data.go.kr endpoint using the shared service key.

    Dataset-specific collectors should parse the returned bytes according to
    their own API contract rather than putting parsing rules here.
    """

    resolved_key = api_key or load_settings().data_go_kr_api_key.get_secret_value()
    if not resolved_key or not resolved_key.strip():
        raise ValueError("api_key or DATA_GO_KR_API_KEY must be provided")

    query = dict(params or {})
    query.setdefault("serviceKey", resolved_key.strip())
    query_string = urlencode(query)
    separator = "&" if "?" in api_url else "?"
    request = Request(
        f"{api_url}{separator}{query_string}",
        headers={"User-Agent": "bokji-compass/0.1"},
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read()
