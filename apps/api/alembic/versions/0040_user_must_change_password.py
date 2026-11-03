"""First-sign-in password change: ``users.must_change_password``.

Accounts created from a pasted list of names get a generated password that an operator hands out.
Such an account may only change its password until it has done so. Existing accounts are unaffected.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0040_user_must_change_password"
down_revision = "0039_user_created_for_drill"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}


def upgrade() -> None:
    if "must_change_password" in _columns():
        return
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )


def downgrade() -> None:
    if "must_change_password" not in _columns():
        return
    with op.batch_alter_table("users") as batch:
        batch.drop_column("must_change_password")
