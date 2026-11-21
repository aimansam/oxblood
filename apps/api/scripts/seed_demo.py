#!/usr/bin/env python3
"""Fill a demo stack with a running team competition: teams, players, a live range and scores.

Everything goes through the public API, the same way an operator would, so this also works
against any stack whose API runs with OXBLOOD_DEMO=true. Running it twice changes nothing.

    OXBLOOD_DEMO_API=http://localhost:8000 python3 apps/api/scripts/seed_demo.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

API = os.environ.get("OXBLOOD_DEMO_API", "http://localhost:8000").rstrip("/")
ADMIN = os.environ.get("OXBLOOD_DEMO_ADMIN", "admin")
ADMIN_PASSWORD = os.environ.get("OXBLOOD_DEMO_ADMIN_PASSWORD", "OxbloodDemo-2026")
PLAYER_PASSWORD = os.environ.get("OXBLOOD_DEMO_PLAYER_PASSWORD", "Player-Demo-2026")
SCENARIO = "enterprise-file-breach"
TITLE = "Bank Harimau: live-fire breach"

# Team order matches the round plan: the first team plays red in round 1.
PLAYERS = [
    ("aisyah", 0, "red"),
    ("farid", 0, "red"),
    ("mei.ling", 0, "red"),
    ("hafiz", 1, "blue"),
    ("priya", 1, "blue"),
    ("daniel", 1, "blue"),
]


class ApiError(RuntimeError):
    def __init__(self, status: int, detail: Any) -> None:
        super().__init__(f"{status}: {detail}")
        self.status = status


def call(method: str, path: str, token: str | None = None, body: Any = None) -> Any:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Oxblood-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            detail = json.loads(raw).get("detail", raw.decode())
        except ValueError:
            detail = raw.decode(errors="replace")
        raise ApiError(exc.code, detail) from None
    return json.loads(raw) if raw else None


def wait_for_api(timeout_s: float = 180) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        try:
            call("GET", "/healthz")
            return
        except (OSError, ApiError):
            if time.monotonic() > deadline:
                raise SystemExit(f"API at {API} did not come up within {timeout_s:.0f}s") from None
            time.sleep(2)


def login(sub: str, password: str) -> str:
    return call("POST", "/api/v1/auth/login", body={"sub": sub, "password": password})["token"]


def ensure_player(token: str, sub: str, role: str) -> int:
    try:
        return call(
            "POST",
            "/api/v1/auth/users",
            token,
            {"sub": sub, "password": PLAYER_PASSWORD, "role": role},
        )["id"]
    except ApiError as exc:
        if exc.status != 409:
            raise
    users = call("GET", "/api/v1/auth/users", token)
    users = users.get("items", users) if isinstance(users, dict) else users
    return next(u["id"] for u in users if u["sub"] == sub)


def wait_until_ready(token: str, drill_id: int, timeout_s: float = 300) -> None:
    deadline = time.monotonic() + timeout_s
    while True:
        status = call("GET", f"/api/v2/drills/{drill_id}/status", token)
        env = status.get("environment_config") or {}
        phase = (status.get("lifecycle") or {}).get("provision_phase")
        state = str(env.get("provision_status") or phase or "").lower()
        if state in {"started", "ready"} or phase == "ready":
            return
        if "fail" in state:
            raise SystemExit(f"Range preparation failed: {state}")
        if time.monotonic() > deadline:
            raise SystemExit(f"Range was not ready after {timeout_s:.0f}s (last state: {state})")
        time.sleep(2)


def submit(token: str, drill_id: int, value: str, expect_correct: bool = True) -> dict[str, Any]:
    result = call(
        "POST",
        "/api/v2/submissions?user_id=0",
        token,
        {"drill_id": drill_id, "lab_flag_id": 0, "flag_value": value, "hints_used": 0},
    )
    if bool(result.get("is_correct")) != expect_correct:
        raise SystemExit(f"Unexpected result for {value}: {result}")
    return result


def main() -> int:
    wait_for_api()
    admin = login(ADMIN, ADMIN_PASSWORD)

    drills = call("GET", "/api/v2/drills", admin)["drills"]
    if any(d["title"] == TITLE for d in drills):
        print(f"[seed-demo] '{TITLE}' already exists; nothing to do.")
        return 0

    scenarios = call("GET", "/api/v1/scenarios", admin)["items"]
    scenario = next((s for s in scenarios if s["name"] == SCENARIO), None)
    if scenario is None:
        raise SystemExit(f"Scenario {SCENARIO!r} is not loaded; check OXBLOOD_SCENARIOS_DIR.")
    flags = (scenario.get("spec") or {}).get("spec", {}).get("flags", [])
    red_flags = [f["value"] for f in flags if f.get("side") == "red"]
    blue_flags = [f["value"] for f in flags if f.get("side") == "blue"]

    drill_id = call(
        "POST",
        "/api/v2/drills",
        admin,
        {
            "title": TITLE,
            "description": "Two teams swap red and blue over two rounds on the Bank Harimau range.",
            "drill_type": "team",
            "duration_limit_minutes": 120,
            "max_participants": len(PLAYERS),
            "scenario_id": scenario["id"],
        },
    )["drill_id"]
    call(
        "PUT",
        f"/api/v2/drills/{drill_id}/format",
        admin,
        {"mode": "team", "teams": 2, "rounds": 2, "layout": "shared", "keep_accounts": True},
    )
    teams = call("GET", f"/api/v2/drills/{drill_id}/teams", admin)["teams"]
    print(f"[seed-demo] exercise #{drill_id} with teams {', '.join(t['name'] for t in teams)}")

    tokens: dict[str, str] = {}
    for sub, team, role in PLAYERS:
        user_id = ensure_player(admin, sub, role)
        call(
            "POST",
            f"/api/v2/drills/{drill_id}/participants",
            admin,
            {"user_id": user_id, "role": role},
        )
        call("PUT", f"/api/v2/drills/{drill_id}/teams/{teams[team]['id']}/members/{user_id}", admin)
        tokens[sub] = login(sub, PLAYER_PASSWORD)

    # Starting a round on a prepared range plants fresh flag values that only the machines know.
    # Round 1 starts first, so the demo captures below can use the scenario's own values.
    call("POST", f"/api/v2/drills/{drill_id}/rounds/1/start", admin)

    # Round 1: the first team attacks, the second defends.
    red = [sub for sub, team, _ in PLAYERS if team == 0]
    blue = [sub for sub, team, _ in PLAYERS if team == 1]
    submit(tokens[red[0]], drill_id, red_flags[0])
    submit(tokens[red[1]], drill_id, "FLAG{wrong_guess}", expect_correct=False)
    submit(tokens[red[1]], drill_id, red_flags[1])
    submit(tokens[blue[0]], drill_id, blue_flags[0])
    call(
        "POST",
        f"/api/v2/drills/{drill_id}/score-events",
        admin,
        {
            "team_id": teams[1]["id"],
            "points": 50,
            "kind": "detection",
            "reason": "Spotted the DMZ foothold in the proxy logs within ten minutes",
        },
    )

    call("POST", f"/api/v2/drills/{drill_id}/prepare", admin)
    wait_until_ready(admin, drill_id)
    call("POST", f"/api/v2/drills/{drill_id}/start", admin)
    print("[seed-demo] range ready, exercise live, round 1 under way")

    board = call("GET", f"/api/v2/drills/{drill_id}/scoreboard", admin)
    standings = ", ".join(f"{t['name']} {t['total']}" for t in board["teams"])
    print(f"[seed-demo] scores so far: {standings}")
    print(f"[seed-demo] sign in as {ADMIN} / {ADMIN_PASSWORD} (operator)")
    print(f"[seed-demo] or as {red[0]} / {PLAYER_PASSWORD} (red player), {blue[0]} (blue player)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
