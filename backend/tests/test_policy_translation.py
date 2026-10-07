"""Public translation uses published originals, durable caches and mocked model responses."""

import copy
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select

from app.api import policies
from app.contracts.translation import PolicyTranslation
from app.core.config import Settings
from app.main import create_app
from app.modules.llm import public as llm
from app.modules.llm.public import CodexRunError
from app.modules.policy_translation import public as translation
from app.modules.policy_translation.cache import TranslationCache, metadata, table
from app.modules.storage import catalog


@pytest.fixture
def translation_setup(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'translation.sqlite3'}")
    metadata.create_all(engine)
    repository = SimpleNamespace(engine=engine)
    original = {
        "id": "public-notice", "revisionId": "revision-1", "title": "청년 지원금",
        "summary": "2026년 청년 생활 지원", "audience": "18세 이상",
        "organization": "서울시", "benefit": "월 200,000원 지급",
        "applicationPeriod": "2026-10-01 ~ 2026-10-31", "paymentSchedule": None,
        "content": "신청 방법: https://example.org/apply\n문의 help@example.org",
        "gender": "성별 제한 없음", "contact": "02-123-4567",
        "applicationMethod": "온라인 신청", "otherConditions": ["거주 1년 이상"],
        "sourceFields": {"eligibility": "나이 18세 이상", "text": "신청 공고 본문"},
        "budgetNotice": None, "category": "생활·금융", "region": "서울",
        "applicationUrl": "https://example.org/apply", "popularity": 17,
    }
    state = {"policy": original, "calls": []}

    def published(repo, policy_id):
        assert repo is repository
        return copy.deepcopy(state["policy"]) if policy_id == "public-notice" else None

    monkeypatch.setattr(catalog, "get_policy", published)

    def translate(display, language, settings, output):
        state["calls"].append((display, language, settings, output))
        assert settings.codex_timeout_seconds <= 60
        values = display.model_dump()
        for key, value in values.items():
            if isinstance(value, str) and value:
                values[key] = f"{language}: {value}"
            elif isinstance(value, list):
                values[key] = [f"{language}: {item}" if item else "" for item in value]
            elif isinstance(value, dict):
                values[key] = {name: f"{language}: {item}" if item else ""
                               for name, item in value.items()}
        return PolicyTranslation.model_validate(values), {}

    monkeypatch.setattr(translation, "translate_policy_display", translate)
    settings = Settings(_env_file=None, db_enabled=False, auth_enabled=False)

    def application(configuration=settings):
        app = create_app(configuration)
        app.dependency_overrides[policies.translation_repository] = lambda: repository
        return app

    with TestClient(application()) as client:
        yield SimpleNamespace(engine=engine, repository=repository, state=state,
                              client=client, application=application, settings=settings,
                              translate=translate)
    engine.dispose()


def endpoint(language="en"):
    return f"/v1/policies/public-notice/translation?language={language}"


def test_korean_returns_allowlisted_original_without_provider_or_cache(translation_setup):
    setup = translation_setup
    response = setup.client.get(endpoint("ko"))
    assert response.status_code == 200
    body = response.json()
    assert body["translation"] == translation.display_fields(setup.state["policy"]).model_dump()
    assert body["source_language"] == body["language"] == "ko"
    assert body["policy_id"] == "public-notice"
    assert body["revision_id"] == "revision-1"
    assert len(body["source_hash"]) == 64 and body["cached"] is False
    assert "category" not in body["translation"]
    assert "applicationUrl" not in body["translation"]
    assert setup.state["calls"] == []
    with setup.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(table)) == 0


@pytest.mark.parametrize("language", ["en", "zh", "vi", "ja"])
def test_four_languages_generate_once_and_reuse_durable_cache(translation_setup, language):
    setup = translation_setup
    before = copy.deepcopy(setup.state["policy"])
    first = setup.client.get(endpoint(language))
    assert first.status_code == 200
    assert first.json()["cached"] is False
    assert first.json()["translation"]["title"].startswith(language + ": ")
    with TestClient(setup.application()) as recreated:
        second = recreated.get(endpoint(language))
    assert second.status_code == 200 and second.json()["cached"] is True
    assert len(setup.state["calls"]) == 1
    assert setup.state["policy"] == before
    display, target, _settings, output = setup.state["calls"][0]
    assert set(display.model_dump()) == set(PolicyTranslation.model_fields)
    assert target == language and not output.exists()


@pytest.mark.parametrize("change", ["revision", "content", "version"])
def test_revision_hash_and_prompt_version_invalidate_cache(translation_setup, monkeypatch, change):
    setup = translation_setup
    first = setup.client.get(endpoint()).json()
    if change == "revision":
        setup.state["policy"]["revisionId"] = "revision-2"
    elif change == "content":
        setup.state["policy"]["summary"] += " 수정"
    else:
        monkeypatch.setattr(translation, "PROMPT_VERSION", "policy-display-translation-v2")
    second = setup.client.get(endpoint())
    assert second.status_code == 200 and second.json()["cached"] is False
    assert len(setup.state["calls"]) == 2
    if change == "content":
        assert first["source_hash"] != second.json()["source_hash"]


def test_withdrawn_policy_does_not_expose_cached_translation(translation_setup):
    setup = translation_setup
    assert setup.client.get(endpoint()).status_code == 200
    setup.state["policy"] = None
    response = setup.client.get(endpoint())
    assert response.status_code == 404
    assert response.json() == {"detail": {"code": "policy_not_found"}}
    assert len(setup.state["calls"]) == 1


def test_publication_rechecked_after_generation(translation_setup, monkeypatch):
    setup = translation_setup

    def withdraw(*args):
        result = setup.translate(*args)
        setup.state["policy"] = None
        return result

    monkeypatch.setattr(translation, "translate_policy_display", withdraw)
    assert setup.client.get(endpoint()).status_code == 404
    with setup.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(table)) == 0


@pytest.mark.parametrize("query", [
    "", "language=fr", "language=en&text=private", "language=en&language=ja",
    "language=en&profile=private", "language=en&policy_id=another",
])
def test_only_language_query_accepted(translation_setup, query):
    setup = translation_setup
    response = setup.client.get(
        "/v1/policies/public-notice/translation" + ("?" + query if query else ""))
    assert response.status_code == 422
    assert response.json() == {"detail": {"code": "translation_invalid_request"}}
    assert setup.state["calls"] == []


def test_no_arbitrary_submitted_body(translation_setup):
    setup = translation_setup
    response = setup.client.request("GET", endpoint(), json={"text": "private member information"})
    assert response.status_code == 422
    assert "private member" not in response.text and setup.state["calls"] == []


@pytest.mark.parametrize("fault", ["number", "date", "url", "email", "keys", "conditions",
                                   "null", "extra", "missing", "unchanged"])
def test_invalid_model_output_is_not_served_or_cached(translation_setup, monkeypatch, fault):
    setup = translation_setup

    def invalid(*args):
        value, metadata = setup.translate(*args)
        data = value.model_dump()
        if fault == "number":
            data["benefit"] = data["benefit"].replace("200,000", "300,000")
        elif fault == "date":
            data["applicationPeriod"] = data["applicationPeriod"].replace(
                "2026-10-01", "2026-01-10")
        elif fault == "url":
            data["content"] = data["content"].replace("example.org", "attacker.org")
        elif fault == "email":
            data["content"] = data["content"].replace("help@", "other@")
        elif fault == "keys":
            data["sourceFields"]["new"] = data["sourceFields"].pop("text")
        elif fault == "conditions":
            data["otherConditions"] = []
        elif fault == "null":
            data["paymentSchedule"] = "Every month"
        elif fault == "extra":
            data["applicationUrl"] = "https://attacker.org"
        elif fault == "missing":
            del data["summary"]
        else:
            data = args[0].model_dump()
        return data, metadata

    monkeypatch.setattr(translation, "translate_policy_display", invalid)
    response = setup.client.get(endpoint())
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "translation_unavailable"}}
    with setup.engine.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(table)) == 0
    assert setup.client.app.state.policy_translation_slots.acquire(blocking=False)
    setup.client.app.state.policy_translation_slots.release()


def test_provider_failure_is_safe_and_releases_slot(translation_setup, monkeypatch):
    setup = translation_setup

    def unavailable(*args):
        raise CodexRunError("token=must-not-leak")

    monkeypatch.setattr(translation, "translate_policy_display", unavailable)
    response = setup.client.get(endpoint())
    assert response.status_code == 503 and "must-not-leak" not in response.text
    assert setup.client.app.state.policy_translation_slots.acquire(blocking=False)
    setup.client.app.state.policy_translation_slots.release()


def test_busy_and_disabled_do_not_call_provider(translation_setup):
    setup = translation_setup
    slots = setup.client.app.state.policy_translation_slots
    slots.acquire()
    try:
        response = setup.client.get(endpoint())
    finally:
        slots.release()
    assert response.status_code == 429 and response.headers["Retry-After"] == "30"
    disabled = setup.settings.model_copy(update={"policy_translation_enabled": False})
    with TestClient(setup.application(disabled)) as client:
        assert client.get(endpoint()).status_code == 503
        assert client.get(endpoint("ko")).status_code == 200
    assert setup.state["calls"] == []


def test_cache_schema_not_created_by_request(translation_setup):
    setup = translation_setup
    metadata.drop_all(setup.engine)
    assert setup.client.get(endpoint()).status_code == 503
    assert setup.client.get(endpoint("ko")).status_code == 200
    assert setup.state["calls"] == []


def test_source_size_is_bounded_without_truncation(translation_setup):
    setup = translation_setup
    setup.state["policy"]["content"] = "공개 본문" * 500
    limited = setup.settings.model_copy(update={"policy_translation_max_input_chars": 1000})
    with TestClient(setup.application(limited)) as client:
        assert client.get(endpoint()).status_code == 503
    assert setup.state["calls"] == []


def test_unavailable_repository_has_machine_error_and_openapi_contract():
    app = create_app(Settings(_env_file=None, db_enabled=False, auth_enabled=False))
    with TestClient(app) as client:
        response = client.get(endpoint())
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "translation_unavailable"}}
    route = app.openapi()["paths"]["/v1/policies/{policy_key}/translation"]["get"]
    assert route["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/PolicyTranslationResponse"}


def test_unpublished_id_never_calls_provider(translation_setup):
    setup = translation_setup
    response = setup.client.get("/v1/policies/unknown/translation?language=en")
    assert response.status_code == 404 and setup.state["calls"] == []


def test_daily_budget_is_durable_and_cache_hits_are_free(translation_setup):
    setup = translation_setup
    limited = setup.settings.model_copy(update={"policy_translation_daily_calls": 1})
    with TestClient(setup.application(limited)) as client:
        assert client.get(endpoint("en")).status_code == 200
    with TestClient(setup.application(limited)) as client:
        assert client.get(endpoint("en")).json()["cached"] is True
        response = client.get(endpoint("ja"))
        assert response.status_code == 429
        assert 1 <= int(response.headers["Retry-After"]) <= 86400
    assert len(setup.state["calls"]) == 1
    cache = TranslationCache(setup.engine)
    assert cache.reserve_call("2099-01-01", 1) is True
    assert cache.reserve_call("2099-01-01", 1) is False
    assert cache.reserve_call("2099-01-02", 1) is True


def test_failed_generation_consumes_daily_budget(translation_setup, monkeypatch):
    setup = translation_setup
    limited = setup.settings.model_copy(update={"policy_translation_daily_calls": 1})

    def unavailable(*args):
        raise CodexRunError("offline")

    monkeypatch.setattr(translation, "translate_policy_display", unavailable)
    with TestClient(setup.application(limited)) as client:
        assert client.get(endpoint()).status_code == 503
    with TestClient(setup.application(limited)) as client:
        assert client.get(endpoint()).status_code == 429


def test_llm_wrapper_only_sends_display_with_closed_output_keys(translation_setup, monkeypatch):
    setup = translation_setup
    display = translation.display_fields(setup.state["policy"])
    captured = {}

    def structured(source, settings, output, model, prompt, response_model, version, **kwargs):
        captured.update(source=source, prompt=prompt, **kwargs)
        return display, {}

    monkeypatch.setattr(llm, "_extract_structured", structured)
    llm.translate_policy_display(display, "zh", setup.settings, None)
    assert captured["source"] is None
    assert captured["payload"] == display.model_dump()
    assert "Simplified Chinese" in captured["prompt"]
    fields = captured["output_schema"]["properties"]["sourceFields"]
    assert fields["additionalProperties"] is False
    assert set(fields["required"]) == set(display.sourceFields)
    assert "id" not in captured["payload"] and "category" not in captured["payload"]
    with pytest.raises(ValueError, match="Unsupported"):
        llm.translate_policy_display(display, "fr", setup.settings, None)


def test_daily_budget_reservation_is_atomic(translation_setup):
    setup = translation_setup
    cache = TranslationCache(setup.engine)
    with ThreadPoolExecutor(max_workers=8) as pool:
        reservations = list(pool.map(lambda _: cache.reserve_call("2099-03-01", 2), range(8)))
    assert reservations.count(True) == 2


def test_publication_rechecked_after_cache_read(translation_setup, monkeypatch):
    setup = translation_setup
    assert setup.client.get(endpoint()).status_code == 200
    original_get = TranslationCache.get

    def withdraw_after_read(cache, key):
        value = original_get(cache, key)
        setup.state["policy"] = None
        return value

    monkeypatch.setattr(TranslationCache, "get", withdraw_after_read)
    assert setup.client.get(endpoint()).status_code == 404
    assert len(setup.state["calls"]) == 1


@pytest.mark.parametrize(("source", "translated"), [
    ("https://example.com에서 신청", "Apply at https://example.com"),
    ("https://example.com으로 신청", "Apply at https://example.com"),
    ("https://example.com/apply에서 신청", "Apply at https://example.com/apply"),
    ("https://example.com/apply?id=1에서 신청", "Apply at https://example.com/apply?id=1"),
    ("(https://example.com)", "Official link: https://example.com"),
    ("(https://example.com).", "Official link: https://example.com"),
    ("(https://example.com/a_(b))", "Official link: https://example.com/a_(b)"),
    ("[https://example.com/a_(b)]", "Official link: https://example.com/a_(b)"),
    ("https://example.com/서비스에서", "Link: https://example.com/서비스에서"),
    ("https://example.com/에서", "Link: https://example.com/에서"),
    ("https://example.com/apply?where=에서", "Link: https://example.com/apply?where=에서"),
    ("https://example.com/apply?where=서비스에서", "Link: https://example.com/apply?where=서비스에서"),
    ("https://example.com/a?x=1&y=2#part", "Link: https://example.com/a?x=1&y=2#part"),
    ("https://example.com/%EA%B0%80?x=a(b)", "Link: https://example.com/%EA%B0%80?x=a(b)"),
    ("접수2026-10-07마감", "Deadline 2026-10-07"),
])
def test_protected_tokens_distinguish_korean_prose_and_url_wrappers(source, translated):
    translation._validate_text(source, translated)


@pytest.mark.parametrize(("source", "translated"), [
    ("접수2026-10-07마감", "Deadline 2026-07-10"),
    ("(https://example.com/a_(b))", "Link: https://example.com/a_b"),
    ("https://example.com/서비스에서", "Link: https://example.com/서비스"),
    ("https://example.com/에서", "Link: https://example.com/"),
    ("https://example.com/apply?where=에서", "Link: https://example.com/apply?where="),
    ("https://example.com/apply?where=서비스에서", "Link: https://example.com/apply?where=서비스"),
    ("https://example.com/a?x=1&y=2#part", "Link: https://example.com/a?x=2&y=1#part"),
    ("https://example.com/a?x=a!", "Link: https://example.com/a?x=a"),
])
def test_protected_token_scanning_still_rejects_actual_target_changes(source, translated):
    with pytest.raises(ValueError, match="protected"):
        translation._validate_text(source, translated)


@pytest.mark.parametrize(("source", "translated"), [
    ("-20도", "20 degrees"),
    ("-20도", "+20 degrees"),
    ("+20도", "-20 degrees"),
    ("+20도", "20 degrees"),
    ("-20.5도", "20.5 degrees"),
])
def test_explicit_numeric_sign_cannot_disappear_or_flip(source, translated):
    with pytest.raises(ValueError, match="protected"):
        translation._validate_text(source, translated)


@pytest.mark.parametrize(("source", "translated"), [
    ("-20도", "-20 degrees"),
    ("+20도", "+20 degrees"),
    ("접수2026-10-07마감", "Deadline 2026-10-07"),
    ("문의02-123-4567", "Contact 02-123-4567"),
])
def test_numeric_sign_scanning_preserves_dates_and_phone_separators(source, translated):
    translation._validate_text(source, translated)
