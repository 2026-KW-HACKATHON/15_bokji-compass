"""Signup email delivery through a TLS-protected SMTP connection."""

import re
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import HTTPException

EMAIL_SECONDS = 600
RESEND_SECONDS = 60


def normalize_email(value: str) -> str:
    """Accept a single ASCII mailbox, without display names or header characters."""
    value = value.strip().lower()
    local, separator, domain = value.partition("@")
    atom = r"[a-z0-9!#$%&'*+/=?^_`{|}~-]+"
    labels = domain.split(".")
    if (
        len(value) > 254
        or not separator
        or len(local) > 64
        or not re.fullmatch(atom + r"(?:\." + atom + r")*", local)
        or len(labels) < 2
        or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)
        or not re.search(r"[a-z]", labels[-1])
    ):
        raise ValueError("올바른 이메일 주소를 입력해 주세요.")
    return value


def send_verification_code(settings, recipient: str, code: str):
    if settings is None:
        raise HTTPException(503, "인증 메일 발송 설정이 필요해요. 관리자에게 문의해 주세요.")
    try:
        sender = normalize_email(settings.smtp_from_email)
    except ValueError:
        raise HTTPException(
            503, "인증 메일 발송 설정이 필요해요. 관리자에게 문의해 주세요."
        ) from None
    password = settings.smtp_password.get_secret_value()
    if not settings.smtp_host or bool(settings.smtp_username) != bool(password):
        raise HTTPException(503, "인증 메일 발송 설정이 필요해요. 관리자에게 문의해 주세요.")
    message = EmailMessage()
    message["Subject"] = "[복지나침반] 회원가입 이메일 인증번호"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        f"복지나침반 회원가입 인증번호는 {code}입니다.\n\n"
        "10분 안에 가입 화면에 입력해 주세요.\n"
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요.\n"
    )
    context = ssl.create_default_context()
    transport = smtplib.SMTP_SSL if settings.smtp_security == "ssl" else smtplib.SMTP
    options = {"context": context} if settings.smtp_security == "ssl" else {}
    try:
        with transport(settings.smtp_host, settings.smtp_port, timeout=10, **options) as smtp:
            if settings.smtp_security == "starttls":
                smtp.starttls(context=context)
            if settings.smtp_username:
                smtp.login(settings.smtp_username, password)
            if smtp.send_message(message):
                raise smtplib.SMTPException("Recipient refused")
    except (OSError, smtplib.SMTPException):
        # SMTP responses can contain addresses, credentials or the code; never expose them.
        raise HTTPException(
            503, "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요."
        ) from None
