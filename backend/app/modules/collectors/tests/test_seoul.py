import json
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from app.modules.collectors.seoul import collect_seoul_open_api


def test_collect_seoul_open_api_saves_welfare_rows(tmp_path: Path) -> None:
    payload = {
        "WelfareService": {
            "RESULT": {"CODE": "INFO-000", "MESSAGE": "정상 처리되었습니다"},
            "row": [
                {
                    "ID": "welfare-1",
                    "TITLE": "청년 월세 지원",
                    "DESCRIPTION": "서울시 청년 대상 주거 지원",
                    "REG_DATE": "2026-09-19",
                }
            ],
        }
    }
    response = type(
        "Response",
        (),
        {
            "read": BytesIO(json.dumps(payload).encode("utf-8")).read,
            "__enter__": lambda self: self,
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.seoul.urlopen", return_value=response) as mocked:
        documents = collect_seoul_open_api(
            service_name="WelfareService",
            api_key="test-key",
            storage_path=tmp_path,
        )

    assert documents[0].title == "청년 월세 지원"
    assert "서울시 청년 대상 주거 지원" in documents[0].text
    assert documents[0].source_url == "seoul-open-api://WelfareService/welfare-1"
    assert documents[0].published_at == "2026-09-19"
    assert mocked.call_args.args[0].full_url == (
        "http://openapi.seoul.go.kr:8088/test-key/json/WelfareService/1/1000/"
    )


def test_collect_seoul_open_api_uses_environment_key(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("SEOUL_OPEN_API_KEY", "env-key")
    payload = {"WelfareService": {"row": []}}
    response = type(
        "Response",
        (),
        {
            "read": BytesIO(json.dumps(payload).encode("utf-8")).read,
            "__enter__": lambda self: self,
            "__exit__": lambda self, *args: None,
        },
    )()

    with patch("app.modules.collectors.seoul.urlopen", return_value=response) as mocked:
        assert collect_seoul_open_api(service_name="WelfareService", storage_path=tmp_path) == []

    assert "/env-key/json/" in mocked.call_args.args[0].full_url
