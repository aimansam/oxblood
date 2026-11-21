"""Telemetry sinks for drill events (L2 2.11).

A drill run produces a stream of events (run.started, asset.spawned,
run.completed, ...). The scenario YAML declares which sinks should
receive them via ``spec.telemetry.sinks[]``. Each sink is a
``TelemetrySink`` protocol with a single ``async send(event) -> None``
method.

Design choices:

  * **Best-effort.** A failing sink (for example an unreachable endpoint) must
    NOT fail the drill run. Each sink is wrapped; the error is
    logged and we move on. Telemetry is a side-channel for offline
    analysis; it cannot be on the critical path of "did the drill
    succeed or not".
  * **Stdout by default.** Even without explicit configuration, the
    runner emits a structured-log line per event (handled by the
    runner directly — not by this module). The sinks list is *in
    addition to* that baseline logging.
  * **Lazy construction.** Sinks are built per dispatch based on the
    *current* event, not pre-built. Cheap, and means a config change
    doesn't require a server restart.
  * **No PII redaction.** Events carry ``started_by`` (token subject)
    and VM IPs. Same scope as the audit log; the same redaction rules
    apply. Adding redaction is a separate ticket.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Protocol


class TelemetrySink(Protocol):
    """Minimal sink contract. ``send`` is async, returns None."""

    name: str  # for logs + the SinkResult label

    async def send(self, event: dict[str, Any]) -> None: ...


# --- Built-in sinks ----------------------------------------------------------


class StdoutSink:
    """Print a single JSON line per event. Always available."""

    name = "stdout"

    async def send(self, event: dict[str, Any]) -> None:
        logging.getLogger("oxblood.telemetry.stdout").info(
            "oxblood.telemetry.event %s", json.dumps(event, default=str)
        )


class NullSink:
    """Sink that does nothing. Marker for "telemetry disabled here"."""

    name = "null"

    async def send(self, event: dict[str, Any]) -> None:
        return None


@dataclass(frozen=True)
class SinkResult:
    """One row per sink fired per dispatch, captured for tests + logs."""

    sink: str
    ok: bool
    error: str | None = None


async def dispatch(sinks: list[TelemetrySink], event: dict[str, Any]) -> list[SinkResult]:
    """Fire each sink in order. Failures on one sink never block another.

    The dispatch is sequential (avoids stampeding the warehouse if a
    scenario specifies 5 sinks). With our current scope (1 sink per
    dispatch) the cost is negligible; parallel is a follow-up.
    """
    results: list[SinkResult] = []
    for sink in sinks:
        try:
            await sink.send(event)
            results.append(SinkResult(sink=sink.name, ok=True))
        except Exception as exc:  # noqa: BLE001 — best-effort by design
            logging.getLogger(__name__).warning(
                "oxblood.telemetry.sink_failed sink=%s err=%s",
                sink.name,
                exc,
            )
            results.append(SinkResult(sink=sink.name, ok=False, error=str(exc)))
    return results


def build_sinks_from_spec(spec: dict | None) -> list[TelemetrySink]:
    """Resolve the scenario ``spec.telemetry.sinks[]`` into live sinks.

    The runner always emits a structured-log line per event (handled
    in the runner itself, not here). This list is the *additional*
    sinks configured for the drill. If ``telemetry.sinks`` is unset,
    we return an empty list — i.e. stdout-only.

    Deferred sinks (e.g. ``misp``) are logged
    and skipped — they are part of L3 scope, not L2.
    """
    if not spec:
        return []
    sinks_spec = (spec.get("telemetry") or {}).get("sinks") or []
    if not sinks_spec:
        return []

    sinks: list[TelemetrySink] = []
    for s in sinks_spec:
        kind = s.get("type")
        if kind == "stdout":
            sinks.append(StdoutSink())
        elif kind == "misp":
            logging.getLogger(__name__).info(
                "oxblood.telemetry.sink_deferred type=%s reason=L3_scope",
                kind,
            )
        else:
            logging.getLogger(__name__).warning("oxblood.telemetry.unknown_sink type=%r", kind)
    return sinks


__all__ = [
    "TelemetrySink",
    "StdoutSink",
    "NullSink",
    "SinkResult",
    "build_sinks_from_spec",
    "dispatch",
]
