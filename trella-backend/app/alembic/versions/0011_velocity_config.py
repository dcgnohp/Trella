"""Add velocity_configs table.

Adds:
  - velocity_configs table (workspace_id unique FK, hours_per_point float)

Note: tasks.assignee_id already exists from migration 0005_columns_and_tasks_rename.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0011_velocity_config"
down_revision = "0010_task_parent_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- velocity_configs table -------------------------------------------
    op.create_table(
        "velocity_configs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column(
            "hours_per_point",
            sa.Float(),
            nullable=False,
            server_default="4.0",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="velocity_configs_workspace_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="velocity_configs_pkey"),
        sa.UniqueConstraint("workspace_id", name="velocity_configs_workspace_id_key"),
    )
    op.create_index(
        "ix_velocity_configs_workspace_id",
        "velocity_configs",
        ["workspace_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_velocity_configs_workspace_id", "velocity_configs")
    op.drop_table("velocity_configs")
