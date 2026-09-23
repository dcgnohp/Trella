"""Add plans, plan_boards tables and tasks.start_date column.

Adds:
  - tasks.start_date (nullable timestamptz)
  - plans table (workspace-scoped, name/description, created_by)
  - plan_boards table (plan <-> board join, unique per pair)
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0014_add_plans_and_task_start_date"
down_revision = "0013_update_workspace_mode_enum"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- tasks.start_date ---------------------------------------------------
    op.add_column(
        "tasks", sa.Column("start_date", sa.DateTime(timezone=True), nullable=True)
    )

    # --- plans ---------------------------------------------------------------
    op.create_table(
        "plans",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="plans_workspace_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="plans_created_by_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="plans_pkey"),
    )

    # --- plan_boards -----------------------------------------------------
    op.create_table(
        "plan_boards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("board_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["plans.id"],
            name="plan_boards_plan_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["board_id"],
            ["boards.id"],
            name="plan_boards_board_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="plan_boards_pkey"),
        sa.UniqueConstraint(
            "plan_id", "board_id", name="uq_plan_boards_plan_id_board_id"
        ),
    )


def downgrade() -> None:
    op.drop_table("plan_boards")
    op.drop_table("plans")
    op.drop_column("tasks", "start_date")
