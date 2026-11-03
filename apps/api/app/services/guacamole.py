"""Apache Guacamole access for players: one signed, short-lived link per console, no Guacamole accounts.

Players never see Proxmox. Guacamole's *Encrypted JSON Authentication* extension logs a user in from a
payload that OxBlood signs and encrypts with a shared secret: it names the user, says when the login
expires, and lists exactly the connections that user may open. Guacamole keeps no account for them, so
there is nothing to clean up and no shared Guacamole password.

Payload format (extension ``guacamole-auth-json``): HMAC-SHA256 of the JSON with the key, the 32-byte
signature prepended to the JSON, the whole encrypted with AES-128-CBC (PKCS7 padding, zero IV), then
base64. The key is 128 bits, written as 32 hex characters.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from dataclasses import dataclass
from urllib.parse import quote

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

_KEY_RE = re.compile(r"^[0-9a-fA-F]{32}$")
_USER_RE = re.compile(r"[^a-z0-9_-]+")


class GuacamoleError(RuntimeError):
    """Guacamole access is not configured, or cannot be built for this request."""


@dataclass(frozen=True)
class GuacamoleConfig:
    url: str  # public base, e.g. https://gateway.example/guacamole
    secret_hex: str

    @staticmethod
    def from_settings(url: str | None, secret: str | None) -> GuacamoleConfig | None:
        """None when either setting is missing: players then keep the existing console path."""
        if not url or not secret:
            return None
        if not _KEY_RE.match(secret):
            raise GuacamoleError(
                "DIVIDE_GUACAMOLE_JSON_SECRET must be 32 hex characters (128 bits)."
            )
        return GuacamoleConfig(url=url.rstrip("/"), secret_hex=secret)


def encrypt_payload(secret_hex: str, payload: dict) -> str:
    key = bytes.fromhex(secret_hex)
    body = json.dumps(payload, separators=(",", ":")).encode()
    signed = hmac.new(key, body, hashlib.sha256).digest() + body
    padder = padding.PKCS7(128).padder()
    padded = padder.update(signed) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(b"\0" * 16)).encryptor()
    return base64.b64encode(encryptor.update(padded) + encryptor.finalize()).decode("ascii")


def decrypt_payload(secret_hex: str, data: str) -> dict:
    """The inverse, used by tests; raises ValueError when the signature does not match."""
    key = bytes.fromhex(secret_hex)
    decryptor = Cipher(algorithms.AES(key), modes.CBC(b"\0" * 16)).decryptor()
    unpadder = padding.PKCS7(128).unpadder()
    signed = (
        unpadder.update(decryptor.update(base64.b64decode(data)) + decryptor.finalize())
        + unpadder.finalize()
    )
    signature, body = signed[:32], signed[32:]
    if not hmac.compare_digest(signature, hmac.new(key, body, hashlib.sha256).digest()):
        raise ValueError("signature mismatch")
    return json.loads(body)


def linux_username(sub: str) -> str:
    """A safe Linux login name for a player: lower case letters, digits, '_' and '-', starting with a letter."""
    name = re.sub(r"-{2,}", "-", _USER_RE.sub("-", sub.lower())).strip("-_")
    if not name or not name[0].isalpha():
        name = f"p-{name}"
    return name[:31]


def session_password(seed: str, asset_id: int, user_id: int) -> str:
    """The player's own password on one machine, derived so it never has to be stored."""
    digest = hmac.new(
        seed.encode(), f"session:{asset_id}:{user_id}".encode(), hashlib.sha256
    ).digest()
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(alphabet[b % len(alphabet)] for b in digest[:16])


def rdp_connection(host: str, username: str, password: str, port: int = 3389) -> dict:
    return {
        "protocol": "rdp",
        "parameters": {
            "hostname": host,
            "port": str(port),
            "username": username,
            "password": password,
            "security": "any",
            "ignore-cert": "true",
            "resize-method": "display-update",
            "enable-wallpaper": "false",
        },
    }


def launch_url(
    config: GuacamoleConfig, sub: str, connections: dict[str, dict], ttl_s: int = 3600
) -> tuple[str, int]:
    """The link a player opens. Returns it with the Unix time (ms) it stops working."""
    expires = int((time.time() + ttl_s) * 1000)
    data = encrypt_payload(
        config.secret_hex, {"username": sub, "expires": expires, "connections": connections}
    )
    return f"{config.url}/#/?data={quote(data, safe='')}", expires
