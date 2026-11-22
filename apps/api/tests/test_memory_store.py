"""The in-process stores that replaced Redis: expiring counters and expiring job records."""

from __future__ import annotations

from app.services.memory_store import ExpiringCounters, ExpiringRecords


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_counter_increments_within_the_window():
    counters = ExpiringCounters(_Clock())
    assert [counters.incr("a", 60) for _ in range(3)] == [1, 2, 3]
    assert counters.get("a") == 3


def test_counter_expires_after_its_window():
    clock = _Clock()
    counters = ExpiringCounters(clock)
    counters.incr("a", 60)
    clock.now += 59
    assert counters.get("a") == 1
    clock.now += 2
    assert counters.get("a") == 0
    assert counters.incr("a", 60) == 1


def test_every_increment_pushes_the_expiry_out():
    clock = _Clock()
    counters = ExpiringCounters(clock)
    counters.incr("a", 60)
    clock.now += 50
    counters.incr("a", 60)
    clock.now += 50  # 100s after the first, 50s after the second
    assert counters.get("a") == 2


def test_counters_are_independent_per_key():
    counters = ExpiringCounters(_Clock())
    counters.incr("alice", 60)
    assert counters.get("bob") == 0


def test_records_round_trip_and_return_copies():
    records = ExpiringRecords(_Clock())
    records.set("upload:1", {"status": "running"}, 3600)
    loaded = records.get("upload:1")
    assert loaded == {"status": "running"}
    loaded["status"] = "tampered"
    assert records.get("upload:1") == {"status": "running"}
    assert records.get("upload:2") is None


def test_records_expire():
    clock = _Clock()
    records = ExpiringRecords(clock)
    records.set("k", {"x": 1}, 3600)
    clock.now += 3601
    assert records.get("k") is None
    assert records.with_prefix("k") == []


def test_records_can_be_listed_by_prefix():
    records = ExpiringRecords(_Clock())
    records.set("upload:1", {"n": 1}, 60)
    records.set("upload:2", {"n": 2}, 60)
    records.set("template:1", {"n": 3}, 60)
    found = sorted(key for key, _ in records.with_prefix("upload:"))
    assert found == ["upload:1", "upload:2"]
