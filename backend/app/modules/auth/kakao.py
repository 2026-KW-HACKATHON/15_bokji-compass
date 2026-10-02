"""Kakao server-side OAuth. Provider tokens never leave this module."""

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import HTTPException


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def configured(settings):
    return bool(
        settings.kakao_client_id
        and settings.kakao_client_secret.get_secret_value()
        and settings.kakao_redirect_uri
        and settings.kakao_web_url
    )


def require_configuration(settings):
    if not configured(settings):
        raise HTTPException(503, "카카오 로그인을 준비 중이에요. 아이디로 로그인해 주세요.")
    for value in (settings.kakao_redirect_uri, settings.kakao_web_url):
        url = urlsplit(value)
        local = url.hostname in {"localhost", "127.0.0.1"}
        if (
            not url.netloc
            or url.username
            or url.password
            or url.query
            or url.fragment
            or (
                url.scheme != "https"
                and not (settings.app_env != "production" and local and url.scheme == "http")
            )
        ):
            raise HTTPException(503, "카카오 로그인 주소 설정을 확인해 주세요.")
    callback = urlsplit(settings.kakao_redirect_uri)
    web = urlsplit(settings.kakao_web_url)
    if (callback.scheme, callback.netloc) != (web.scheme, web.netloc):
        raise HTTPException(503, "카카오 로그인은 웹과 같은 출처의 API 프록시가 필요해요.")


def authorization_url(settings, state):
    return "https://kauth.kakao.com/oauth/authorize?" + urlencode(
        {
            "response_type": "code",
            "client_id": settings.kakao_client_id,
            "redirect_uri": settings.kakao_redirect_uri,
            "state": state,
        }
    )


def request_json(url, *, data=None, token=None):
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=utf-8"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(
        url, data=urlencode(data).encode() if data is not None else None, headers=headers
    )
    try:
        with build_opener(NoRedirect()).open(request, timeout=10) as response:
            body = response.read(262145)
            if len(body) > 262144:
                raise ValueError("Oversized provider response")
            result = json.loads(body)
            if not isinstance(result, dict):
                raise ValueError("Invalid provider response")
            return result
    except (HTTPError, URLError, TimeoutError, OSError, ValueError):
        raise HTTPException(503, "카카오 로그인에 연결하지 못했어요. 다시 시도해 주세요.") from None


def exchange_identity(settings, code):
    token = request_json(
        "https://kauth.kakao.com/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": settings.kakao_client_id,
            "client_secret": settings.kakao_client_secret.get_secret_value(),
            "redirect_uri": settings.kakao_redirect_uri,
            "code": code,
        },
    ).get("access_token")
    if not isinstance(token, str) or not token or len(token) > 4096:
        raise HTTPException(503, "카카오 인증 응답을 확인하지 못했어요.")
    info = request_json("https://kapi.kakao.com/v1/user/access_token_info", token=token)
    app_id = info.get("app_id")
    expires = info.get("expires_in")
    if type(app_id) is not int or app_id <= 0 or type(expires) is not int or expires <= 0:
        raise HTTPException(503, "카카오 인증 응답을 확인하지 못했어요.")
    user = request_json("https://kapi.kakao.com/v2/user/me", token=token)
    subject = user.get("id")
    if type(subject) is not int or subject <= 0 or len(str(subject)) > 32:
        raise HTTPException(503, "카카오 계정을 확인하지 못했어요.")
    if type(info.get("id")) is not int or info["id"] != subject:
        raise HTTPException(503, "카카오 계정을 확인하지 못했어요.")
    properties = user.get("properties")
    nickname = properties.get("nickname") if isinstance(properties, dict) else None
    if not isinstance(nickname, str) or any(ord(c) < 32 for c in nickname):
        nickname = ""
    return f"{app_id}:{subject}", nickname[:50]
