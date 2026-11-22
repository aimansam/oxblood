"""The post-exercise quality report."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from app.core.auth import sign_token
from app.db.models import User
from app.db.models_drill import (
    Drill,
    DrillFlag,
    DrillFlagSubmission,
    DrillParticipant,
    DrillRound,
    DrillScoreEvent,
    DrillTeam,
    Submission,
)
from app.db.session import get_session
from app.routers.drills_v2.competition import router
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from .pgutil import isolated_engine

START = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def client(tmp_path):
    engine = isolated_engine()
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with maker() as db:
            db.add(
                Drill(
                    title="Pilot", actual_start_at=START, actual_end_at=START + timedelta(hours=1)
                )
            )
            db.add_all(
                [
                    DrillTeam(drill_id=1, name="Alpha", position=1),
                    DrillTeam(drill_id=1, name="Bravo", position=2),
                ]
            )
            db.add_all(
                [
                    DrillFlag(drill_id=1, name="web", value="a"),
                    DrillFlag(drill_id=1, name="backup", value="b"),
                ]
            )
            db.add(
                DrillRound(
                    drill_id=1,
                    number=1,
                    name="Round 1",
                    status="finished",
                    assignments={"1": {"side": "red"}, "2": {"side": "blue"}},
                    started_at=START,
                    ended_at=START + timedelta(minutes=60),
                )
            )
            await db.flush()

            def event(kind, points, minutes, team=1, flag=None):
                return DrillScoreEvent(
                    drill_id=1,
                    round_id=1,
                    team_id=team,
                    kind=kind,
                    points=points,
                    flag_id=flag,
                    created_at=START + timedelta(minutes=minutes),
                )

            db.add_all(
                [
                    event("flag", 100, 5, flag=1),
                    event("first_blood", 10, 5, flag=1),
                    event("detection", 20, 40, team=2),
                ]
            )
            db.add(User(sub="p", password_hash="x", role="red"))
            db.add(User(sub="quiet", password_hash="x", role="blue"))
            await db.flush()
            db.add(DrillParticipant(drill_id=1, user_id=1, drill_team_id=1))
            db.add(DrillParticipant(drill_id=1, user_id=2, drill_team_id=2))
            db.add(
                Submission(
                    user_id=1, team_id=1, drill_id=1, submission_type="flag", status="incorrect"
                )
            )
            await db.flush()
            db.add(
                DrillFlagSubmission(
                    submission_id=1, lab_flag_id=2, flag_value="x", is_correct=False
                )
            )
            await db.commit()

    run(setup())
    app = FastAPI()
    app.include_router(router, prefix="/api/v2/drills")

    async def test_session():
        async with maker() as db:
            yield db

    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as test_client:
        yield test_client
    run(engine.dispose())


def headers(role="admin"):
    return {"X-Oxblood-Token": sign_token("someone", role, 3600)}


def test_report_reads_timings_difficulty_and_balance(client):
    res = client.get("/api/v2/drills/1/quality", headers=headers())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["drill"]["duration_s"] == 3600
    assert [(s["name"], s["points"]) for s in body["standings"]] == [("Alpha", 110), ("Bravo", 20)]
    round_ = body["rounds"][0]
    assert round_["time_to_first_capture_s"] == 300
    assert round_["longest_quiet_s"] == 300
    assert round_["never_captured"] == ["backup"]
    web = next(f for f in round_["flags"] if f["name"] == "web")
    assert (web["captured_by"], web["first_s"]) == (1, 300)
    backup = next(f for f in round_["flags"] if f["name"] == "backup")
    assert backup["wrong_attempts"] == 1
    assert body["referee_actions"] == {"detection": 1}
    notes = " ".join(body["observations"])
    assert "nobody captured backup" in notes and "lopsided" in notes
    alpha = next(t for t in body["team_scorecards"] if t["name"] == "Alpha")
    assert (alpha["red_points"], alpha["flags"], alpha["first_bloods"]) == (110, 1, 1)
    assert (alpha["wrong_attempts"], alpha["accuracy"], alpha["median_capture_s"]) == (1, 0.0, 300)
    bravo = next(t for t in body["team_scorecards"] if t["name"] == "Bravo")
    assert (bravo["blue_points"], bravo["detections"]) == (20, 1)
    assert [p["user"] for p in body["players"] if not p["submitted_anything"]] == ["quiet"]
    assert "never submitted anything: quiet" in notes


def test_only_operators_may_read_it(client):
    assert client.get("/api/v2/drills/1/quality", headers=headers("red")).status_code == 403
    assert client.get("/api/v2/drills/9/quality", headers=headers("leader")).status_code == 404
