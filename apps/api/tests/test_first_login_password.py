"""A generated password only works to choose a new one."""

from __future__ import annotations

import asyncio

import pytest
from app.db.models import User
from app.db.models_drill import Drill, DrillParticipant
from app.db.session import get_session
from app.routers import auth as auth_router
from app.routers import me as me_router
from app.routers.drills_v2.participants import router as participants_router
from app.services.users import create_user
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def world(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'pw.sqlite'}")
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(User.__table__.create)
            await conn.run_sync(Drill.__table__.create)
            await conn.run_sync(DrillParticipant.__table__.create)
        async with maker() as db:
            fresh = await create_user(db, sub="fresh.player", password="Generated12ab", role="red")
            fresh.must_change_password = True
            await create_user(db, sub="old.hand", password="LongEnoughPass1", role="blue")
            await db.commit()

    run(setup())
    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api/v1/auth")
    app.include_router(me_router.router, prefix="/api/v1/me")
    app.include_router(participants_router, prefix="/api/v2/drills")

    async def test_session():
        async with maker() as db:
            yield db

    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as client:
        yield client
    run(engine.dispose())


def login(client, sub, password):
    return client.post("/api/v1/auth/login", json={"sub": sub, "password": password})


def header(token):
    return {"X-Oxblood-Token": token}


def test_a_generated_password_signs_in_to_a_token_that_can_only_change_it(world):
    client = world
    res = login(client, "fresh.player", "Generated12ab")
    assert res.status_code == 200
    body = res.json()
    assert body["must_change_password"] is True and body["role"] == "password_change"
    assert body["ttl_remaining_s"] <= 15 * 60  # short-lived
    # The token names the account but grants nothing: role-gated endpoints refuse it.
    assert (
        client.get("/api/v1/me", headers=header(body["token"])).json()["role"] == "password_change"
    )
    assert (
        client.get("/api/v2/drills/1/participants", headers=header(body["token"])).status_code
        == 403
    )

    # Ordinary accounts are unaffected.
    plain = login(client, "old.hand", "LongEnoughPass1").json()
    assert plain["must_change_password"] is False and plain["role"] == "blue"


def test_changing_the_password_returns_a_normal_token_and_retires_the_old_password(world):
    client = world
    restricted = login(client, "fresh.player", "Generated12ab").json()["token"]
    url = "/api/v1/auth/change-password"

    def change(current, new):
        return client.post(
            url, json={"current_password": current, "new_password": new}, headers=header(restricted)
        )

    assert (
        change("wrong-password", "BrandNewPass123").status_code == 400
    )  # not 401: that would sign the user out
    assert change("Generated12ab", "Generated12ab").status_code in (422,)  # too short or unchanged
    assert change("Generated12ab", "short").status_code == 422  # at least 10 characters
    assert change("Generated12ab", "fresh.player").status_code == 422  # not the username
    assert client.post(
        url, json={"current_password": "x", "new_password": "BrandNewPass123"}
    ).status_code in (401, 403)  # needs a token

    done = change("Generated12ab", "BrandNewPass123")
    assert done.status_code == 200, done.text
    assert done.json()["role"] == "red" and done.json()["must_change_password"] is False
    assert client.get("/api/v1/me", headers=header(done.json()["token"])).json()["role"] == "red"

    assert (
        login(client, "fresh.player", "Generated12ab").status_code == 401
    )  # the handed-out password is dead
    again = login(client, "fresh.player", "BrandNewPass123").json()
    assert again["must_change_password"] is False and again["role"] == "red"
