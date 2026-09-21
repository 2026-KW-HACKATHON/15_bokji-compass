from unittest.mock import patch

from app.modules.collectors.data_go_kr import request_data_go_kr


def test_request_data_go_kr_uses_backend_env_file(tmp_path, monkeypatch) -> None:
    from app.core import config

    monkeypatch.delenv("DATA_GO_KR_API_KEY", raising=False)
    monkeypatch.delenv("APP_CONFIG_FILE", raising=False)
    monkeypatch.setenv("DB_ENABLED", "false")
    monkeypatch.setattr(config, "BACKEND_ROOT", tmp_path)
    (tmp_path / ".env").write_text("DATA_GO_KR_API_KEY=file-test-key\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path.parent)
    response = type(
        "Response", (), {
            "read": lambda self: b"ok",
            "__enter__": lambda self: self,
            "__exit__": lambda self, *args: None,
        },
    )()
    with patch("app.modules.collectors.data_go_kr.urlopen", return_value=response) as mocked:
        request_data_go_kr("https://example.go.kr/api")
    assert "serviceKey=file-test-key" in mocked.call_args.args[0].full_url


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
