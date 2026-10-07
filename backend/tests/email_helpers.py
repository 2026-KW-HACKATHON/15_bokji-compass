"""Mailbox capture used only by offline tests, never by the application."""

mailbox = {}
SIGNUP_CONSENT = {
    "notice_version": "2026-10-07.2",
    "collection": True,
    "profile": True,
    "ai": False,
}


def verify_email(client, email="tester@example.com"):
    response = client.post("/v1/auth/email/request", json={"email": email})
    assert response.status_code == 200, response.text
    response = client.post("/v1/auth/email/verify", json={"email": email, "code": mailbox[email]})
    assert response.status_code == 200, response.text
    return client.cookies.get("bokji_signup_email")
