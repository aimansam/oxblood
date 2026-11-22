"""In-process stores for state that is short-lived by design: rate-limit counters and wizard job progress.

The API runs a single worker, so process memory is the single source of truth. Both stores forget
everything when the API restarts, which is acceptable: a rate-limit window is minutes long and a
progress record is only read while its job runs.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any

Clock = Callable[[], float]


class ExpiringCounters:
    """Fixed-window counters. Every increment pushes the expiry out by ``ttl_s``."""

    def __init__(self, clock: Clock = time.monotonic) -> None:
        self._clock = clock
        self._values: dict[str, tuple[int, float]] = {}

    def incr(self, key: str, ttl_s: float) -> int:
        count = self.get(key) + 1
        self._values[key] = (count, self._clock() + ttl_s)
        return count

    def get(self, key: str) -> int:
        entry = self._values.get(key)
        if entry is None:
            return 0
        count, expires_at = entry
        if expires_at <= self._clock():
            del self._values[key]
            return 0
        return count

    def clear(self) -> None:
        self._values.clear()


class ExpiringRecords:
    """Keyed records that disappear ``ttl_s`` after they were last written."""

    def __init__(self, clock: Clock = time.monotonic) -> None:
        self._clock = clock
        self._records: dict[str, tuple[dict[str, Any], float]] = {}

    def set(self, key: str, record: dict[str, Any], ttl_s: float) -> None:
        self._records[key] = (dict(record), self._clock() + ttl_s)

    def get(self, key: str) -> dict[str, Any] | None:
        entry = self._records.get(key)
        if entry is None:
            return None
        record, expires_at = entry
        if expires_at <= self._clock():
            del self._records[key]
            return None
        return dict(record)

    def with_prefix(self, prefix: str) -> list[tuple[str, dict[str, Any]]]:
        found = []
        for key in list(self._records):
            if key.startswith(prefix):
                record = self.get(key)
                if record is not None:
                    found.append((key, record))
        return found

    def clear(self) -> None:
        self._records.clear()


counters = ExpiringCounters()
records = ExpiringRecords()


def reset_for_tests() -> None:
    counters.clear()
    records.clear()
