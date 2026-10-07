import pytest
from fastapi import HTTPException

from app.core.config import Settings
from app.modules.auth.ai_privacy import get_ai_notice, validate_ai_consent
from app.modules.auth.consent import NOTICE_VERSION, SignupConsentInput


def ready_settings(**overrides):
    return Settings(
        _env_file=None,
        **{
            "privacy_ai_enabled": True,
            "privacy_ai_provider": "테스트 수탁자",
            "privacy_ai_contact": "privacy@example.org",
            "privacy_ai_countries": ["테스트 국가"],
            "privacy_ai_retention": "테스트 요청 처리 후 삭제",
            "privacy_ai_training": "테스트 학습 미사용",
            **overrides,
        },
    )


def choice(ai=False, version=None):
    return SignupConsentInput(
        notice_version=NOTICE_VERSION,
        collection=True,
        ai=ai,
        ai_notice_version=version,
    )


def test_default_external_ai_pending_and_optional_refusal_remains_valid():
    settings = Settings(_env_file=None)
    notice = get_ai_notice(settings)
    assert notice["enabled"] is False
    assert notice["countries"] == [] and notice["retention"] == ""
    validate_ai_consent(choice(), settings)
    with pytest.raises(HTTPException) as rejected:
        validate_ai_consent(choice(True, notice["notice_version"]), settings)
    assert rejected.value.status_code == 503


@pytest.mark.parametrize(
    "missing",
    [
        "privacy_ai_provider",
        "privacy_ai_contact",
        "privacy_ai_retention",
        "privacy_ai_training",
        "privacy_ai_countries",
    ],
)
def test_incomplete_disclosure_cannot_enable_external_ai(missing):
    value = [" "] if missing == "privacy_ai_countries" else " "
    assert get_ai_notice(ready_settings(**{missing: value}))["enabled"] is False


@pytest.mark.parametrize(
    "change",
    [
        {"privacy_ai_provider": "새 수탁자"},
        {"privacy_ai_contact": "new@example.org"},
        {"privacy_ai_countries": ["다른 테스트 국가"]},
        {"privacy_ai_retention": "다른 보관기간"},
        {"privacy_ai_training": "다른 학습 정책"},
    ],
)
def test_every_material_notice_change_invalidates_previously_accepted_ai_choice(change):
    settings = ready_settings()
    accepted = choice(True, get_ai_notice(settings)["notice_version"])
    validate_ai_consent(accepted, settings)
    with pytest.raises(HTTPException) as rejected:
        validate_ai_consent(accepted, ready_settings(**change))
    assert rejected.value.status_code == 403


def test_ai_consent_needs_the_disclosed_version_instead_of_general_membership_consent():
    settings = ready_settings()
    with pytest.raises(HTTPException) as rejected:
        validate_ai_consent(choice(True), settings)
    assert rejected.value.status_code == 403
