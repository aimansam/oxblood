"""End-to-end test for the Alembic migration chain, on PostgreSQL.

Each test migrates an emptied test database through alembic.ini + env.py, inspects the
resulting schema and, where relevant, runs `downgrade base`. Catches:
- Migration import errors
- Schema drift between models and migration
- Downgrade irreversibility
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.pool import NullPool

from .pgutil import db_url, reset_database, sync_url

ROOT = Path(__file__).resolve().parent.parent
ALEMBIC_INI = ROOT / "alembic.ini"


class Db:
    """The test database's ``public`` schema, and the way to migrate and inspect it.

    Migrations look up enum types by name across every schema, so they cannot be scoped to a private
    schema: these tests empty the whole database and rebuild it, and the module fixture below migrates
    it back to head for the tests that follow.
    """

    def __init__(self) -> None:
        self.env = dict(os.environ)
        self.env["OXBLOOD_DB_URL"] = db_url()
        self.env["PYTHONPATH"] = str(ROOT) + os.pathsep + self.env.get("PYTHONPATH", "")

    def alembic(self, *args: str) -> subprocess.CompletedProcess:
        r = subprocess.run(
            [sys.executable, "-m", "alembic", "--config", str(ALEMBIC_INI), *args],
            capture_output=True,
            text=True,
            env=self.env,
            cwd=ROOT,
        )
        assert r.returncode == 0, f"alembic {' '.join(args)} failed:\n{r.stderr}\n{r.stdout}"
        return r

    def engine(self):
        return create_engine(sync_url(db_url()), poolclass=NullPool)

    def tables(self) -> set[str]:
        engine = self.engine()
        try:
            return set(inspect(engine).get_table_names())
        finally:
            engine.dispose()


@pytest.fixture(scope="module", autouse=True)
def _restore_head_afterwards():
    yield
    reset_database()
    Db().alembic("upgrade", "head")


@pytest.fixture
def db():
    reset_database()
    return Db()


def test_alembic_upgrade_creates_all_tables(db) -> None:
    db.alembic("upgrade", "head")
    # Our 4 tables + alembic_version
    assert {"scenarios", "runs", "assets", "audit_log", "alembic_version"} <= db.tables()


def test_alembic_upgrade_creates_drill_and_v1_flag_tables(db) -> None:
    """A database built only from migrations has every table the models use.

    The drill tables once existed only through ``create_all``, and ``flag_submissions`` was dropped by a
    migration that the code still depends on.
    """
    from app.db import models, models_drill  # noqa: F401
    from app.db.base import Base

    db.alembic("upgrade", "head")
    tables = db.tables()

    drill_tables = {
        mapper.class_.__tablename__
        for mapper in Base.registry.mappers
        if mapper.class_.__module__.endswith("models_drill")
    }
    assert len(drill_tables) >= 20
    assert drill_tables <= tables, f"missing drill tables: {sorted(drill_tables - tables)}"
    assert "flag_submissions" in tables


def test_alembic_current_reports_head(db) -> None:
    db.alembic("upgrade", "head")
    r = db.alembic("current")
    assert "(head)" in r.stdout


def test_alembic_downgrade_removes_all_tables(db) -> None:
    db.alembic("upgrade", "head")
    db.alembic("downgrade", "base")
    tables = db.tables()
    assert tables == {"alembic_version"}, f"expected only alembic_version left, got {tables}"


def test_alembic_round_trip(db) -> None:
    """upgrade -> downgrade -> upgrade should be a no-op and end at head."""
    for cmd in (["upgrade", "head"], ["downgrade", "base"], ["upgrade", "head"]):
        db.alembic(*cmd)
    assert "(head)" in db.alembic("current").stdout


def test_alembic_indexes_present(db) -> None:
    db.alembic("upgrade", "head")
    engine = db.engine()
    try:
        insp = inspect(engine)
        # Each non-meta table needs at least one declared index (beyond PK).
        for tbl in ("scenarios", "runs", "assets", "audit_log"):
            assert insp.get_indexes(tbl), f"{tbl} has no declared indexes"
    finally:
        engine.dispose()

