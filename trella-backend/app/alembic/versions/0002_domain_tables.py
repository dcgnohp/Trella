"""Revision ID: 0002_domain_tables
Revises: 0001_foundational_tables
Create Date: 2024-01-01 00:00:01.000000
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0002_domain_tables"
down_revision = "0001_foundational_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- boards ------------------------------------------------------------
    op.create_table(
        "boards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("image_id", sa.String(), nullable=True),
        sa.Column("image_thumb_url", sa.String(), nullable=True),
        sa.Column("image_full_url", sa.String(), nullable=True),
        sa.Column("image_user_name", sa.String(), nullable=True),
        sa.Column("image_link_html", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name="boards_org_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="boards_pkey"),
    )

    # --- lists (board_lists domain / List model) --------------------------
    op.create_table(
        "lists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name="lists_board_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="lists_pkey"),
    )

    # --- cards (task_cards domain / Card model) ---------------------------
    op.create_table(
        "cards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("list_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["list_id"],
            ["lists.id"],
            name="cards_list_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="cards_pkey"),
    )

    # --- audit_logs --------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("entity_title", sa.String(), nullable=False),
        sa.Column("user_name", sa.String(), nullable=False),
        sa.Column("user_image", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name="audit_logs_org_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="audit_logs_user_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="audit_logs_pkey"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("cards")
    op.drop_table("lists")
    op.drop_table("boards")
