"""Remove tables nothing uses.

* The old "exercise" model (``exercises``, ``teams``, ``team_memberships``, ``runs.exercise_id``): the web app
  plays on drills and drill teams, and adding a member here never worked on PostgreSQL (the ``team_role`` enum
  was never created).
* The benchmark, evidence and per-attempt tables (``benchmarks``, ``benchmark_history``, ``evidence``,
  ``evidence_submissions``, ``report_submissions``, ``submission_attempts``) and the report tables
  (``reports``, ``report_findings``): no screen, scenario or tool wrote to them. The Reports page now reads
  finished drills.

All of them were empty. Downgrade does not bring them back (the older revisions' downgrades skip tables that
are missing), so downgrading below this revision loses nothing it ever held.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0043_drop_unused_tables"
down_revision = "0042_drop_user_wg_peer"
branch_labels = None
depends_on = None

# Children before parents.
_TABLES = (
    "evidence",
    "report_findings",
    "reports",
    "evidence_submissions",
    "report_submissions",
    "benchmark_history",
    "benchmarks",
    "submission_attempts",
    "team_memberships",
    "teams",
    "exercises",
)
_ENUMS = ("evidence_type", "report_status", "severity_level", "exercise_status", "team_role")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    # The foreign key goes with the column.
    if "exercise_id" in {c["name"] for c in inspector.get_columns("runs")}:
        op.drop_column("runs", "exercise_id")
    for name in _TABLES:
        if name in tables:
            op.drop_table(name)
    for name in _ENUMS:
        op.execute(sa.text(f"DROP TYPE IF EXISTS {name}"))


def downgrade() -> None:
    # Intentionally empty: see the module docstring.
    pass
