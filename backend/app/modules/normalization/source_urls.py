"""Resolve official notice links from provider metadata and stable service IDs."""

import re
from urllib.parse import quote, urlsplit


def public_source_url(value):
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    try:
        parsed = urlsplit(value)
        if (parsed.scheme.lower() in {"https", "http"} and parsed.hostname
                and not parsed.username and not parsed.password):
            return value
    except ValueError:
        pass
    return None


def policy_source_url(policy_key, source_url=None, listing=None):
    """Prefer supplied HTTP(S) links; recover missing Gov24/Bokjiro detail links."""
    direct = public_source_url(source_url)
    if direct:
        return direct
    provider, separator, identity = str(policy_key).partition(":")
    listing = listing if isinstance(listing, dict) else {}
    keys = {"gov24": ("상세조회URL", "detailUrl", "url"),
            "bokjiro": ("servDtlLink", "detailUrl", "url"),
            "notice": ("source_url", "url")}.get(provider, ())
    for key in keys:
        supplied = public_source_url(listing.get(key))
        if supplied:
            return supplied
    if not separator:
        return None
    if provider == "gov24" and re.fullmatch(r"[A-Z0-9]{12}", identity):
        return "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/" + quote(identity, safe="")
    if provider == "bokjiro" and re.fullmatch(r"WLF[0-9]{8}", identity):
        return ("https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/"
                "moveTWAT52011M.do?wlfareInfoId=" + quote(identity, safe=""))
    return None
