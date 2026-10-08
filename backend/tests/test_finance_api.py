"""Private financial facts stay account-scoped; guest estimates have no DB side effects."""

import json
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, inspect, select, update

from app.contracts.finance import FinancialProfile
from app.core.config import Settings
from app.main import create_app
from app.modules.auth.models import accounts, sessions
from app.modules.auth.service import digest
from app.modules.finance import public
from app.modules.finance.schema import initialize_finance_schema
from app.modules.finance.storage import financial_profiles

HEADERS = {"X-Auth-Request": "1"}
PROFILE = {
    "household_size": 1,
    "members": [
        {
            "age": 40,
            "earned_income": 1234567,
            "earned_income_basis": "gross",
            "business_income": 0,
            "business_income_basis": "net_expenses",
        }
    ],
    "assets": {"housing": None, "general": 0, "financial": 7654321},
}


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_sqlite_path=tmp_path / "finance-api.sqlite3",
        )
    )
    with TestClient(app, headers=HEADERS) as value:
        # Seed two sessions without depending on SMS or adding personal phone numbers.
        assert value.get("/v1/auth/me").status_code == 401
        engine = app.state.auth_service.engine
        with engine.begin() as connection:
            for index in (1, 2):
                connection.execute(
                    insert(accounts).values(
                        **dict(
                            id=f"account-{index}",
                            username=f"finance_{index}",
                            name="시험 계정",
                            password_hash="unused-in-this-test",
                            age=40,
                            gender="undisclosed",
                            region="서울",
                            phone=f"0100000000{index}",
                            created_at=1,
                        )
                    )
                )
                connection.execute(
                    insert(sessions).values(
                        token_hash=digest(f"finance-session-{index}"),
                        account_id=f"account-{index}",
                        expires_at=int(time.time()) + 3600,
                    )
                )
        value.cookies.set("bokji_session", "finance-session-1")
        yield value


def save(client, profile=None, **extra):
    return client.post(
        "/v1/finance/profile",
        json={
            "profile": PROFILE if profile is None else profile,
            "consent": True,
            **extra,
        },
    )


@pytest.mark.parametrize("auth_enabled", [True, False])
def test_guest_rules_and_calculation_do_not_create_a_database(tmp_path, auth_enabled):
    path = tmp_path / "never-created.sqlite3"
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_enabled=auth_enabled,
            auth_sqlite_path=path,
        )
    )
    with TestClient(app) as client:
        catalog = client.get("/v1/finance/rules")
        response = client.post("/v1/finance/calculate", json={"profile": PROFILE})
        assert catalog.status_code == response.status_code == 200
        assert isinstance(catalog.json(), dict) and isinstance(response.json(), dict)
        regional_rules = {
            item["region"]: item for item in catalog.json()["regional_property_rules"]
        }
        assert regional_rules["seoul"] == {
            "region": "seoul",
            "status": "supported",
            "basic_property_allowance": 99_000_000,
            "residential_property_limit": 172_000_000,
        }
        assert regional_rules["jeonnam_gwangju"] == {
            "region": "jeonnam_gwangju",
            "status": "unavailable",
            "basic_property_allowance": None,
            "residential_property_limit": None,
        }
        assert response.headers["cache-control"] == catalog.headers["cache-control"] == "no-store"
        assert app.state.auth_service is None and app.state.auth_engine is None
        assert app.state.finance_store is None and not path.exists()
        assert "set-cookie" not in response.headers


def test_save_get_recalculate_and_restart_preserve_only_raw_facts(client, monkeypatch):
    assert client.get("/v1/finance/profile").json() == {
        "profile": None,
        "calculation": None,
        "updated_at": None,
    }
    response = save(client)
    assert response.status_code == 200
    data = response.json()
    assert data["profile"] == FinancialProfile.model_validate(PROFILE).model_dump(mode="json")
    assert data["profile"]["members"][0]["other_income"] is None
    assert data["profile"]["assets"]["general"] == 0
    assert isinstance(data["calculation"], dict) and data["updated_at"]
    assert response.headers["cache-control"] == "no-store"
    engine = client.app.state.auth_service.engine
    with engine.connect() as connection:
        row = connection.execute(select(financial_profiles)).mappings().one()
    assert "1234567" in row["profile_json"]
    assert json.loads(row["profile_json"]) == data["profile"]
    assert row["account_id"] == "account-1"
    monkeypatch.setattr(public, "calculate", lambda _: {"test_marker": "recalculated"})
    response = client.get("/v1/finance/profile")
    assert response.json()["calculation"] == {"test_marker": "recalculated"}
    app = create_app(client.app.state.settings)
    with TestClient(app) as reopened:
        reopened.cookies.set("bokji_session", "finance-session-1")
        loaded = reopened.get("/v1/finance/profile")
        assert loaded.status_code == 200
        assert loaded.json()["profile"] == data["profile"]
        assert loaded.json()["updated_at"] == data["updated_at"]
        assert loaded.json()["calculation"] == {"test_marker": "recalculated"}


@pytest.mark.parametrize("occupation", ["student", "homemaker", "military", "other"])
def test_occupation_survives_save_load_and_rejects_invalid_choices(client, occupation):
    profile = {**PROFILE, "members": [{**PROFILE["members"][0], "occupation": occupation}]}
    response = save(client, profile)
    assert response.status_code == 200
    assert response.json()["profile"]["members"][0]["occupation"] == occupation
    loaded = client.get("/v1/finance/profile")
    assert loaded.json()["profile"]["members"][0]["occupation"] == occupation
    profile["members"][0]["occupation"] = "unsupported"
    assert save(client, profile).status_code == 422
    assert (
        client.get("/v1/finance/profile").json()["profile"]["members"][0]["occupation"]
        == occupation
    )


def test_account_isolation_update_delete_and_idempotent_delete(client):
    first = save(client).json()
    client.cookies.set("bokji_session", "finance-session-2")
    assert client.get("/v1/finance/profile").json()["profile"] is None
    second_profile = {"members": [{"earned_income": 0}], "household_size": 1}
    assert save(client, second_profile).status_code == 200
    second_profile["members"][0]["earned_income"] = 500
    assert save(client, second_profile).json()["profile"]["members"][0]["earned_income"] == 500
    assert client.post("/v1/finance/profile/delete", json={}).json() == {"deleted": True}
    assert client.post("/v1/finance/profile/delete", json={}).json() == {"deleted": True}
    assert client.get("/v1/finance/profile").json()["profile"] is None
    client.cookies.set("bokji_session", "finance-session-1")
    assert client.get("/v1/finance/profile").json()["profile"] == first["profile"]
    with client.app.state.auth_service.engine.connect() as connection:
        rows = connection.execute(select(financial_profiles.c.account_id)).all()
    assert rows == [("account-1",)]


@pytest.mark.parametrize("consent", [None, False, 1, "true"])
def test_explicit_boolean_consent_required(client, consent):
    body = {"profile": PROFILE}
    if consent is not None:
        body["consent"] = consent
    response = client.post("/v1/finance/profile", json=body)
    assert response.status_code == 422
    assert str(PROFILE["members"][0]["earned_income"]) not in response.text
    assert client.get("/v1/finance/profile").json()["profile"] is None


def test_client_cannot_choose_an_owner_or_persist_forged_calculations(client):
    assert save(client, account_id="account-2").status_code == 422
    assert save(client, calculation={"eligible": True}).status_code == 422
    assert save(client, {**PROFILE, "owner_id": "account-2"}).status_code == 422
    response = client.post("/v1/finance/profile/delete", json={"account_id": "account-2"})
    assert response.status_code == 422
    assert client.get("/v1/finance/profile").json()["profile"] is None


def test_session_header_expiry_and_logout_protect_member_data(client):
    assert save(client).status_code == 200
    client.headers.pop("X-Auth-Request")
    assert save(client).status_code == 403
    assert client.post("/v1/finance/profile/delete", json={}).status_code == 403
    client.headers.update(HEADERS)
    client.cookies.clear()
    assert client.get("/v1/finance/profile").status_code == 401
    assert save(client).status_code == 401
    client.cookies.set("bokji_session", "finance-session-1")
    assert client.post("/v1/auth/logout", json={}).status_code == 200
    client.cookies.set("bokji_session", "finance-session-1")
    assert client.get("/v1/finance/profile").status_code == 401
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(sessions).values(expires_at=1))
    client.cookies.set("bokji_session", "finance-session-2")
    assert save(client).status_code == 401
    assert client.post("/v1/finance/profile/delete", json={}).status_code == 401


def test_financial_validation_errors_never_echo_input_or_log_values(tmp_path, caplog):
    app = create_app(
        Settings(
            _env_file=None,
            app_env="test",
            db_enabled=False,
            auth_enabled=False,
            auth_sqlite_path=tmp_path / "unused.sqlite3",
        )
    )
    with TestClient(app) as client:
        for amount in ("private-financial-value", -987654321, 987654321.5, True):
            response = client.post(
                "/v1/finance/calculate",
                json={
                    "profile": {"members": [{"earned_income": amount}]},
                },
            )
            assert response.status_code == 422
            assert response.json() == {
                "detail": "금액과 필수 항목, 저장 동의 여부를 확인해 주세요.",
            }
            assert response.headers["cache-control"] == "no-store"
        response = client.post(
            "/v1/finance/calculate",
            content='{"private-financial-value":',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422 and "private-financial-value" not in response.text
    assert "private-financial-value" not in caplog.text and "987654321" not in caplog.text


def test_mysql_mode_never_automatically_creates_the_finance_table(client):
    # A seeded SQLite engine isolates this policy test; it does not claim live MySQL verification.
    client.app.state.settings.db_enabled = True
    engine = client.app.state.auth_service.engine
    assert "account_financial_profiles" not in inspect(engine).get_table_names()
    response = client.get("/v1/finance/profile")
    assert response.status_code == 503
    assert "account_financial_profiles" not in inspect(engine).get_table_names()
    assert "SELECT" not in response.text and "1234567" not in response.text
    initialize_finance_schema(engine)
    initialize_finance_schema(engine)
    assert save(client).status_code == 200


def test_corrupted_saved_data_returns_safe_error(client):
    assert save(client).status_code == 200
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(financial_profiles).values(profile_json='{"secret":"broken"}'))
    response = client.get("/v1/finance/profile")
    assert response.status_code == 503 and "secret" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_legacy_saved_income_and_car_evidence_loads_as_unknown(client):
    assert save(client).status_code == 200
    legacy = {
        **PROFILE,
        "members": [{"earned_income": 1234567, "business_income": 0}],
        "vehicle_status": "owned",
        "vehicles": [{"value": 9000000, "kind": "passenger", "use": "ordinary"}],
    }
    with client.app.state.auth_service.engine.begin() as connection:
        connection.execute(update(financial_profiles).values(profile_json=json.dumps(legacy)))
    response = client.get("/v1/finance/profile")
    assert response.status_code == 200
    data = response.json()
    assert data["profile"]["members"][0]["earned_income"] == 1234567
    assert data["profile"]["members"][0]["earned_income_basis"] == "unknown"
    assert data["profile"]["members"][0]["business_income_basis"] == "unknown"
    vehicle = data["profile"]["vehicles"][0]
    assert vehicle["value"] == 9000000
    for field in ("ownership", "registration_use", "value_basis", "eco_subsidy"):
        assert vehicle[field] == "unknown"
    assert data["calculation"]["median"]["monthly_income"] is None
    assert data["calculation"]["assets"]["vehicle_total"] == 9000000
    assert all(item["status"] == "needs_review" for item in data["calculation"]["assessments"])


def test_financial_basis_fields_are_saved_and_reloaded_without_reclassification(client):
    profile = {
        **PROFILE,
        "members": [{**PROFILE["members"][0], "earned_income_basis": "net"}],
        "vehicle_status": "owned",
        "vehicles": [
            {
                "value": 9000000,
                "ownership": "joint",
                "registration_use": "commercial",
                "value_basis": "market",
                "eco_subsidy": "received",
            }
        ],
    }
    saved = save(client, profile)
    assert saved.status_code == 200
    data = client.get("/v1/finance/profile").json()
    assert data["profile"] == FinancialProfile.model_validate(profile).model_dump(mode="json")
    assert data["calculation"]["median"]["monthly_income"] is None
    assert all(item["status"] == "needs_review" for item in data["calculation"]["assessments"])
