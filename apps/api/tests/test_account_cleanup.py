"""Accounts created for an exercise are destroyed after its range is cleaned up."""

from __future__ import annotations

import asyncio

import pytest
from app.core.auth import sign_token
from app.db.models import User
from app.db.models_drill import (
    Drill,
    DrillEvent,
    DrillParticipant,
    DrillScoreEvent,
    DrillStatus,
    DrillTeam,
)
from app.db.session import get_session
from app.routers.drills_v2.participants import router
from app.services.account_cleanup import purge_exercise_accounts
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from .pgutil import isolated_engine


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def world(tmp_path):
    engine = isolated_engine()
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with maker() as db:
            db.add_all(
                [Drill(title="One", max_participants=10), Drill(title="Two", max_participants=10)]
            )
            db.add(DrillTeam(drill_id=1, name="Alpha", position=1))
            await db.commit()

    run(setup())
    app = FastAPI()
    app.include_router(router, prefix="/api/v2/drills")

    async def test_session():
        async with maker() as db:
            yield db

    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as client:
        yield client, maker
    run(engine.dispose())


def admin():
    return {"X-Oxblood-Token": sign_token("root", "admin", 3600)}


async def _add_user(db, sub, role="red", drill=None, enrolled_in=(), team=None):
    user = User(sub=sub, password_hash="x", role=role, created_for_drill_id=drill)
    db.add(user)
    await db.flush()
    for drill_id in enrolled_in:
        db.add(
            DrillParticipant(
                drill_id=drill_id,
                user_id=user.id,
                role=role,
                status="registered",
                drill_team_id=team,
            )
        )
    return user


def test_finished_exercise_destroys_only_its_own_accounts_and_keeps_a_final_roster(world):
    _, maker = world

    async def go():
        async with maker() as db:
            temp = await _add_user(db, "temp.red", drill=1, enrolled_in=[1], team=1)
            await _add_user(
                db, "real.red", drill=None, enrolled_in=[1]
            )  # picked from the list: not ours
            shared = await _add_user(
                db, "temp.shared", drill=1, enrolled_in=[1, 2]
            )  # also in a live exercise
            team = await db.get(DrillTeam, 1)
            team.captain_user_id = temp.id
            db.add(
                DrillScoreEvent(
                    drill_id=1, team_id=1, user_id=temp.id, kind="flag", points=120, reason="x"
                )
            )
            drill = await db.get(Drill, 1)
            drill.status = DrillStatus.COMPLETED
            await db.commit()
            destroyed = await purge_exercise_accounts(db, drill)
            subs = set((await db.execute(select(User.sub))).scalars())
            parts = (await db.execute(select(DrillParticipant.user_id))).scalars().all()
            event = (await db.execute(select(DrillScoreEvent))).scalar_one()
            team = await db.get(DrillTeam, 1)
            titles = [e.title for e in (await db.execute(select(DrillEvent))).scalars()]
            return (
                destroyed,
                subs,
                parts,
                event.user_id,
                event.points,
                team.captain_user_id,
                drill.environment_config,
                titles,
                shared.id,
            )

    destroyed, subs, parts, event_user, event_points, captain, env, titles, shared_id = run(go())
    assert destroyed == 1 and subs == {"real.red", "temp.shared"}
    assert shared_id in parts and len(parts) == 3  # 4 enrolments; the destroyed account's is gone
    assert event_user is None and event_points == 120  # the team's points survive the account
    assert captain is None
    assert env["final_roster"] == [
        {"username": "temp.red", "side": "red", "team": "Alpha", "points": 120}
    ]
    assert "Temporary accounts destroyed" in titles


def test_keep_accounts_switch_and_manual_purge_rules(world):
    client, maker = world
    seed = world[1]

    async def mark():
        async with seed() as db:
            await _add_user(db, "temp.one", drill=1, enrolled_in=[1])
            await db.commit()

    run(mark())
    # Keeping is a per-exercise choice, off by default.
    on = client.put("/api/v2/drills/1/accounts", json={"keep": True}, headers=admin())
    assert on.json() == {"keep_accounts": True, "temporary_accounts": 1}

    async def finish():
        async with maker() as db:
            drill = await db.get(Drill, 1)
            drill.status = DrillStatus.COMPLETED
            await db.commit()

    run(finish())
    assert client.post("/api/v2/drills/1/accounts/purge", headers=admin()).json() == {
        "destroyed": 0
    }  # kept
    client.put("/api/v2/drills/1/accounts", json={"keep": False}, headers=admin())
    assert client.post("/api/v2/drills/1/accounts/purge", headers=admin()).json() == {
        "destroyed": 1
    }
    # A live exercise's accounts cannot be purged by hand.
    assert client.post("/api/v2/drills/2/accounts/purge", headers=admin()).status_code == 409


def test_test_players_are_two_marked_accounts_that_the_cleanup_removes(world):
    client, maker = world
    res = client.post("/api/v2/drills/1/participants/test", headers=admin())
    assert res.status_code == 201, res.text
    players = res.json()["players"]
    assert not any(
        p["must_change_password"] for p in players
    )  # throwaway accounts keep their handed-out password
    assert [p["role"] for p in players] == ["red", "blue"] and all(
        p["username"].startswith("test.") for p in players
    )

    async def marked():
        async with maker() as db:
            return sorted(
                u.created_for_drill_id for u in (await db.execute(select(User))).scalars()
            )

    assert run(marked()) == [1, 1]

    async def finish_and_purge():
        async with maker() as db:
            drill = await db.get(Drill, 1)
            drill.status = DrillStatus.CANCELLED
            await db.commit()
            return await purge_exercise_accounts(db, drill)

    assert run(finish_and_purge()) == 2
    assert run(marked()) == []
