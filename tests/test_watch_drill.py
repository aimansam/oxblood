"""Tests for tools/watch_drill.py — no live calls, uses httpx MockTransport."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import httpx


def _load_module():
    if "watch_drill" in sys.modules:
        del sys.modules["watch_drill"]
    spec = importlib.util.spec_from_file_location(
        "watch_drill",
        Path(__file__).resolve().parent.parent / "tools" / "watch_drill.py",
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["watch_drill"] = mod
    spec.loader.exec_module(mod)
    return mod


def _patch_transport(monkeypatch, handlers):
    def _route(request):
        for prefix, handler in handlers.items():
            if str(request.url).startswith(prefix):
                return handler(request)
        return httpx.Response(404, json={"detail": "no handler"})

    transport = httpx.MockTransport(_route)
    original_client = httpx.Client

    def patched_client(*args, **kwargs):
        kwargs["transport"] = transport
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "Client", patched_client)


# --- success detection -------------------------------------------------


def test_exits_zero_when_the_latest_run_reaches_the_outcome(monkeypatch):
    """First poll: running. Second poll: succeeded. The watcher sees the change."""
    poll_count = {"n": 0}

    def list_drills(req):
        poll_count["n"] += 1
        status = "succeeded" if poll_count["n"] >= 2 else "running"
        return httpx.Response(
            200,
            json={"items": [{"run_id": 99, "scenario_id": 3, "status": status}]},
        )

    _patch_transport(monkeypatch, {"http://localhost:8000/api/v1/drills": list_drills})
    mod = _load_module()
    monkeypatch.setattr(
        sys, "argv", ["watch_drill.py", "--outcome", "succeeded", "--timeout", "10", "--poll", "1"]
    )
    assert mod.main() == 0
    assert poll_count["n"] >= 2


def test_exits_zero_immediately_when_the_run_already_finished(monkeypatch):
    handlers = {
        "http://localhost:8000/api/v1/drills": lambda r: httpx.Response(
            200, json={"items": [{"run_id": 7, "scenario_id": 1, "status": "succeeded"}]}
        ),
    }
    _patch_transport(monkeypatch, handlers)
    mod = _load_module()
    monkeypatch.setattr(
        sys, "argv", ["watch_drill.py", "--outcome", "succeeded", "--timeout", "5", "--poll", "1"]
    )
    assert mod.main() == 0


def test_times_out_with_exit_one_when_the_outcome_never_arrives(monkeypatch):
    handlers = {
        "http://localhost:8000/api/v1/drills": lambda r: httpx.Response(
            200, json={"items": [{"run_id": 7, "scenario_id": 1, "status": "running"}]}
        ),
    }
    _patch_transport(monkeypatch, handlers)
    mod = _load_module()
    monkeypatch.setattr(
        sys, "argv", ["watch_drill.py", "--outcome", "succeeded", "--timeout", "1", "--poll", "1"]
    )
    assert mod.main() == 1


# --- cancel after N ----------------------------------------------------


def test_cancel_after_sends_cancel_request(monkeypatch):
    """When --cancel-after fires, the watcher POSTs /cancel."""
    cancel_calls = []

    def cancel(req):
        cancel_calls.append(req)
        return httpx.Response(
            200,
            json={"run_id": 99, "status": "cancelled", "reason": "user-requested"},
        )

    def list_drills(req):
        return httpx.Response(
            200, json={"items": [{"run_id": 99, "scenario_id": 3, "status": "running"}]}
        )

    # Important: more specific routes MUST come first. startswith
    # routing would otherwise match /drills/99/cancel against /drills.
    handlers = {
        "http://localhost:8000/api/v1/drills/99/cancel": cancel,
        "http://localhost:8000/api/v1/drills": list_drills,
    }
    _patch_transport(monkeypatch, handlers)

    mod = _load_module()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "watch_drill.py",
            "--cancel-after",
            "1",
            "--outcome",
            "cancelled",
            "--timeout",
            "10",
            "--poll",
            "1",
        ],
    )
    rc = mod.main()
    assert len(cancel_calls) >= 1, "expected cancel POST to have been issued"
    # The listed run never turns "cancelled" in this stub, so the watcher times out (1);
    # the assertion above is what proves the cancel was issued.
    assert rc == 1
