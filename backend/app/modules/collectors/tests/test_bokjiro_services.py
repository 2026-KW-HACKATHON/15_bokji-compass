import json
from unittest.mock import patch

import pytest

from app.modules.collectors.bokjiro_services import (
    DEFAULT_BOKJIRO_API_BASE_URL,
    fetch_bokjiro_detail_page,
    fetch_bokjiro_page,
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
    response = (
        "<wantedList><resultCode>0</resultCode><body><servList>"
        "<servId>WLF-1</servId><servNm>부모급여</servNm>"
        "</servList></body></wantedList>"
    ).encode()

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

def test_bokjiro_key_loads_from_env_file(tmp_path, monkeypatch) -> None:
    from app.core import config

    monkeypatch.delenv("BokjiRO_API_KEY", raising=False)
    monkeypatch.delenv("APP_CONFIG_FILE", raising=False)
    monkeypatch.setenv("DB_ENABLED", "false")
    monkeypatch.setattr(config, "BACKEND_ROOT", tmp_path)
    (tmp_path / ".env").write_text("BokjiRO_API_KEY=bokjiro-test-key\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path.parent)
    response = b'{"response":{"body":{"items":[]}}}'
    with patch(
        "app.modules.collectors.bokjiro_services.request_data_go_kr",
        return_value=response,
    ) as mocked:
        assert fetch_bokjiro_services() == []
    assert mocked.call_args.kwargs["api_key"] == "bokjiro-test-key"


def test_bokjiro_page_preserves_xml_metadata_and_raw_bytes():
    raw = ("<wantedList><resultCode>0</resultCode><totalCount>25</totalCount>"
           "<pageNo>2</pageNo><numOfRows>2</numOfRows><servList><servId>A</servId>"
           "<servNm>가상 공고</servNm></servList></wantedList>").encode()
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr",
               return_value=raw) as fetch:
        page = fetch_bokjiro_page(page=2, per_page=2, api_key="key", timeout=4,
                                 max_response_bytes=1000, deadline=123)
    assert page.rows == [{"servId": "A", "servNm": "가상 공고"}]
    assert (page.page, page.per_page, page.total_count, page.raw) == (2, 2, 25, raw)
    assert fetch.call_args.kwargs["params"]["pageNo"] == 2
    assert fetch.call_args.kwargs["max_response_bytes"] == 1000


def test_bokjiro_page_parses_single_json_item_and_empty_xml_page():
    raw = b'{"response":{"body":{"items":{"item":{"servId":"A"}},"totalCount":"1"}}}'
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr", return_value=raw):
        assert fetch_bokjiro_page(api_key="key").rows == [{"servId": "A"}]
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr",
               return_value=b'<wantedList><resultCode>0</resultCode><totalCount>0</totalCount></wantedList>'):
        page = fetch_bokjiro_page(api_key="key")
    assert page.rows == [] and page.total_count == 0


@pytest.mark.parametrize("raw", [
    b'<!DOCTYPE wantedList [<!ENTITY a "secret">]><wantedList/>',
    b'<!DOCTYPE wantedDtl><wantedDtl/>',
])
def test_bokjiro_xml_dtd_is_rejected_before_parsing(raw):
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr", return_value=raw), \
            pytest.raises(ValueError, match="DTD"):
        fetch_bokjiro_page(api_key="key")


def test_bokjiro_detail_forwards_http_bounds_and_preserves_repetitions():
    raw = (b'<wantedDtl><servId>A</servId>'
           b'<applmetList><applmetNm>First</applmetNm></applmetList>'
           b'<applmetList><applmetNm>Second</applmetNm></applmetList></wantedDtl>')
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr",
               return_value=raw) as fetch:
        detail = fetch_bokjiro_service_detail("A", api_key="key", timeout=4,
                                              max_response_bytes=1000, deadline=123)
    assert detail["applmetList"] == [{"applmetNm": "First"}, {"applmetNm": "Second"}]
    assert fetch.call_args.kwargs["timeout"] == 4
    assert fetch.call_args.kwargs["deadline"] == 123


def test_bokjiro_business_error_never_exposes_provider_message():
    from app.modules.collectors.data_go_kr import CollectionAPIError

    raw = (b'<wantedList><resultCode>30</resultCode>'
           b'<resultMessage>secret-key URL</resultMessage></wantedList>')
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr", return_value=raw), \
            pytest.raises(CollectionAPIError) as captured:
        fetch_bokjiro_page(api_key="key")
    assert str(captured.value) == "bokjiro_api_30"


def test_bokjiro_detail_page_preserves_original_bytes_and_rejects_wrong_identity():
    raw = b'<wantedDtl><servId>A</servId><servNm>Original</servNm></wantedDtl>'
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr", return_value=raw):
        page = fetch_bokjiro_detail_page("A", api_key="key")
    assert page.raw == raw and page.rows[0]["servId"] == "A"
    assert (page.page, page.per_page, page.total_count) == (1, 1, 1)
    with patch("app.modules.collectors.bokjiro_services.request_data_go_kr", return_value=raw), \
            pytest.raises(ValueError, match="identity"):
        fetch_bokjiro_detail_page("B", api_key="key")
