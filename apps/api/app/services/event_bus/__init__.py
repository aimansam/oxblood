"""Event bus for live SSE telemetry.

``EventBus`` is a small Protocol with one implementation, ``InProcessEventBus``: a ring buffer plus
asyncio pub/sub inside the API process. The API runs a single worker, so every subscriber sees every
event. ``bus`` is the module-level singleton the routers import.

API (sync):

  * ``publish(event)`` -- add an event to the ring buffer +
    fan out to all subscribed listeners. Idempotent on ``id``.
  * ``subscribe()`` -- return ``(queue, unsubscribe)``. SSE
    handlers use the queue to await the next event.
  * ``recent(n)`` -- the last ``n`` events from the ring buffer
    (newest last). Used by ``GET /runs/{id}/events/recent`` for
    cold-connect replay.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol, runtime_checkable

from .in_process import InProcessEventBus

__all__ = [
    "EventBus",
    "InProcessEventBus",
    "utcnow_iso",
    "bus",
    "reset_for_tests",
]


_log = logging.getLogger(__name__)


@runtime_checkable
class EventBus(Protocol):
    """Protocol the event bus satisfies.

    All methods are SYNC because the callers (``app.routers.events``
    and ``app.services.event_recorder``) call them as sync methods
    from inside async handlers.
    """

    def publish(self, event: dict[str, Any]) -> None:
        """Add an event to the buffer + fan out to subscribers.

        Implementations MUST dedup on ``event["id"]``: a publish
        with an ``id`` that's already in the buffer is a no-op.
        """
        ...

    def subscribe(self, maxsize: int = 256) -> tuple[Any, Callable[[], None]]:
        """Return ``(queue, unsubscribe)``.

        ``queue.get()`` returns the next event. ``unsubscribe()``
        detaches the subscriber; safe to call multiple times.
        """
        ...

    def recent(self, n: int = 50) -> list[dict[str, Any]]:
        """Return up to the last ``n`` events (newest last)."""
        ...


_in_process_bus = InProcessEventBus()


def reset_for_tests() -> None:
    """Clear the in-process bus. Test-only."""
    _in_process_bus.reset()


def utcnow_iso() -> str:
    """ISO-8601 UTC timestamp. Used as ``ts`` when caller doesn't
    supply one."""
    return datetime.now(UTC).isoformat()


bus: EventBus = _in_process_bus
