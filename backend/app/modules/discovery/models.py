"""Strict search candidates and deterministic URL validation without network access."""

import ipaddress
import re
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator

from app.contracts.parsing import StrictModel

DEFAULT_DOMAINS = ("youth.seoul.go.kr", "www.nowon.kr")
PRIVATE_SUFFIXES = ("localhost", "local", "internal", "home", "lan", "test", "invalid", "onion")
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "msclkid"}


def public_hostname(value: str) -> str:
    """Check hostname syntax only. A fetcher must validate resolved addresses separately."""
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError("Invalid public hostname")
    try:
        host = value.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError:
        raise ValueError("Invalid public hostname") from None
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("IP hosts are not allowed")
    labels = host.split(".")
    if (len(host) > 253 or len(labels) < 2 or labels[-1] in PRIVATE_SUFFIXES
            or not re.fullmatch(r"[a-z]{2,63}", labels[-1])
            or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                   for label in labels)
            or host == "localhost" or host.endswith(".localhost")):
        raise ValueError("Invalid public hostname")
    return host


def normalize_domains(domains: list[str]) -> list[str]:
    if not isinstance(domains, list) or len(domains) > 20:
        raise ValueError("Expected at most 20 reviewed official hostnames")
    return list(dict.fromkeys(public_hostname(value) for value in domains or DEFAULT_DOMAINS))


def canonicalize_url(value: str, domains: list[str] | None = None) -> str:
    """Remove tracking/fragment while retaining notice identifiers and checking exact hosts."""
    if not isinstance(value, str) or len(value) > 2048 or not value:
        raise ValueError("Invalid candidate URL")
    if any(ord(char) <= 32 or ord(char) == 127 for char in value) or "\\" in value:
        raise ValueError("Invalid candidate URL")
    try:
        parts = urlsplit(value)
        host = public_hostname(parts.hostname or "")
        port = parts.port
    except ValueError:
        raise ValueError("Invalid candidate URL") from None
    if (parts.scheme not in {"http", "https"} or parts.username is not None
            or parts.password is not None
            or port not in {None, 80 if parts.scheme == "http" else 443}
            or (domains is not None and host not in normalize_domains(domains))):
        raise ValueError("Candidate URL is outside the reviewed host allowlist")
    query = urlencode([(key, val) for key, val in parse_qsl(parts.query, keep_blank_values=True)
                       if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS])
    return urlunsplit((parts.scheme, host, parts.path or "/", query, ""))


class DiscoveryCandidate(StrictModel):
    url: str = Field(min_length=1, max_length=2048)
    title: str = Field(min_length=1, max_length=500)
    organization: str = Field(min_length=1, max_length=500)
    reason: str = Field(min_length=1, max_length=1000)
    evidence: str = Field(min_length=1, max_length=2000)
    evidence_status: Literal["search_snippet", "uncertain"]
    region: str | None = Field(default=None, max_length=200)
    application_period: str | None = Field(default=None, max_length=300)
    source_kind: Literal["official_notice", "official_program", "official_index"]

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return canonicalize_url(value)

    @field_validator("title", "organization", "reason", "evidence")
    @classmethod
    def required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Candidate text is missing")
        return value.strip()


class DiscoveryResponse(StrictModel):
    candidates: list[DiscoveryCandidate] = Field(max_length=10)
