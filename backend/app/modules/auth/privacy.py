"""Read older encrypted backups during explicit migration; never encrypt new data."""

import base64
import hashlib
import hmac
import json
import re

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class PrivacyError(Exception):
    """Safe to handle without revealing keys, ciphertext or private input."""


def decode_key(value):
    try:
        if not isinstance(value, str):
            raise ValueError
        decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        if len(decoded) != 32:
            raise ValueError
        return decoded
    except (ValueError, TypeError):
        raise PrivacyError("Invalid privacy key configuration") from None


class LegacyCipher:
    def __init__(self, settings):
        try:
            keys = json.loads(settings.auth_encryption_keys.get_secret_value())
            if not isinstance(keys, dict) or not keys:
                raise ValueError
            if any(not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", key) for key in keys):
                raise ValueError
            self.keys = {key: AESGCM(decode_key(value)) for key, value in keys.items()}
            self.lookup_key = decode_key(settings.auth_lookup_key.get_secret_value())
            if any(
                hmac.compare_digest(self.lookup_key, decode_key(value)) for value in keys.values()
            ):
                raise ValueError
        except (ValueError, TypeError, PrivacyError):
            raise PrivacyError("Invalid privacy key configuration") from None

    def decrypt(self, value: str, context: str) -> str:
        try:
            marker, version, key_id, encoded = value.split(":", 3)
            if marker != "enc" or version != "v1":
                raise ValueError
            raw = base64.b64decode(encoded, altchars=b"-_", validate=True)
            if len(raw) < 28:
                raise ValueError
            return (
                self.keys[key_id]
                .decrypt(raw[:12], raw[12:], context.encode("utf-8"))
                .decode("utf-8")
            )
        except (AttributeError, ValueError, TypeError, KeyError, InvalidTag, UnicodeError):
            raise PrivacyError("Private data could not be authenticated") from None

    def decrypt_json(self, value: str, context: str) -> dict:
        try:
            result = json.loads(self.decrypt(value, context))
            if not isinstance(result, dict):
                raise ValueError
            return result
        except (ValueError, TypeError):
            raise PrivacyError("Invalid encrypted profile") from None

    def lookup(self, username: str) -> str:
        return hmac.new(
            self.lookup_key, ("username:v1:" + username.lower()).encode(), hashlib.sha256
        ).hexdigest()
