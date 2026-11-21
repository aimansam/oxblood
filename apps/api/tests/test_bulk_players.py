"""Bulk account creation from a pasted list of names."""

from __future__ import annotations

import asyncio

import pytest
from app.core.auth import sign_token
from app.db.models import User
from app.db.models_drill import Drill, DrillEvent, DrillParticipant, DrillTeam
from app.db.session import get_session
from app.routers.drills_v2.participants import router
from app.services.users import authenticate
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def world(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'bulk.sqlite'}")
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            for table in (
                User.__table__,
                Drill.__table__,
                DrillTeam.__table__,
                DrillParticipant.__table__,
                DrillEvent.__table__,
            ):
                await conn.run_sync(table.create)
        async with maker() as db:
            db.add(Drill(title="Class", max_participants=5))
            db.add(DrillTeam(drill_id=1, name="Alpha", position=1))
            db.add(User(sub="ana", password_hash="x", role="red"))
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


def lead():
    return {"X-Oxblood-Token": sign_token("lead", "lead", 3600)}


def test_names_become_enrolled_accounts_with_one_time_passwords(world):
    client, maker = world
    body = {"names": ["Ana Smith", "Ben  Lee", "Ana Smith", "  "], "side": "red", "team_id": 1}
    res = client.post("/api/v2/drills/1/participants/bulk", json=body, headers=admin())
    assert res.status_code == 201, res.text
    players = res.json()["players"]
    assert [p["username"] for p in players] == [
        "ana.smith",
        "ben.lee",
        "ana.smith2",
    ]  # blank skipped, clash numbered
    assert all(len(p["password"]) == 12 and p["role"] == "red" for p in players)

    async def check():
        async with maker() as db:
            ok = await authenticate(db, sub="ben.lee", password=players[1]["password"])
            rows = (await db.execute(select(DrillParticipant))).scalars().all()
            team = await db.get(DrillTeam, 1)
            return ok is not None, [p.drill_team_id for p in rows], team.captain_user_id

    assert all(
        p["must_change_password"] for p in players
    )  # generated passwords must be replaced at first sign-in
    logged_in, teams, captain = run(check())
    assert logged_in and teams == [1, 1, 1]
    assert captain is not None  # the first member is elected captain


def test_it_refuses_what_does_not_fit_and_who_may_not(world):
    client, _ = world
    url = "/api/v2/drills/1/participants/bulk"
    player = {"X-Oxblood-Token": sign_token("a.player", "red", 3600)}
    assert (
        client.post(url, json={"names": ["a"]}, headers=player).status_code == 403
    )  # players cannot make accounts
    assert (
        client.post(url, json={"names": ["lead.made"]}, headers=lead()).status_code == 201
    )  # a lead can
    too_many = client.post(url, json={"names": [f"p{i}" for i in range(6)]}, headers=admin())
    assert too_many.status_code == 409 and "seats" in too_many.json()["detail"]
    assert (
        client.post(url, json={"names": ["a"], "team_id": 99}, headers=admin()).status_code == 404
    )
    assert (
        client.post(url, json={"names": ["a"], "side": "green"}, headers=admin()).status_code == 422
    )
    assert client.post(url, json={"names": []}, headers=admin()).status_code == 422
