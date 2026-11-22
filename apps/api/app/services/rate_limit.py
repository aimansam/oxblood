"""Per-token rate limiting for drill creation.

Closes L2 2.7. Without this, a buggy / misclicking operator can call
``POST /api/v1/drills`` in a tight loop and accidentally spawn many
PVE clones (each ~30 s, each costing disk + RAM). The fix is a
fixed-window counter keyed on ``token.sub``.

The counter lives in process memory (``app.services.memory_store``). That is
correct because the API runs a single worker, and the only cost is that a restart
gives everyone a fresh budget.

Algorithm (fixed-window counter):

    For each ``sub`` we keep a counter that expires ``window_s`` after its last
    increment. Each ``start_drill`` call increments it; if the new value exceeds
    the limit, the request is rejected with 429. The expiry refreshes on every
    call, so an operator who pauses for ``window_s`` gets a fresh budget.

The module is intentionally minimal — no leaky-bucket algorithm, no
quota, no per-route overrides. If we later need those, replace this
module; the router integration is the single call site (``start_drill``
in ``routers/drills.py``).
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.services import memory_store

# --- module-level tunables (env-overridable) -------------------------------
#
# These defaults are intentionally not in pydantic-settings yet; if
# they get touched regularly, hoist them then. The constants keep
# the integration simple and the tests pure.


DEFAULT_LIMIT: int = 1  # max drill starts per window per sub
# Q16: 1/5s replaces the old 5/3600s.
# * Old 5/hour was tuned to stop a misclicking operator from
#   spawning many clones (~120 GB disk per VM, ~30s each).
#   That ceiling was correct for production, but made dev
#   iteration painful: every fix-and-verify took an hour to
#   budget-cycle, and the operator gets blocked after a single
#   debugging session.
# * 1 per 5 seconds was chosen for two reasons:
#   1. Stops real accidents (double-click, runaway retry loop)
#      without false positives on rapid sequential clicks.
#   2. Allows fast dev iteration: 5 seconds per drill start is
#      a negligible delay during verification of Q-bugs.
# * Tradeoff: this is a weaker safety net against sustained
#   misuse (~12/hour ceiling) than the original 5/hour. Acceptable
#   because OxBlood is a dev-tool with single-operator usage
#   today. Revisit if the deployment grows to multi-user.
DEFAULT_WINDOW_SECONDS: int = 5  # 5 seconds


@dataclass(frozen=True)
class RateLimitConfig:
    """Resolved configuration for the drill-start rate limiter.

    Tests override via :func:`set_config` (which the production code
    path never calls). The single source of truth makes it easy to
    reason about behaviour.
    """

    limit: int = DEFAULT_LIMIT
    window_seconds: int = DEFAULT_WINDOW_SECONDS


_CONFIG = RateLimitConfig()


def get_config() -> RateLimitConfig:
    """Return the current rate-limit config.

    Splitting this out from the constants means a future move to
    pydantic-settings is a one-function edit, not a hunt-and-replace.
    """
    return _CONFIG


def set_config(limit: int | None = None, window_seconds: int | None = None) -> None:
    """Override the config from tests.

    Production code never calls this — the config is supposed to be
    immutable at runtime.
    """
    global _CONFIG
    _CONFIG = RateLimitConfig(
        limit=limit if limit is not None else _CONFIG.limit,
        window_seconds=window_seconds if window_seconds is not None else _CONFIG.window_seconds,
    )


def _bucket_key(sub: str) -> str:
    """Counter key for the drill-start bucket of one subject."""
    return f"drills:{sub}"


async def check_drill_start_limit(sub: str) -> None:
    """Gate ``POST /api/v1/drills``.

    Raises :class:`HTTPException` with status 429 if the caller is
    over the limit. The counter lives in process memory (the API runs a
    single worker), so a restart gives everyone a fresh budget.

    Awaited as part of the request pipeline; the router calls it
    directly so the verified token subject is in scope.
    """
    cfg = get_config()
    count = memory_store.counters.incr(_bucket_key(sub), cfg.window_seconds)

    if int(count) > cfg.limit:
        # Don't decrement; the bucket naturally expires. Returning
        # the limit in the detail lets the UI render a useful toast.
        # Q15: carry a ``kind`` discriminator in the JSON detail
        # so the portal can dispatch on error type instead of
        # routing every failure to "Open Config". Today the run
        # lifecycle card always appends "Open Config" because the
        # rate-limit error has nothing to do with PVE credentials
        # or bridges -- the message says "rate limit exceeded"
        # but the UI sends the user to the wrong place. The
        # structured detail below lets the UI render a different
        # banner for ``kind="rate_limited"`` vs PVE/bridge errors.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "kind": "rate_limited",
                "message": (
                    f"drill start rate limit exceeded for {sub!r}: "
                    f"{count}/{cfg.limit} starts in the last "
                    f"{cfg.window_seconds}s window. Wait for the "
                    f"window to reset before retrying."
                ),
                "subject": sub,
                "count": int(count),
                "limit": cfg.limit,
                "window_s": cfg.window_seconds,
            },
        )


__all__ = [
    "DEFAULT_LIMIT",
    "DEFAULT_WINDOW_SECONDS",
    "RateLimitConfig",
    "get_config",
    "set_config",
    "check_drill_start_limit",
]
