from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import pytest

from app.modules.collectors.data_go_kr import CollectionTransportError, request_data_go_kr


def test_request_data_go_kr_uses_backend_env_file(tmp_path, monkeypatch) -> None:
    from app.core import config

    monkeypatch.delenv("DATA_GO_KR_API_KEY", raising=False)
    monkeypatch.delenv("APP_CONFIG_FILE", raising=False)
    monkeypatch.setenv("DB_ENABLED", "false")
    monkeypatch.setattr(config, "BACKEND_ROOT", tmp_path)
    (tmp_path / ".env").write_text("DATA_GO_KR_API_KEY=file-test-key\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path.parent)
    response = BytesIO(b"ok")
    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response) as mocked:
        request_data_go_kr("https://example.go.kr/api")
    assert "serviceKey=file-test-key" in mocked.call_args.args[0].full_url


def test_request_data_go_kr_adds_service_key() -> None:
    response = BytesIO(b"<response />")

    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response) as mocked:
        assert request_data_go_kr(
            "https://example.go.kr/api", api_key="test-key", params={"pageNo": 1}
        ) == b"<response />"

    url = mocked.call_args.args[0].full_url
    assert "serviceKey=test-key" in url
    assert "pageNo=1" in url


def test_request_data_go_kr_uses_environment_key(monkeypatch) -> None:
    monkeypatch.setenv("DATA_GO_KR_API_KEY", "env-key")
    response = BytesIO(b"ok")

    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response) as mocked:
        request_data_go_kr("https://example.go.kr/api")

    assert "serviceKey=env-key" in mocked.call_args.args[0].full_url


def test_http_response_limit_rejects_oversized_payload():
    response = BytesIO(b"x" * 20)
    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response), \
            pytest.raises(CollectionTransportError, match="response_too_large"):
        request_data_go_kr("https://example.gov/api", api_key="private-key", max_response_bytes=5)


def test_http_content_length_limit_rejects_before_reading():
    response = BytesIO(b"x" * 20)
    response.headers = {"Content-Length": "20"}
    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response), \
            pytest.raises(CollectionTransportError, match="response_too_large"):
        request_data_go_kr("https://example.gov/api", api_key="private-key", max_response_bytes=5)


def test_http_rate_limit_has_safe_metadata_and_no_secret_url():
    error = HTTPError("https://example.gov/api?serviceKey=private-key", 429,
                      "remote private-key message", {"Retry-After": "12"}, BytesIO(b"secret"))
    with patch("app.modules.collectors.data_go_kr.urlopen", side_effect=error), \
            pytest.raises(CollectionTransportError) as captured:
        request_data_go_kr("https://example.gov/api", api_key="private-key")
    assert str(captured.value) == "http_429"
    assert captured.value.retryable and captured.value.status_code == 429
    assert captured.value.retry_after_seconds == 12
    assert captured.value.__suppress_context__


def test_http_transport_error_never_returns_remote_message():
    with patch("app.modules.collectors.data_go_kr.urlopen",
               side_effect=URLError("https://example.gov/?serviceKey=private-key")), \
            pytest.raises(CollectionTransportError) as captured:
        request_data_go_kr("https://example.gov/api", api_key="private-key")
    assert str(captured.value) == "request_failed" and captured.value.retryable


def test_http_deadline_prevents_any_request():
    with patch("app.modules.collectors.data_go_kr.time.monotonic", return_value=100), \
            patch("app.modules.collectors.data_go_kr.urlopen") as opener, \
            pytest.raises(CollectionTransportError, match="request_deadline"):
        request_data_go_kr("https://example.gov/api", api_key="private-key", deadline=99)
    opener.assert_not_called()


def test_http_deadline_bounds_open_timeout_and_is_checked_after_read():
    times = iter([100, 100, 100, 103])
    with (
        patch("app.modules.collectors.data_go_kr.time.monotonic", side_effect=lambda: next(times)),
        patch("app.modules.collectors.data_go_kr.urlopen", return_value=BytesIO(b"ok")) as opener,
        pytest.raises(CollectionTransportError, match="request_deadline"),
    ):
        request_data_go_kr("https://example.gov/api", api_key="private-key", deadline=102)
    assert opener.call_args.kwargs["timeout"] == 2


@pytest.mark.parametrize("options", [
    {"timeout": 0}, {"timeout": float("inf")}, {"timeout": True},
    {"max_response_bytes": 0}, {"max_response_bytes": 1.5},
    {"deadline": float("nan")},
])
def test_http_limits_reject_invalid_arguments_before_request(options):
    with patch("app.modules.collectors.data_go_kr.urlopen") as opener, pytest.raises(ValueError):
        request_data_go_kr("https://example.gov/api", api_key="private-key", **options)
    opener.assert_not_called()
