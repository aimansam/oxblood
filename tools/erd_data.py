"""What the database diagrams are drawn from: the SQLAlchemy models, plus a hand-made layout.

The tables, keys and foreign keys come from the models, so a diagram cannot drift from the schema. The
layout is written by hand (automatic layout of 38 tables is unreadable): each diagram lists the tables it
owns with a (column, row) cell, plus "stubs", tables owned by another diagram that are drawn faded so a
line never leaves the picture. tests/test_erd_data.py fails when a table is on no diagram, so a new table
has to be added here.
"""

from __future__ import annotations

import sys
import warnings
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

Cell = tuple[int, int]


@dataclass(frozen=True)
class Fk:
    column: str
    target: str  # the table the column references


@dataclass(frozen=True)
class Table:
    name: str
    primary_key: tuple[str, ...]
    foreign_keys: tuple[Fk, ...]
    columns: int


@dataclass(frozen=True)
class Edge:
    source: str  # the table that holds the foreign key
    column: str
    target: str  # the table it points to


@dataclass(frozen=True)
class Group:
    filename: str
    title: str
    subtitle: str
    cells: dict[str, Cell]  # tables this diagram owns
    stubs: dict[str, Cell] = field(
        default_factory=dict
    )  # tables owned by another diagram; "name@2" is a second copy
    # Hub tables that nearly everything points at: their keys are named in the boxes but no line is drawn.
    quiet: tuple[str, ...] = ()

    def placed(self) -> dict[str, Cell]:
        return {**self.cells, **self.stubs}


GROUPS: tuple[Group, ...] = (
    Group(
        filename="erd-runs.png",
        title="Database: scenarios, runs and machines",
        subtitle="The catalog of scenarios and templates, and the runs started from them with their machines and events",
        cells={
            "scenarios": (0, 0),
            "templates": (1, 0),
            "runs": (2, 0),
            "assets": (3, 0),
            "snapshot_baselines": (0, 1),
            "flag_submissions": (1, 1),
            "telemetry_events": (2, 1),
            "audit_log": (3, 1),
            "pve_config": (0, 2),
        },
        stubs={"scenarios@2": (4, 1)},
    ),
    Group(
        filename="erd-drills.png",
        title="Database: drills",
        subtitle="A drill, its scenario, teams, rounds, objectives and flags, and the events and scores around it",
        cells={
            "drill_announcements": (0, 0),
            "drill_events": (1, 0),
            "drill_scenarios": (2, 0),
            "drill_objectives": (3, 0),
            "drill_participants": (0, 1),
            "drills": (1, 1),
            "drill_rounds": (2, 1),
            "drill_team_flags": (0, 2),
            "drill_teams": (1, 2),
            "drill_score_events": (2, 2),
            "drill_flags": (3, 2),
            "drill_environment_locks": (0, 3),
            "drill_flag_submissions": (2, 3),
        },
        stubs={"submissions": (1, 3)},
        quiet=("users",),
    ),
    Group(
        filename="erd-scoring.png",
        title="Database: players, submissions and scores",
        subtitle="Who the players are, the flags they submit and how it is scored",
        cells={
            "submissions": (0, 0),
            "scores": (1, 0),
            "score_history": (2, 0),
            "first_bloods": (3, 0),
            "users": (0, 1),
        },
        stubs={"drill_flags": (3, 1)},
        quiet=("users", "drills"),
    ),
)


def load_tables() -> tuple[dict[str, Table], list[Edge]]:
    """Every table and foreign key in the models (importing them needs no database)."""
    sys.path.insert(0, str(REPO / "apps" / "api"))
    from app.db import models, models_drill  # noqa: F401  # register every table
    from app.db.base import Base

    tables: dict[str, Table] = {}
    edges: list[Edge] = []
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # runs <-> templates reference each other
        for t in Base.metadata.tables.values():
            fks = sorted(t.foreign_keys, key=lambda fk: fk.parent.name)
            tables[t.name] = Table(
                name=t.name,
                primary_key=tuple(c.name for c in t.primary_key.columns),
                foreign_keys=tuple(Fk(fk.parent.name, fk.column.table.name) for fk in fks),
                columns=len(t.columns),
            )
            edges += [Edge(t.name, fk.parent.name, fk.column.table.name) for fk in fks]
    return tables, edges
