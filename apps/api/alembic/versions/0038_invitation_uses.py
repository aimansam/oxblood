"""Reusable invitation links: ``drill_invitations.max_uses`` and ``uses``.

A team link serves several players. Existing links stay single-use; one that was already redeemed
is marked as used once.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0038_invitation_uses"
down_revision = "0037_matches"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("drill_invitations")}


def upgrade() -> None:
    have = _columns()
    with op.batch_alter_table("drill_invitations") as batch:
        if "max_uses" not in have:
            batch.add_column(
                sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1")
            )
        if "uses" not in have:
            batch.add_column(sa.Column("uses", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE drill_invitations SET uses = 1 WHERE redeemed_at IS NOT NULL AND uses = 0")


def downgrade() -> None:
    have = _columns()
    with op.batch_alter_table("drill_invitations") as batch:
        if "uses" in have:
            batch.drop_column("uses")
        if "max_uses" in have:
            batch.drop_column("max_uses")
