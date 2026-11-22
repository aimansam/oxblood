"""Rename the ``lead`` role to ``leader``.

The role is stored as plain text in ``users.role`` (and appears in signed tokens, which are not stored), so
existing accounts are renamed here; a token issued before the change still says ``lead`` and is refused until
the person signs in again.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0044_role_lead_to_leader"
down_revision = "0043_drop_unused_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("UPDATE users SET role = 'leader' WHERE role = 'lead'"))


def downgrade() -> None:
    op.execute(sa.text("UPDATE users SET role = 'lead' WHERE role = 'leader'"))
