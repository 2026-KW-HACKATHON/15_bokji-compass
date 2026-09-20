import json
from unittest.mock import patch

from app.modules.collectors.gov24_services import (
    fetch_recent_public_services,
    format_public_services,
)


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