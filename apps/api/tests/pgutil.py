"""PostgreSQL for the tests. The suite runs on Postgres only; there is no SQLite mode.

``OXBLOOD_TEST_DB_URL`` names a throwaway database (default: the one the CI service container provides).
Its name must end in ``_test`` or ``_e2e``: everything here wipes data, so it refuses any other database.

Two kinds of database use:

* The shared database (``conftest.py``): migrated once per session with Alembic, then emptied between tests.
* ``isolated_engine()``: a private schema with every table, for tests that build their own engine. The
  schema is dropped after the test.

Run as a script, ``python3 pgutil.py reset`` empties the database (used before the browser tests).
"""

from __future__ import annotations

import os
import sys
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

DEFAULT_URL = "postgresql+asyncpg://oxblood:oxblood@localhost:5432/oxblood_test"
SCHEMA_PREFIX = "t_"

_made: list[str] = []


def db_url() -> str:
    """The async URL of the test database, refusing any database that is not clearly a test one."""
    url = os.environ.get("OXBLOOD_TEST_DB_URL", "").strip() or DEFAULT_URL
    assert url.startswith("postgresql"), (
        f"OXBLOOD_TEST_DB_URL must be a PostgreSQL URL, got {url!r}"
    )
    if "+" not in url.split("://", 1)[0]:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    name = make_url(url).database or ""
    assert name.endswith(("_test", "_e2e")), (
        f"refusing to use database {name!r}: its name must end in _test or _e2e"
    )
    return url


def sync_url(url: str | None = None) -> str:
    """The same database through the synchronous driver (Alembic, schema management)."""
    return (
        make_url(url or db_url())
        .set(drivername="postgresql+psycopg2")
        .render_as_string(hide_password=False)
    )


def reset_database(url: str | None = None) -> None:
    """Drop everything in the test database and leave an empty ``public`` schema."""
    engine = create_engine(sync_url(url), poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            conn.execute(text("drop schema if exists public cascade"))
            conn.execute(text("create schema public"))
    finally:
        engine.dispose()


def isolated_engine() -> AsyncEngine:
    """An async engine on a fresh private schema that already holds every table.

    Use it where a test used to open its own in-memory database. Connections are not pooled, so the
    engine works from any event loop. ``drop_isolated_schemas`` (an autouse fixture) removes the schema.
    """
    from app.db import models, models_drill  # noqa: F401  # register every table
    from app.db.base import Base

    url = db_url()
    schema = f"{SCHEMA_PREFIX}{uuid.uuid4().hex[:12]}"
    sync = create_engine(sync_url(url), poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        with sync.connect() as conn:
            conn.execute(text(f'create schema "{schema}"'))
        _made.append(schema)
        scoped = create_engine(
            sync_url(url), poolclass=NullPool, connect_args={"options": f"-csearch_path={schema}"}
        )
        try:
            Base.metadata.create_all(scoped)
        finally:
            scoped.dispose()
    finally:
        sync.dispose()
    return create_async_engine(
        url, poolclass=NullPool, connect_args={"server_settings": {"search_path": schema}}
    )


def drop_isolated_schemas() -> None:
    """Drop the private schemas made since the last call."""
    if not _made:
        return
    engine = create_engine(sync_url(), poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            while _made:
                conn.execute(text(f'drop schema if exists "{_made.pop()}" cascade'))
    finally:
        engine.dispose()


def empty_tables(url: str | None = None) -> None:
    """Empty every table that holds rows (all but the migration marker). Cheap when nothing changed."""
    engine = create_engine(sync_url(url), poolclass=NullPool)
    try:
        with engine.begin() as conn:
            names = (
                conn.execute(
                    text(
                        "select tablename from pg_tables "
                        "where schemaname = 'public' and tablename <> 'alembic_version'"
                    )
                )
                .scalars()
                .all()
            )
            if not names:
                return
            probe = " union all ".join(
                f"select '{n}' where exists (select 1 from \"{n}\")" for n in names
            )
            dirty = conn.execute(text(probe)).scalars().all()
            if dirty:
                quoted = ", ".join(f'"{n}"' for n in dirty)
                conn.execute(text(f"truncate {quoted} restart identity cascade"))
    finally:
        engine.dispose()


if __name__ == "__main__":
    if sys.argv[1:] == ["reset"]:
        reset_database()
        print("test database emptied")
    else:
        sys.exit("usage: pgutil.py reset")
