"""The Guacamole login payload: signed, encrypted, short-lived, one player."""

from __future__ import annotations

import time
from urllib.parse import parse_qs, urlparse

import pytest
from app.services.guacamole import (
    GuacamoleConfig,
    GuacamoleError,
    decrypt_payload,
    encrypt_payload,
    launch_url,
    linux_username,
    rdp_connection,
    session_password,
)

KEY = "4c0b569e4c96df157eee1b65dd0e4d41"


def test_payload_round_trips_and_a_wrong_key_or_tampering_is_caught():
    payload = {
        "username": "ana",
        "expires": 1,
        "connections": {"RED01": rdp_connection("10.0.0.5", "ana", "pw")},
    }
    data = encrypt_payload(KEY, payload)
    assert decrypt_payload(KEY, data) == payload
    with pytest.raises(ValueError):
        decrypt_payload("00" * 16, data)  # another key
    flipped = bytearray(__import__("base64").b64decode(data))
    flipped[40] ^= 1
    with pytest.raises(Exception):  # noqa: B017 - corrupt padding or a bad signature, either is a refusal
        decrypt_payload(KEY, __import__("base64").b64encode(bytes(flipped)).decode())


def test_launch_link_carries_one_user_one_connection_and_an_expiry():
    cfg = GuacamoleConfig(url="https://gw.example/guacamole", secret_hex=KEY)
    before = time.time()
    url, expires = launch_url(
        cfg,
        "ana.smith",
        {"red workstation": rdp_connection("10.30.10.10", "ana-smith", "pw")},
        ttl_s=600,
    )
    assert url.startswith("https://gw.example/guacamole/#/?data=")
    payload = decrypt_payload(KEY, parse_qs(urlparse(url.replace("#/", "")).query)["data"][0])
    assert payload["username"] == "ana.smith" and list(payload["connections"]) == [
        "red workstation"
    ]
    assert payload["connections"]["red workstation"]["parameters"]["hostname"] == "10.30.10.10"
    assert before * 1000 + 590_000 <= payload["expires"] == expires <= (time.time() + 601) * 1000


def test_it_is_off_unless_both_settings_exist_and_the_key_is_128_bits():
    assert GuacamoleConfig.from_settings(None, KEY) is None
    assert GuacamoleConfig.from_settings("https://gw", None) is None
    assert (
        GuacamoleConfig.from_settings("https://gw/", KEY).url == "https://gw"
    )  # no trailing slash
    with pytest.raises(GuacamoleError):
        GuacamoleConfig.from_settings("https://gw", "too-short")


def test_player_logins_are_safe_and_passwords_are_derived_per_machine_and_player():
    assert linux_username("Ana.Smith") == "ana-smith"
    assert linux_username("9lives") == "p-9lives"
    assert linux_username("x; rm -rf /") == "x-rm-rf"  # nothing that could reach a shell
    assert len(linux_username("a" * 60)) == 31
    one = session_password("seed", asset_id=1, user_id=1)
    assert one == session_password("seed", 1, 1) and len(one) == 16 and one.isalnum()
    assert (
        len(
            {
                one,
                session_password("seed", 2, 1),
                session_password("seed", 1, 2),
                session_password("other", 1, 1),
            }
        )
        == 4
    )
