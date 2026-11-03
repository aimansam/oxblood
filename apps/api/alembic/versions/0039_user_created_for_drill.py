"""Exercise-scoped accounts: ``users.created_for_drill_id``.

Accounts created for one exercise (invitation link, pasted names, test players) are marked with it so
they can be destroyed when the exercise's range is cleaned up. Existing accounts stay unmarked.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0039_user_created_for_drill"
down_revision = "0038_invitation_uses"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}


def upgrade() -> None:
    if "created_for_drill_id" in _columns():
        return
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("created_for_drill_id", sa.Integer(), nullable=True))
    op.create_index("ix_users_created_for_drill_id", "users", ["created_for_drill_id"])


def downgrade() -> None:
    if "created_for_drill_id" not in _columns():
        return
    op.drop_index("ix_users_created_for_drill_id", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("created_for_drill_id")
