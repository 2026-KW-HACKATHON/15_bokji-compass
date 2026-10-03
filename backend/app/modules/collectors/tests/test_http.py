"""Offline checks for public URL boundaries, response limits and pinned destinations."""

import socket
from email.message import Message
from io import BytesIO
from unittest.mock import Mock
from urllib.error import HTTPError
from urllib.request import Request

import pytest

from app.modules.collectors import http
from app.modules.collectors.data_go_kr import CollectionTransportError
from app.modules.collectors.kwangwoon_notices import (
    collect_kwangwoon_notice,
    collect_kwangwoon_notices,
)
from app.modules.collectors.public import collect_notice_from_url
from app.modules.collectors.seoul import collect_seoul_open_api
from app.modules.metrics.kwangwoon import count_kwangwoon_notices


@pytest.mark.parametrize("url", [
    "file:///C:/private.txt", "ftp://public.example/secret", "http://localhost/a",
    "http://127.0.0.1/a", "https://[::1]/a", "http://169.254.169.254/a",
    "https://user:password@public.example/", "https://public.example:8443/",
    "https://public.example\\@localhost/a", "https://public.example/\nheader",
])
def test_legacy_notice_rejects_nonpublic_urls_before_transport(url, tmp_path, monkeypatch):
    opener = Mock(side_effect=AssertionError("No request should start"))
    monkeypatch.setattr("app.modules.collectors.public.urlopen", opener)
    with pytest.raises(ValueError):
        collect_notice_from_url(url, tmp_path)
    opener.assert_not_called()


def test_official_adapters_reject_other_hosts_before_transport(tmp_path, monkeypatch):
    opener = Mock(side_effect=AssertionError("No request should start"))
    monkeypatch.setattr("app.modules.collectors.kwangwoon_notices.urlopen", opener)
    monkeypatch.setattr("app.modules.collectors.seoul.urlopen", opener)
    with pytest.raises(ValueError):
        collect_kwangwoon_notice("https://unrelated.example/notice?DUID=1", tmp_path)
    with pytest.raises(ValueError):
        collect_seoul_open_api(service_name="Service", api_key="secret",
                               base_url="https://unrelated.example", storage_path=tmp_path)
    opener.assert_not_called()


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"])
def test_public_hostname_resolving_to_private_address_never_connects(address, monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443)),
    ])
    connection = Mock(side_effect=AssertionError("Private address must not be contacted"))
    monkeypatch.setattr(http, "PinnedHTTPSConnection", connection)
    with pytest.raises(CollectionTransportError, match="private_address"), \
            http.urlopen(Request("https://public.example/notice")):
        pytest.fail("A private response must not be yielded")
    connection.assert_not_called()


@pytest.fixture
def response_transport(monkeypatch):
    response = BytesIO(b"safe response")
    response.status = 200
    response.headers = Message()
    response.getheader = lambda key, default=None: response.headers.get(key, default)
    connection = Mock()
    connection.getresponse.return_value = response
    factory = Mock(return_value=connection)
    resolver = Mock(return_value="8.8.8.8")
    monkeypatch.setattr(http, "resolve_public", resolver)
    monkeypatch.setattr(http, "PinnedHTTPSConnection", factory)
    return response, connection, factory, resolver


def test_public_address_is_pinned_and_response_is_closed(response_transport):
    _, connection, factory, resolver = response_transport
    with http.urlopen(Request("https://public.example/notice?id=1")) as response:
        assert http.read_response(response) == b"safe response"
    resolver.assert_called_once_with("public.example", 443, 15)
    assert factory.call_args.args[:2] == ("public.example", "8.8.8.8")
    assert connection.request.call_args.args[:2] == ("GET", "/notice?id=1")
    assert connection.request.call_args.kwargs["headers"]["Accept-Encoding"] == "identity"
    connection.close.assert_called_once()


@pytest.mark.parametrize("status", [301, 302, 307, 308])
def test_redirects_are_never_followed_or_echoed(response_transport, status):
    response, connection, factory, resolver = response_transport
    response.status = status
    response.headers["Location"] = "http://127.0.0.1/private-api-key"
    with pytest.raises(HTTPError) as error, \
            http.urlopen(Request("https://public.example/private-api-key")):
        pytest.fail("Redirect must not be returned as a response")
    assert "private-api-key" not in str(error.value)
    assert factory.call_count == resolver.call_count == 1
    connection.close.assert_called_once()


def test_bounded_stream_rejects_undeclared_oversized_response(response_transport, monkeypatch):
    _, connection, _, _ = response_transport
    monkeypatch.setattr(http, "MAX_RESPONSE_BYTES", 4)
    with pytest.raises(CollectionTransportError, match="response_too_large"), \
            http.urlopen(Request("https://public.example/")) as response:
        http.read_response(response)
    connection.close.assert_called_once()


def test_missing_notice_keeps_collection_and_metric_skip_contract(response_transport, tmp_path):
    response, connection, _, _ = response_transport
    response.status = 404
    assert collect_kwangwoon_notices(1, 2, tmp_path) == []
    assert count_kwangwoon_notices(1, 2) == 0
    assert connection.close.call_count == 4


def test_compressed_response_is_rejected_before_reading(response_transport):
    response, connection, _, _ = response_transport
    response.headers["Content-Encoding"] = "gzip"
    with pytest.raises(CollectionTransportError, match="encoding_unsupported"), \
            http.urlopen(Request("https://public.example/")):
        pytest.fail("Compressed response must not be returned")
    assert response.tell() == 0
    connection.close.assert_called_once()
