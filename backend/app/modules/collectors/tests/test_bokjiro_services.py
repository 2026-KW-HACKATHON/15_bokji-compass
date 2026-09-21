import json
from unittest.mock import patch

import pytest

from app.modules.collectors.bokjiro_services import (
    DEFAULT_BOKJIRO_API_BASE_URL,
    fetch_bokjiro_service_detail,
    fetch_bokjiro_services,
)


def test_fetch_bokjiro_services_requests_filters_and_parses_response() -> None:
    response = {
        "response": {
            "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
            "body": {"items": [{"servId": "WLF-1", "servNm": "부모급여"}]},
        }
    }

    with patch(
        "app.modules.collectors.bokjiro_services.request_data_go_kr",
        return_value=json.dumps(response).encode(),
    ) as mocked:
        services = fetch_bokjiro_services(
            page_no=2,
            num_of_rows=5,
            search_keyword="보육",
            life_array="001",
            household_situation="002",
            desire="001",
            api_key="test-key",
        )

    assert services == [{"servId": "WLF-1", "servNm": "부모급여"}]
    mocked.assert_called_once_with(
        f"{DEFAULT_BOKJIRO_API_BASE_URL}/NationalWelfarelistV001",
        params={
            "callTp": "O",
            "srchKeyCode": "001",
            "searchWrd": "보육",
            "pageNo": 2,
            "numOfRows": 5,
            "lifeArray": "001",
            "charArray": "002",
            "desireArray": "001",
        },
        api_key="test-key",
    )


def test_fetch_bokjiro_service_detail_parses_item() -> None:
    response = {"response": {"body": {"item": {"servId": "WLF-1"}}}}

    with patch(
        "app.modules.collectors.bokjiro_services.request_data_go_kr",
        return_value=json.dumps(response).encode(),
    ) as mocked:
        detail = fetch_bokjiro_service_detail("WLF-1", api_key="test-key")

    assert detail == {"servId": "WLF-1"}
    assert mocked.call_args.args[0].endswith("/NationalWelfaredetailedV001")


def test_fetch_bokjiro_services_parses_xml() -> None:
    response = b"<wantedList><resultCode>0</resultCode><body><servList><servId>WLF-1</servId><servNm>\xeb\xb6\x80\xeb\xaa\xa8\xea\xb8\x89\xec\x97\xac</servNm></servList></body></wantedList>"

    with patch(
        "app.modules.collectors.bokjiro_services.request_data_go_kr",
        return_value=response,
    ):
        assert fetch_bokjiro_services(api_key="test-key") == [
            {"servId": "WLF-1", "servNm": "부모급여"}
        ]


def test_fetch_bokjiro_services_raises_api_error() -> None:
    response = {"response": {"header": {"resultCode": "30", "resultMsg": "bad key"}}}

    with patch(
        "app.modules.collectors.bokjiro_services.request_data_go_kr",
        return_value=json.dumps(response).encode(),
    ), pytest.raises(RuntimeError, match="30"):
        fetch_bokjiro_services(api_key="test-key")