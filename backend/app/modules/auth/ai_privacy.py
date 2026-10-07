"""External AI is available only with complete disclosure and current explicit consent."""

import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select

from app.modules.auth.consent import NOTICE_VERSION
from app.modules.auth.models import auth_consents

CONSENT_REQUIRED = "AI 질문 이용을 위한 개인정보 처리 안내 및 동의가 필요합니다."
AI_PENDING = "AI 질문의 개인정보 처리 안내를 준비 중입니다. 준비된 공고 안내를 이용해 주세요."


def get_ai_notice(settings):
    """Describe the actual configured recipient, without guessing countries or retention."""
    countries = [country.strip() for country in settings.privacy_ai_countries]
    detail = {
        "enabled": False,
        "provider_name": settings.privacy_ai_provider.strip(),
        "contact": settings.privacy_ai_contact.strip(),
        "countries": countries,
        "retention": settings.privacy_ai_retention.strip(),
        "training": settings.privacy_ai_training.strip(),
        "items": ["질문 내용", "회원 지역", "연령대"],
        "purpose": "복지 공고에 관한 AI 답변 제공",
        "transfer_time": "AI 질문 제출 시",
        "transfer_method": "암호화된 네트워크 통신",
    }
    detail["enabled"] = bool(
        settings.privacy_ai_enabled
        and detail["provider_name"]
        and detail["contact"]
        and countries
        and all(countries)
        and detail["retention"]
        and detail["training"]
    )
    content = json.dumps(detail, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    detail["notice_version"] = hashlib.sha256(content.encode("utf-8")).hexdigest()
    return detail


def _ready_notice(settings):
    notice = get_ai_notice(settings)
    if not notice["enabled"]:
        raise HTTPException(503, AI_PENDING)
    return notice


def validate_ai_consent(consent, settings):
    """Accepting membership does not imply accepting the optional external AI request."""
    if consent.ai is not True:
        return
    notice = _ready_notice(settings)
    if consent.ai_notice_version != notice["notice_version"]:
        raise HTTPException(403, CONSENT_REQUIRED)


def require_member_ai_consent(service, account_id, settings):
    """Check the authenticated account before a model request or its rate limit is used."""
    notice = _ready_notice(settings)
    with service.engine.connect() as connection:
        consent = (
            connection.execute(
                select(auth_consents).where(auth_consents.c.account_id == account_id)
            )
            .mappings()
            .first()
        )
    if (
        consent is None
        or consent["notice_version"] != NOTICE_VERSION
        or consent["collection"] is not True
        or consent["ai"] is not True
        or consent["ai_notice_version"] != notice["notice_version"]
    ):
        raise HTTPException(403, CONSENT_REQUIRED)
