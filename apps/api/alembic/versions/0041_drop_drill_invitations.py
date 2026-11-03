"""Remove invitation links.

Players are now created from a pasted list (generated password, replaced at first sign-in), so the
``drill_invitations`` table has no use. Downgrade recreates its structure (not its rows).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0041_drop_drill_invitations"
down_revision = "0040_user_must_change_password"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "drill_invitations" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("drill_invitations")


def downgrade() -> None:
    if "drill_invitations" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "drill_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "drill_id", sa.Integer(), sa.ForeignKey("drills.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(timezone=True)),
        sa.Column("redeemed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "drill_team_id", sa.Integer(), sa.ForeignKey("drill_teams.id", ondelete="SET NULL")
        ),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("uses", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_drill_invitations_drill_id", "drill_invitations", ["drill_id"])
