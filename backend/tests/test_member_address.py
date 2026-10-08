"""Optional member addresses persist, validate, and follow account consent/deletion."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import literal, select

from app.api.auth import ProfileInput
from app.contracts.matching import RecommendationProfile
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.consent import NOTICE_VERSION
from app.modules.auth.models import ADDRESS_FIELDS, accounts
from app.modules.matching.public import build_facts
from app.modules.regions.public import default_catalog
from app.modules.storage.catalog import region_matches
from tests.email_helpers import SIGNUP_CONSENT, verify_email
from tests.test_auth import PASSWORD, signup_body
from tests.test_signup_consent import pending_kakao

HEADERS = {"X-Auth-Request": "1"}
ADDRESS = {
    "postal_code": "04524",
    "address": "서울특별시 중구 세종대로 110",
    "address_detail": "101동 1001호",
}


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        _env_file=None,
        app_env="test",
        db_enabled=False,
        auth_sqlite_path=tmp_path / "member-address.sqlite3",
    )
    with TestClient(create_app(settings), headers=HEADERS) as value:
        yield value


def sign_in(client):
    verify_email(client)
    assert client.post("/v1/auth/signup", json=signup_body()).status_code == 201
    assert (
        client.post("/v1/auth/login", json={"username": "tester", "password": PASSWORD}).status_code
        == 200
    )


def test_address_update_persists_across_restart_partial_updates_and_explicit_removal(client):
    assert client.post("/v1/auth/profile", json=ADDRESS).status_code == 401
    sign_in(client)
    spaced = {key: "  " + value + "  " for key, value in ADDRESS.items()}
    response = client.post("/v1/auth/profile", json=spaced)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert {key: response.json()["user"][key] for key in ADDRESS_FIELDS} == ADDRESS
    with TestClient(create_app(client.app.state.settings), headers=HEADERS) as restarted:
        restarted.cookies.update(client.cookies)
        user = restarted.get("/v1/auth/me").json()["user"]
        assert {key: user[key] for key in ADDRESS_FIELDS} == ADDRESS
        # Older clients only update fields they know; a region/name edit preserves the address.
        response = restarted.post("/v1/auth/profile", json={"name": "주소회원", "region": "서울"})
        assert response.status_code == 200
        assert {key: response.json()["user"][key] for key in ADDRESS_FIELDS} == ADDRESS
        response = restarted.post("/v1/auth/profile", json=dict.fromkeys(ADDRESS_FIELDS))
        assert response.status_code == 200
        assert all(response.json()["user"][key] is None for key in ADDRESS_FIELDS)
        assert response.json()["user"]["region"] == "서울"
        with restarted.app.state.auth_service.engine.connect() as connection:
            stored = connection.execute(select(accounts)).mappings().one()
        assert all(stored[key] is None for key in ADDRESS_FIELDS)


@pytest.mark.parametrize("path", ["/signup", "/kakao/complete"])
@pytest.mark.parametrize("profile_consent", [False, True])
def test_signup_address_obeys_optional_profile_consent(client, path, profile_consent):
    if path == "/signup":
        verify_email(client)
        body = signup_body()
    else:
        pending_kakao(client)
        body = {"email": "member@example.com", "region": "서울"}
    body.update(ADDRESS, consent={**SIGNUP_CONSENT, "profile": profile_consent})
    response = client.post("/v1/auth" + path, json=body)
    assert response.status_code == 201, response.text
    if path == "/signup":
        assert (
            client.post(
                "/v1/auth/login", json={"username": "tester", "password": PASSWORD}
            ).status_code
            == 200
        )
    user = client.get("/v1/auth/me").json()["user"]
    expected = ADDRESS if profile_consent else dict.fromkeys(ADDRESS_FIELDS)
    assert {key: user[key] for key in ADDRESS_FIELDS} == expected
    with client.app.state.auth_service.engine.connect() as connection:
        stored = connection.execute(select(accounts)).mappings().one()
    assert {key: stored[key] for key in ADDRESS_FIELDS} == expected


@pytest.mark.parametrize(
    "invalid",
    [
        {"postal_code": "1234"},
        {"postal_code": "123456"},
        {"postal_code": 4524},
        {"postal_code": "０４５２４"},
        {"postal_code": "04524\n"},
        {"address": "가" * 201},
        {"address_detail": "가" * 201},
        {"address": "서울\n중구"},
        {"address_detail": "101동\x001호"},
    ],
)
def test_profile_rejects_invalid_address(invalid):
    with pytest.raises(ValidationError):
        ProfileInput(**invalid)


def test_profile_empty_address_is_optional():
    value = ProfileInput(postal_code="  ", address="", address_detail="  ")
    assert all(value.model_dump()[key] is None for key in ADDRESS_FIELDS)


def test_integrated_province_address_saves_and_remains_a_recommendation_fact(client):
    sign_in(client)
    address = {
        "region": "전남광주통합특별시",
        "postal_code": "61945",
        "address": "전남광주통합특별시 서구 내방로 111",
        "address_detail": "101호",
    }
    response = client.post("/v1/auth/profile", json=address)
    assert response.status_code == 200, response.text
    user = client.get("/v1/auth/me").json()["user"]
    assert {key: user[key] for key in address} == address
    preference = RecommendationProfile(region=address["region"])
    assert build_facts(user, preference).region == address["region"]
    assert build_facts(None, preference).region == address["region"]
    assert default_catalog().resolve(address["region"]).status == "resolved"
    with client.app.state.auth_service.engine.connect() as connection:
        for text, expected in [
            ("전남광주통합특별시 주민", True),
            ("전남광주 주민", True),
            ("광주광역시 주민", False),
        ]:
            assert (
                bool(connection.scalar(select(region_matches(literal(text), address["region"]))))
                is expected
            )
    with TestClient(create_app(client.app.state.settings), headers=HEADERS) as restarted:
        restarted.cookies.update(client.cookies)
        restored = restarted.get("/v1/auth/me").json()["user"]
        assert {key: restored[key] for key in address} == address


def test_withdrawal_removes_saved_address_and_keeps_other_account_address(client):
    sign_in(client)
    assert client.post("/v1/auth/profile", json=ADDRESS).status_code == 200
    verify_email(client, "second@example.com")
    body = signup_body(username="second", email="second@example.com", **ADDRESS)
    assert client.post("/v1/auth/signup", json=body).status_code == 201
    response = client.post(
        "/v1/auth/withdraw", json={"confirmation": True, "notice_version": NOTICE_VERSION}
    )
    assert response.status_code == 200, response.text
    with client.app.state.auth_service.engine.connect() as connection:
        remaining = connection.execute(select(accounts)).mappings().one()
    assert remaining["username"] == "second"
    assert {key: remaining[key] for key in ADDRESS_FIELDS} == ADDRESS


def test_profile_invalid_address_is_rejected_without_overwriting_saved_address(client):
    sign_in(client)
    assert client.post("/v1/auth/profile", json=ADDRESS).status_code == 200
    response = client.post("/v1/auth/profile", json={"postal_code": "bad", "address": "변경 주소"})
    assert response.status_code == 422
    user = client.get("/v1/auth/me").json()["user"]
    assert {key: user[key] for key in ADDRESS_FIELDS} == ADDRESS
