from unittest.mock import patch

from app.modules.collectors.data_go_kr import request_data_go_kr


def test_request_data_go_kr_adds_service_key() -> None:
    response = type(
        "Response",
        (),
        {
            "read": lambda self: b"<response />",
            "__enter__": lambda self: self,
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response) as mocked:
        assert request_data_go_kr(
            "https://example.go.kr/api", api_key="test-key", params={"pageNo": 1}
        ) == b"<response />"

    url = mocked.call_args.args[0].full_url
    assert "serviceKey=test-key" in url
    assert "pageNo=1" in url


def test_request_data_go_kr_uses_environment_key(monkeypatch) -> None:
    monkeypatch.setenv("DATA_GO_KR_API_KEY", "env-key")
    response = type(
        "Response",
        (),
        {
            "read": lambda self: b"ok",
            "__enter__": lambda self: self,
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response) as mocked:
        request_data_go_kr("https://example.go.kr/api")

    assert "serviceKey=env-key" in mocked.call_args.args[0].full_url