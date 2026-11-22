"""Postgres-only behaviour the models rely on."""

from __future__ import annotations

import sqlalchemy as sa
from app.services.db import get_engine


def _declared_enum_names() -> set[str]:
    from app.db import models, models_drill  # noqa: F401
    from app.db.base import Base

    return {
        c.type.name
        for t in Base.metadata.tables.values()
        for c in t.columns
        if isinstance(c.type, sa.Enum) and c.type.name
    }


async def test_postgres_enum_types_match_model_declarations() -> None:
    """Q4 regression: every enum declared in models.py must exist as a PostgreSQL type after
    ``alembic upgrade head``.

    A migration that declares a column as plain VARCHAR while the SQLAlchemy model declares
    ``Enum(..., name="x")`` means the type is never created, and any insert crashes with
    ``type "x" does not exist`` (it hid a broken ``team_memberships.role`` until the suite ran on Postgres).
    Every enum the models declare must exist after ``alembic upgrade head``.
    """
    async with get_engine().connect() as conn:
        rows = await conn.execute(
            sa.text(
                "SELECT t.typname FROM pg_type t "
                "JOIN pg_namespace n ON n.oid = t.typnamespace "
                "WHERE n.nspname='public' AND t.typtype='e' ORDER BY t.typname"
            )
        )
        types = [r[0] for r in rows.fetchall()]

    expected = _declared_enum_names()
    missing = expected - set(types)
    assert not missing, (
        f"Postgres is missing enum types the models declare: {sorted(missing)} (found {types})"
    )
