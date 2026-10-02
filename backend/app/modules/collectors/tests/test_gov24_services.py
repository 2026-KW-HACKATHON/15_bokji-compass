import json
from unittest.mock import patch

import pytest

from app.modules.collectors.data_go_kr import CollectionAPIError
from app.modules.collectors.gov24_services import fetch_gov24_page, fetch_recent_public_services
from app.modules.presentation.public import format_public_services


def test_fetch_recent_public_services_returns_ten_requested_rows() -> None:
    payload = {
        "page": 1,
        "perPage": 10,
        "totalCount": 20,
        "data": [
            {"serviceId": f"service-{index}", "serviceNm": f"복지 서비스 {index}"}
            for index in range(10)
        ],
    }

    with patch(
        "app.modules.collectors.gov24_services.request_data_go_kr",
        return_value=json.dumps(payload).encode("utf-8"),
    ) as mocked:
        services = fetch_recent_public_services(api_key="test-key")

    assert len(services) == 10
    assert services[0]["serviceNm"] == "복지 서비스 0"
    mocked.assert_called_once_with(
        "https://api.odcloud.kr/api/gov24/v3/serviceList",
        api_key="test-key",
        params={"page": 1, "perPage": 10, "returnType": "JSON"},
    )


def test_format_public_services_outputs_names_and_ids() -> None:
    output = format_public_services(
        [{"serviceId": "A-1", "serviceNm": "청년 지원"}]
    )

    assert output == "1. 청년 지원 (A-1)"


@pytest.mark.parametrize("endpoint", ["serviceList", "serviceDetail", "supportConditions"])
def test_gov24_page_preserves_metadata_and_only_requests_supported_pagination(endpoint):
    raw = json.dumps({"page": 2, "perPage": 2, "totalCount": 9,
                      "data": [{"서비스ID": "0001"}]}).encode()
    with patch("app.modules.collectors.gov24_services.request_data_go_kr",
               return_value=raw) as fetch:
        page = fetch_gov24_page(page=2, per_page=2, endpoint=endpoint, api_key="key",
                                timeout=4, max_response_bytes=1000, deadline=123)
    assert page.rows == [{"서비스ID": "0001"}]
    assert (page.page, page.per_page, page.total_count, page.raw) == (2, 2, 9, raw)
    assert fetch.call_args.args[0].endswith("/" + endpoint)
    assert fetch.call_args.kwargs["params"] == {"page": 2, "perPage": 2, "returnType": "JSON"}
    assert fetch.call_args.kwargs["deadline"] == 123


def test_gov24_empty_page_has_optional_total_count():
    with patch("app.modules.collectors.gov24_services.request_data_go_kr",
               return_value=b'{"data": []}'):
        page = fetch_gov24_page(api_key="key")
    assert page.rows == [] and page.total_count is None


@pytest.mark.parametrize("payload", [
    {"data": [None]}, {"data": [], "page": 3}, {"data": [], "totalCount": False},
    {"data": [{}, {}], "perPage": 1}, {"data": [], "perPage": 50},
])
def test_gov24_invalid_page_never_silently_skips_records(payload):
    with patch("app.modules.collectors.gov24_services.request_data_go_kr",
               return_value=json.dumps(payload).encode()), pytest.raises(ValueError):
        fetch_gov24_page(page=1, per_page=1, api_key="key")


def test_gov24_business_error_is_typed_and_sanitized():
    with patch("app.modules.collectors.gov24_services.request_data_go_kr",
               return_value=b'{"code": 30, "message": "secret-key", "data": []}'), \
            pytest.raises(CollectionAPIError, match="^gov24_api_error$"):
        fetch_gov24_page(api_key="key")
