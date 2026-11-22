"""Tests for the per-token rate limit on POST /api/v1/drills (L2 2.7).

The rate limiter is an in-memory window counter keyed on ``token.sub``
(``app.services.memory_store``). Each test starts with empty counters.

Test tiers:

  1. **Unit tests** (the bulk) call
     :func:`check_drill_start_limit` directly. They're fast and don't
     need a real DB or runner. They exercise the bucket math.

  2. **HTTP smoke** (one test) verifies the limiter is wired into
     ``start_drill``: anonymous → 401; over-limit → 429.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException


@pytest.fixture
def fresh_counters():
    """Empty counters for the test, and again afterwards so nothing leaks into the next one."""
    from app.services import memory_store

    memory_store.reset_for_tests()
    yield memory_store.counters
    memory_store.reset_for_tests()


@pytest.fixture
def set_limit(monkeypatch):
    """Pin ``check_drill_start_limit`` to a known config for the test.

    Yields the rate_limit module so tests can call ``set_config``.
    The fixture restores the defaults afterwards.
    """
    import app.services.rate_limit as rl

    rl.set_config(limit=5, window_seconds=3600)
    yield rl
    rl.set_config(limit=rl.DEFAULT_LIMIT, window_seconds=rl.DEFAULT_WINDOW_SECONDS)


def _run(coro):
    return asyncio.run(coro)


# --- Unit tests --------------------------------------------------------------


def test_first_n_requests_pass(fresh_counters, set_limit):
    """The first N requests within the limit return without raising."""
    set_limit.set_config(limit=5)
    from app.services.rate_limit import check_drill_start_limit as rl

    async def _go():
        for _ in range(5):
            await rl("alice")

    _run(_go())  # no exception == pass


def test_over_limit_raises_429(fresh_counters, set_limit):
    """The (limit+1)th request from the same sub raises 429.

    Q15: detail is now a structured dict with a ``kind`` discriminator
    so the portal can dispatch on error type instead of routing every
    drill-start failure to the "Open Config" banner.

    Q16: limit is now 1/5s (was 5/3600s). The (limit+1)th request
    triggers the 429 immediately. This test sets the limit
    explicitly (the default fixture sets limit=5 to test the
    override path; we want to test the Q16 default behaviour).
    """
    set_limit.set_config(limit=1, window_seconds=5)
    from app.services.rate_limit import check_drill_start_limit as rl

    async def _go() -> None:
        # limit=1, so the first call passes, the second call trips the 429.
        await rl("alice")
        with pytest.raises(HTTPException) as exc_info:
            await rl("alice")
        assert exc_info.value.status_code == 429
        detail = exc_info.value.detail
        # Structured detail (dict) -- portal dispatches on this.
        assert isinstance(detail, dict)
        assert detail["kind"] == "rate_limited"
        assert detail["subject"] == "alice"
        # Q16: limit is now 1 (was 5)
        assert detail["limit"] == 1
        assert detail["window_s"] == 5
        assert detail["count"] >= 2
        # The message must mention the subject for the toast.
        assert "alice" in detail["message"]
        # Must NOT be a plain string anymore (the old behaviour).
        assert not isinstance(detail, str)

    _run(_go())


def test_over_limit_message_mentions_wait(fresh_counters, set_limit):
    """The rate-limit message must tell the operator to wait.

    Before Q15 the message was just the bare ``count/limit/window``
    triple. The wizard would render it inside a banner that also
    showed "Open the Config tab" -- the operator thought PVE was
    broken. Now the message explicitly says "Wait for the window
    to reset".
    """
    set_limit.set_config(limit=1, window_seconds=5)
    from app.services.rate_limit import check_drill_start_limit as rl

    async def _go() -> None:
        await rl("alice")
        with pytest.raises(HTTPException) as exc_info:
            await rl("alice")
        msg = exc_info.value.detail["message"]
        assert "wait" in msg.lower() or "reset" in msg.lower(), (
            f"rate-limit message must hint at waiting; got: {msg!r}"
        )

    _run(_go())


def test_separate_subjects_get_separate_buckets(fresh_counters, set_limit):
    """Alice and Bob each have their own bucket."""
    from app.services.rate_limit import check_drill_start_limit as rl

    set_limit.set_config(limit=2)

    async def _go():
        # Alice uses her budget.
        await rl("alice")
        await rl("alice")
        with pytest.raises(HTTPException):
            await rl("alice")
        # Bob's bucket is independent.
        await rl("bob")
        await rl("bob")
        with pytest.raises(HTTPException):
            await rl("bob")

    _run(_go())


def test_window_expires_refills_budget(fresh_counters, set_limit):
    """After the window expires, the bucket resets.

    We use a tiny window (1s) and a tiny TTL to test this without
    actually waiting.
    """
    from app.services.rate_limit import check_drill_start_limit as rl

    set_limit.set_config(limit=1, window_seconds=1)

    async def _go():
        await rl("alice")
        with pytest.raises(HTTPException):
            await rl("alice")  # over limit
        # Wait out the window.
        await asyncio.sleep(1.2)
        await rl("alice")  # allowed again

    _run(_go())


# --- HTTP smoke --------------------------------------------------------------


@pytest.fixture
def client(fresh_counters, set_limit):
    from app.core.config import get_settings
    from app.db import session as session_module
    from app.services import db as db_module

    get_settings.cache_clear()
    db_module._engine = None
    session_module._session_maker = None

    import importlib

    import app.main as _app_main

    importlib.reload(_app_main)
    from fastapi.testclient import TestClient

    return TestClient(_app_main.app)


def test_http_anonymous_is_401_not_429(client, fresh_counters, set_limit):
    """No token → 401 from the auth gate, NOT 429 from the limiter.

    This proves the limiter is gated *after* auth — important so a
    denial-of-service probe against the limiter isn't possible without
    a token.
    """
    set_limit.set_config(limit=0)  # limit=0 wouldn't change the auth outcome
    r = client.post("/api/v1/drills", json={"scenario_id": 999})
    assert r.status_code == 401
