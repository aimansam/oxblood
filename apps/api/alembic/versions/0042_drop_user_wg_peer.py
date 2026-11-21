"""Remove the WireGuard peer id from users.

The VPN config endpoint and its WireGuard service are gone, so ``users.wg_peer_id`` has no use.
Downgrade restores the nullable column and its unique index (not any values).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0042_drop_user_wg_peer"
down_revision = "0041_drop_drill_invitations"
branch_labels = None
depends_on = None


def _has_column() -> bool:
    return "wg_peer_id" in {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}


def upgrade() -> None:
    if not _has_column():
        return
    # SQLite cannot drop an indexed column in place; a batch op rebuilds the table.
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_wg_peer_id")
        batch_op.drop_column("wg_peer_id")


def downgrade() -> None:
    if _has_column():
        return
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("wg_peer_id", sa.String(length=36), nullable=True))
        batch_op.create_index("ix_users_wg_peer_id", ["wg_peer_id"], unique=True)
