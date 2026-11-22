"""Pytest fixtures."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# --- live PG mode ---------------------------------------------------------
#
# Setting OXBLOOD_TEST_LIVE_PG to a non-empty value switches the test suite
# from SQLite to a real PostgreSQL. Useful for catching enum/JSONB/case
# bugs that SQLite is permissive about. Tests that should only run under
# live PG should be marked with ``@pytest.mark.live_pg``; they're skipped
# otherwise so the default `pytest` run stays SQLite-only and fast.
#
# The URL defaults to the docker-compose dev DB; override via env if needed.
LIVE_PG_URL_DEFAULT = "postgresql+asyncpg://oxblood:oxblood@localhost:5432/oxblood_test"


def _live_pg_url() -> str | None:
    val = os.environ.get("OXBLOOD_TEST_LIVE_PG", "").strip()
    if not val:
        return None
    if val in ("1", "true", "yes"):
        return os.environ.get("OXBLOOD_TEST_LIVE_PG_URL", LIVE_PG_URL_DEFAULT)
    return val


@pytest.fixture(scope="session", autouse=True)
def _env(monkeypatch_session):
    """Set sane defaults for tests."""
    monkeypatch_session.setenv("OXBLOOD_ENV", "dev")
    monkeypatch_session.setenv("OXBLOOD_LOG_LEVEL", "WARNING")
    if _live_pg_url():
        # Live PG mode — caller is responsible for pointing at a working DB.
        monkeypatch_session.setenv("OXBLOOD_DB_URL", _live_pg_url())
    else:
        # Use SQLite for tests — no Postgres needed for unit tests.
        os.environ.setdefault("OXBLOOD_DB_URL", "sqlite+aiosqlite:///./test.sqlite")
    yield


@pytest.fixture(scope="session")
def monkeypatch_session():
    from _pytest.monkeypatch import MonkeyPatch

    m = MonkeyPatch()
    yield m
    m.undo()


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    """Run all alembic migrations once per test session so router tests have
    tables. We use a single file-based SQLite and tear it down at the end.

    Why alembic over ``Base.metadata.create_all``?
    - Alembic is what runs in production.
    - Models drift from migrations all the time; this catches it.
    """
    import subprocess
    import sys

    live = _live_pg_url()

    if live:
        # Live PG mode — caller supplies the URL via OXBLOOD_TEST_LIVE_PG.
        # We trust it and skip the alembic step (assume migrations are
        # already applied by the operator).
        os.environ["OXBLOOD_DB_URL"] = live
        from app.db import session as session_module
        from app.services import db as db_module

        # Each test drives its own event loop, and an asyncpg connection is bound to the loop
        # that opened it, so a pooled one fails in the next test. Production keeps its pool;
        # only the test engine skips pooling (aiosqlite gets the same treatment in the app).
        from sqlalchemy.pool import NullPool

        real_create_engine = db_module.create_async_engine
        db_module.create_async_engine = lambda *a, **k: real_create_engine(
            *a, **{**k, "poolclass": NullPool}
        )
        db_module._engine = None
        session_module._session_maker = None
        yield
        db_module.create_async_engine = real_create_engine
        return

    db_path = Path(__file__).resolve().parents[1] / "_pytest_state" / "test.sqlite"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    env = dict(os.environ)
    env["OXBLOOD_DB_URL"] = f"sqlite:///{db_path}"
    env["PYTHONPATH"] = (
        str(Path(__file__).resolve().parents[1]) + os.pathsep + env.get("PYTHONPATH", "")
    )
    # Use the alembic binary against the same DB.
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

    # Point the running app at the same DB.
    os.environ["OXBLOOD_DB_URL"] = f"sqlite+aiosqlite:///{db_path}"
    # Test modules that import app.main at collection time populate the
    # cached settings with whatever OXBLOOD_DB_URL was set back then.
    from app.core.config import get_settings

    get_settings.cache_clear()
    # Reset the cached engine / sessionmaker so tests pick up the new URL.
    from app.services import db as db_module

    db_module._engine = None
    from app.db import session as session_module

    session_module._session_maker = None

    yield

    try:
        db_path.unlink()
    except OSError:  # pragma: no cover
        pass


def pytest_collection_modifyitems(config, items):
    """Skip live_pg tests unless OXBLOOD_TEST_LIVE_PG is set."""
    if _live_pg_url():
        return  # live PG requested — let the tests run
    skip_marker = pytest.mark.skip(reason="OXBLOOD_TEST_LIVE_PG not set")
    for item in items:
        if "live_pg" in item.keywords:
            item.add_marker(skip_marker)


@pytest.fixture(autouse=True)
def _fresh_memory_stores():
    """Rate-limit counters and setup-job progress live in process memory; no test inherits another's."""
    from app.services import memory_store

    memory_store.reset_for_tests()
    yield
    memory_store.reset_for_tests()


@pytest.fixture
def client() -> TestClient:
    # Reset cached DB engine + sessionmaker so each test sees the
    # SQLite (or live PG) URL set by the db_setup fixture rather than
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


@pytest.fixture(autouse=True)
def _reset_live_pg_between_tests():
    """Live-Postgres mode only: start every test on empty tables.

    SQLite ignores foreign keys, so the suite's best-effort per-test cleanups quietly work there.
    Postgres enforces them, a cleanup that deletes in the wrong order fails silently, and rows then
    leak into the next test. Truncating everything (except the migration marker) is the same
    isolation the throwaway SQLite file gives. Refuses any database whose name does not end in
    ``_test``, so it can never empty a real one.
    """
    url = _live_pg_url()
    if not url:
        yield
        return
    assert url.rsplit("/", 1)[-1].split("?", 1)[0].endswith("_test"), (
        "refusing to truncate a database whose name does not end in _test"
    )
    import asyncio

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    async def _truncate() -> None:
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            async with engine.begin() as conn:
                names = (
                    (
                        await conn.execute(
                            text(
                                "select tablename from pg_tables "
                                "where schemaname = 'public' and tablename <> 'alembic_version'"
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                if names:
                    quoted = ", ".join(f'"{n}"' for n in names)
                    await conn.execute(text(f"truncate {quoted} restart identity cascade"))
        finally:
            await engine.dispose()

    asyncio.run(_truncate())
    yield


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
            await s.execute(delete(db_models.TeamMembership))
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
