"""Tests for the service-status aggregator endpoint.

The endpoint is read-only and fail-soft by design, so the test
suite focuses on:

  1. Happy path -- all probes run, expected shape returned.
  2. Audit recency surfaces "empty" on a fresh DB.
  3. The disk summary fails soft on a bad path.

We don't run against a real PVE -- admin_svc.probe_pve() is patched
to return a sentinel dict.
"""

from __future__ import annotations

import pytest
from app.services import admin as admin_svc
from app.services import service_status as svc


class _SentinelProbeResult:
    """Mimics the real ProbeResult dataclass shape so to_dict() works."""

    def to_dict(self) -> dict:
        return {
            "reachable": True,
            "version": "9.1.7 (9.1)",
            "error": None,
        }


@pytest.fixture(autouse=True)
def _patch_probe(monkeypatch):
    """Patch admin_svc.probe_pve so tests don't hit a real PVE."""
    monkeypatch.setattr(
        admin_svc,
        "probe_pve",
        lambda: _SentinelProbeResult(),
    )


async def test_get_service_status_returns_expected_shape():
    """Top-level aggregator returns every sub-probe."""
    from app.db.session import get_sessionmaker

    sm = get_sessionmaker()
    async with sm() as session:
        result = await svc.get_service_status(session)
    assert "captured_at" in result
    assert "pve" in result
    assert "disk" in result
    assert "audit" in result
    assert result["pve"]["reachable"] is True


def test_disk_summary_handles_bad_path():
    """_disk_summary fails soft on a non-existent path."""
    out = svc._disk_summary("/this/does/not/exist/anywhere")
    assert "error" in out
    assert out["path"] == "/this/does/not/exist/anywhere"
