"""Pytest fixtures."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# The suite runs on PostgreSQL only (see pgutil.py): OXBLOOD_TEST_DB_URL names a database whose name
# ends in _test. It is rebuilt with Alembic once per session and emptied between tests.
from .pgutil import db_url, drop_isolated_schemas, empty_tables, reset_database


@pytest.fixture(scope="session", autouse=True)
def _env(monkeypatch_session):
    """Set sane defaults for tests."""
    monkeypatch_session.setenv("OXBLOOD_ENV", "dev")
    monkeypatch_session.setenv("OXBLOOD_LOG_LEVEL", "WARNING")
    monkeypatch_session.setenv("OXBLOOD_DB_URL", db_url())
    yield


@pytest.fixture(scope="session")
def monkeypatch_session():
    from _pytest.monkeypatch import MonkeyPatch

    m = MonkeyPatch()
    yield m
    m.undo()


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    """Rebuild the test database with Alembic, once per session, so router tests have tables.

    Alembic over ``Base.metadata.create_all`` because it is what runs in production: a model that
    drifts from the migrations, or a broken migration, fails here.
    """
    import subprocess
    import sys

    url = db_url()
    reset_database(url)

    env = dict(os.environ)
    env["OXBLOOD_DB_URL"] = url
    env["PYTHONPATH"] = (
        str(Path(__file__).resolve().parents[1]) + os.pathsep + env.get("PYTHONPATH", "")
    )
    alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
    r = subprocess.run(
        [sys.executable, "-m", "alembic", "--config", str(alembic_ini), "upgrade", "head"],
        capture_output=True,
        text=True,
        env=env,
        cwd=alembic_ini.parent,
    )
    if r.returncode != 0:  # pragma: no cover - debug aid
        print("---STDOUT---")
        print(r.stdout)
        print("---STDERR---")
        print(r.stderr)
        raise RuntimeError("alembic upgrade head failed")

    os.environ["OXBLOOD_DB_URL"] = url
    # Test modules that import app.main at collection time populate the
    # cached settings with whatever OXBLOOD_DB_URL was set back then.
    from app.core.config import get_settings

    get_settings.cache_clear()

    # Each test drives its own event loop, and an asyncpg connection is bound to the loop that
    # opened it, so a pooled one fails in the next test. Production keeps its pool; only the test
    # engine skips pooling.
    from app.db import session as session_module
    from app.services import db as db_module
    from sqlalchemy.pool import NullPool

    real_create_engine = db_module.create_async_engine
    db_module.create_async_engine = lambda *a, **k: real_create_engine(
        *a, **{**k, "poolclass": NullPool}
    )
    db_module._engine = None
    session_module._session_maker = None

    yield

    db_module.create_async_engine = real_create_engine
    drop_isolated_schemas()


@pytest.fixture(autouse=True)
def _fresh_memory_stores():
    """Rate-limit counters and setup-job progress live in process memory; no test inherits another's."""
    from app.services import memory_store

    memory_store.reset_for_tests()
    yield
    memory_store.reset_for_tests()


@pytest.fixture(autouse=True)
def _clean_database():
    """Every test starts on empty tables, and a private schema it made is dropped after it.

    Postgres enforces foreign keys, so a test's own cleanup that deletes in the wrong order fails and
    leaks rows into the next test; emptying the tables here is the isolation a throwaway file gave.
    """
    empty_tables()
    yield
    drop_isolated_schemas()


@pytest.fixture
def client() -> TestClient:
    # Reset cached DB engine + sessionmaker so each test sees the
    # test database URL set by the db_setup fixture rather than
    # whatever URL a previous test left cached. Without this,
    # test_readyz_returns_503_when_db_unreachable poisons the engine
    # for all subsequent tests.
    from app.core.config import get_settings
    from app.db import session as session_module
    from app.services import db as db_module

    get_settings.cache_clear()
    db_module._engine = None
    session_module._session_maker = None

    from app.main import app

    return TestClient(app)


@pytest.fixture
def empty_users_table():
    """Start (and finish) a test with no users.

    ``/auth/setup`` and the setup probe only behave as documented on an empty
    users table, but the test database is shared across the whole session.
    """
    import asyncio

    from app.db import models as db_models
    from app.db.session import get_sessionmaker
    from sqlalchemy import delete

    async def _truncate() -> None:
        async with get_sessionmaker()() as s:
            await s.execute(delete(db_models.User))
            await s.commit()

    def _run() -> None:
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_truncate())
        finally:
            loop.close()

    _run()
    yield
    _run()
