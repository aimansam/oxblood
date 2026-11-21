"""How well an exercise played: timings, difficulty and balance, read from what it already recorded.

Nothing here writes. It reads the score ledger, the event feed, flags, objectives and flag attempts
and turns them into numbers an organiser can compare between pilot runs, plus plain-language
observations ("nobody captured the backup flag").
"""

from __future__ import annotations

import statistics
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.models_drill import (
    Drill,
    DrillEvent,
    DrillFlag,
    DrillFlagSubmission,
    DrillObjective,
    DrillParticipant,
    DrillRound,
    DrillScoreEvent,
    DrillTeam,
    Submission,
)

# An observation is raised when a round crosses one of these.
QUIET_SPELL_S = 15 * 60  # nothing captured for this long
LOPSIDED_RATIO = 3.0  # the top team scored this many times the bottom one
CLOSE_MARGIN = 0.05  # the winner led by less than this share of the winner's points
MANY_WRONG_ATTEMPTS = 10  # wrong submissions on one flag
CARRIED_SHARE = 0.7  # one player earned this share of a team's points


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _seconds(start: datetime | None, end: datetime | None) -> int | None:
    if start is None or end is None:
        return None
    return max(0, int((end - start).total_seconds()))


def _round_side(round_: DrillRound, team_id: int) -> str | None:
    entry = (round_.assignments or {}).get(str(team_id)) or {}
    return entry.get("side")


async def build_quality_report(db: AsyncSession, drill: Drill) -> dict[str, Any]:
    ledger = (
        (
            await db.execute(
                select(DrillScoreEvent)
                .where(DrillScoreEvent.drill_id == drill.id)
                .order_by(DrillScoreEvent.created_at, DrillScoreEvent.id)
            )
        )
        .scalars()
        .all()
    )
    rounds = (
        (
            await db.execute(
                select(DrillRound)
                .where(DrillRound.drill_id == drill.id)
                .order_by(DrillRound.number)
            )
        )
        .scalars()
        .all()
    )
    teams = {
        t.id: t
        for t in (await db.execute(select(DrillTeam).where(DrillTeam.drill_id == drill.id)))
        .scalars()
        .all()
    }
    flags = {
        f.id: f
        for f in (await db.execute(select(DrillFlag).where(DrillFlag.drill_id == drill.id)))
        .scalars()
        .all()
    }
    wrong = dict(
        (
            await db.execute(
                select(DrillFlagSubmission.lab_flag_id, func.count(DrillFlagSubmission.id))
                .join(Submission, Submission.id == DrillFlagSubmission.submission_id)
                .where(Submission.drill_id == drill.id, DrillFlagSubmission.is_correct.is_(False))
                .group_by(DrillFlagSubmission.lab_flag_id)
            )
        ).all()
    )
    objectives = (
        await db.execute(
            select(DrillObjective.side, DrillObjective.status, func.count(DrillObjective.id))
            .where(DrillObjective.drill_id == drill.id)
            .group_by(DrillObjective.side, DrillObjective.status)
        )
    ).all()
    resets = (
        await db.execute(
            select(func.count(DrillEvent.id)).where(
                DrillEvent.drill_id == drill.id,
                DrillEvent.kind == "lifecycle",
                func.lower(DrillEvent.title).like("%reset%"),
            )
        )
    ).scalar() or 0

    drill_start = _utc(drill.actual_start_at)
    drill_end = _utc(drill.actual_end_at)
    notes: list[str] = []
    round_reports = []
    for round_ in rounds:
        started = _utc(round_.started_at) or drill_start
        events = [e for e in ledger if e.round_id == round_.id]
        captures = [e for e in events if e.kind == "flag" and e.flag_id in flags]
        # Points per team, from every kind of ledger row.
        points: dict[int, int] = {}
        for event in events:
            if event.team_id is not None:
                points[event.team_id] = points.get(event.team_id, 0) + int(event.points)
        team_rows = []
        for team_id, total in sorted(points.items(), key=lambda item: -item[1]):
            mine = [_utc(e.created_at) for e in captures if e.team_id == team_id]
            team_rows.append(
                {
                    "team_id": team_id,
                    "name": teams[team_id].name if team_id in teams else f"Team {team_id}",
                    "side": _round_side(round_, team_id),
                    "points": total,
                    "flags": len(mine),
                    "first_capture_s": _seconds(started, min(mine)) if mine else None,
                }
            )

        flag_rows = []
        for flag in flags.values():
            hits = [e for e in captures if e.flag_id == flag.id]
            elapsed = [
                s for s in (_seconds(started, _utc(e.created_at)) for e in hits) if s is not None
            ]
            row = {
                "flag_id": flag.id,
                "name": flag.name,
                "captured_by": len({e.team_id for e in hits}),
                "first_s": min(elapsed) if elapsed else None,
                "median_s": int(statistics.median(elapsed)) if elapsed else None,
                "wrong_attempts": int(wrong.get(flag.id, 0)),
            }
            flag_rows.append(row)
            if row["wrong_attempts"] >= MANY_WRONG_ATTEMPTS:
                notes.append(
                    f"{flag.name}: {row['wrong_attempts']} wrong submissions. The objective may be unclear."
                )
        # Only flags that anyone in this round could have reached count as "never captured".
        played = bool(events)
        never = [r["name"] for r in flag_rows if r["captured_by"] == 0] if played else []
        for name in never:
            notes.append(
                f"Round {round_.number}: nobody captured {name}. It may be too hard or unreachable."
            )

        times = sorted(t for t in (_utc(e.created_at) for e in captures) if t is not None)
        gaps = [_seconds(a, b) or 0 for a, b in zip(times, times[1:], strict=False)]
        lead_in = _seconds(started, times[0]) if times else None
        longest_quiet = max([*gaps, lead_in or 0]) if times else None
        if longest_quiet is not None and longest_quiet >= QUIET_SPELL_S:
            notes.append(
                f"Round {round_.number}: {longest_quiet // 60} minutes with no capture. Players may have stalled."
            )

        totals = [row["points"] for row in team_rows]
        margin = None
        if len(totals) >= 2 and totals[0] > 0:
            margin = round((totals[0] - totals[1]) / totals[0], 3)
            if margin < CLOSE_MARGIN:
                notes.append(f"Round {round_.number}: a close finish (winner led by {margin:.0%}).")
        if len(totals) >= 2 and totals[-1] > 0 and totals[0] / totals[-1] >= LOPSIDED_RATIO:
            notes.append(
                f"Round {round_.number}: lopsided, the top team scored {totals[0] / totals[-1]:.1f}x the bottom team."
            )

        round_reports.append(
            {
                "number": round_.number,
                "name": round_.name,
                "status": round_.status,
                "duration_s": _seconds(started, _utc(round_.ended_at)),
                "time_to_first_capture_s": lead_in,
                "longest_quiet_s": longest_quiet,
                "score_margin": margin,
                "teams": team_rows,
                "flags": flag_rows,
                "never_captured": never,
            }
        )

    overall: dict[int, int] = {}
    for event in ledger:
        if event.team_id is not None:
            overall[event.team_id] = overall.get(event.team_id, 0) + int(event.points)
    standings = [
        {"team_id": tid, "name": teams[tid].name if tid in teams else f"Team {tid}", "points": pts}
        for tid, pts in sorted(overall.items(), key=lambda item: -item[1])
    ]
    referee: dict[str, int] = {}
    for event in ledger:
        if event.kind in {"award", "penalty", "report", "detection"}:
            referee[event.kind] = referee.get(event.kind, 0) + 1
    objective_totals: dict[str, dict[str, int]] = {}
    for side, status, count in objectives:
        bucket = objective_totals.setdefault(side or "shared", {"done": 0, "total": 0})
        bucket["total"] += int(count)
        if str(status).lower() in {"done", "completed", "complete"}:
            bucket["done"] += int(count)

    scorecards = await _scorecards(db, drill, ledger, rounds, teams, notes)
    return {
        "drill": {
            "id": drill.id,
            "title": drill.title,
            "status": getattr(drill.status, "value", str(drill.status)),
            "type": drill.drill_type,
            "duration_s": _seconds(drill_start, drill_end),
            "planned_minutes": drill.duration_limit_minutes,
        },
        "standings": standings,
        **scorecards,
        "rounds": round_reports,
        "referee_actions": referee,
        "range_resets": int(resets),
        "objectives": objective_totals,
        "observations": notes,
    }


def _rate(correct: int, wrong: int) -> float | None:
    total = correct + wrong
    return round(correct / total, 2) if total else None


async def _scorecards(
    db: AsyncSession,
    drill: Drill,
    ledger: list[DrillScoreEvent],
    rounds: list[DrillRound],
    teams: dict[int, DrillTeam],
    notes: list[str],
) -> dict[str, Any]:
    """Per-team and per-player results: points by side, accuracy, speed to capture, who carried."""
    attempts = (
        await db.execute(
            select(
                Submission.user_id,
                Submission.team_id,
                DrillFlagSubmission.is_correct,
                func.count(DrillFlagSubmission.id),
            )
            .join(Submission, Submission.id == DrillFlagSubmission.submission_id)
            .where(Submission.drill_id == drill.id)
            .group_by(Submission.user_id, Submission.team_id, DrillFlagSubmission.is_correct)
        )
    ).all()
    by_user: dict[int, dict[str, int]] = {}
    by_team: dict[int, dict[str, int]] = {}
    for user_id, team_id, is_correct, count in attempts:
        key = "correct" if is_correct else "wrong"
        by_user.setdefault(user_id, {"correct": 0, "wrong": 0})[key] += int(count)
        if team_id is not None:
            by_team.setdefault(team_id, {"correct": 0, "wrong": 0})[key] += int(count)

    round_by_id = {r.id: r for r in rounds}
    starts = {r.id: _utc(r.started_at) or _utc(drill.actual_start_at) for r in rounds}
    team_rows: dict[int, dict[str, Any]] = {
        tid: {
            "team_id": tid,
            "name": team.name,
            "red_points": 0,
            "blue_points": 0,
            "flags": 0,
            "first_bloods": 0,
            "detections": 0,
            "penalties": 0,
            "capture_s": [],
        }
        for tid, team in teams.items()
    }
    player_stats: dict[int, dict[str, Any]] = {}
    for event in ledger:
        round_ = round_by_id.get(event.round_id) if event.round_id is not None else None
        if event.team_id in team_rows:
            row = team_rows[event.team_id]
            side = _round_side(round_, event.team_id) if round_ else None
            if side in {"red", "blue"}:
                row[f"{side}_points"] += int(event.points)
            if event.kind == "flag":
                row["flags"] += 1
                took = _seconds(starts.get(event.round_id), _utc(event.created_at))
                if took is not None:
                    row["capture_s"].append(took)
            elif event.kind == "first_blood":
                row["first_bloods"] += 1
            elif event.kind == "detection":
                row["detections"] += 1
            elif event.kind == "penalty":
                row["penalties"] += 1
        if event.user_id is not None:
            stats = player_stats.setdefault(
                event.user_id, {"points": 0, "flags": 0, "first_bloods": 0}
            )
            stats["points"] += int(event.points)
            stats["flags"] += 1 if event.kind == "flag" else 0
            stats["first_bloods"] += 1 if event.kind == "first_blood" else 0

    scorecards = []
    for tid, row in team_rows.items():
        speeds = row.pop("capture_s")
        counts = by_team.get(tid, {"correct": 0, "wrong": 0})
        scorecards.append(
            {
                **row,
                "wrong_attempts": counts["wrong"],
                "accuracy": _rate(counts["correct"], counts["wrong"]),
                "median_capture_s": int(statistics.median(speeds)) if speeds else None,
            }
        )
    scorecards.sort(key=lambda r: -(r["red_points"] + r["blue_points"]))

    people = (
        await db.execute(
            select(DrillParticipant.user_id, DrillParticipant.drill_team_id, User.sub)
            .join(User, User.id == DrillParticipant.user_id)
            .where(DrillParticipant.drill_id == drill.id)
        )
    ).all()
    players = []
    for user_id, team_id, name in people:
        stats = player_stats.get(user_id, {"points": 0, "flags": 0, "first_bloods": 0})
        counts = by_user.get(user_id, {"correct": 0, "wrong": 0})
        players.append(
            {
                "user": name,
                "team": teams[team_id].name if team_id in teams else None,
                **stats,
                "wrong_attempts": counts["wrong"],
                "accuracy": _rate(counts["correct"], counts["wrong"]),
                "submitted_anything": counts["correct"] + counts["wrong"] > 0,
            }
        )
    players.sort(key=lambda r: (-r["points"], r["user"]))

    silent = [p["user"] for p in players if not p["submitted_anything"] and not p["points"]]
    if silent:
        notes.append(
            f"{len(silent)} enrolled player(s) never submitted anything: {', '.join(silent)}."
        )
    for team_name in {p["team"] for p in players if p["team"]}:
        members = [p for p in players if p["team"] == team_name]
        total = sum(p["points"] for p in members)
        if len(members) > 1 and total > 0 and members[0]["points"] / total >= CARRIED_SHARE:
            notes.append(
                f"Team {team_name}: {members[0]['user']} earned {members[0]['points'] / total:.0%} of the points."
            )
    return {"team_scorecards": scorecards, "players": players}
