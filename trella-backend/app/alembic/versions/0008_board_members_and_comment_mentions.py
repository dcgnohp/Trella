"""Add board_members and comment_mentions tables."""

import sqlalchemy as sa
from alembic import op

revision = "0008_board_members_and_comment_mentions"
down_revision = "0007_drop_legacy_org_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "board_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="PENDING"),
        sa.Column("invited_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("board_id", "user_id", name="uq_board_members_board_id_user_id"),
    )
    op.create_index("ix_board_members_board_id", "board_members", ["board_id"])
    op.create_index("ix_board_members_user_id", "board_members", ["user_id"])

    op.create_table(
        "comment_mentions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("comment_id", sa.Uuid(), nullable=False),
        sa.Column("mentioned_user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mentioned_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "comment_id",
            "mentioned_user_id",
            name="uq_comment_mentions_comment_id_user_id",
        ),
    )
    op.create_index("ix_comment_mentions_comment_id", "comment_mentions", ["comment_id"])


def downgrade() -> None:
    op.drop_table("comment_mentions")
    op.drop_table("board_members")
