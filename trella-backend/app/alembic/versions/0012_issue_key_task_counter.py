"""Add issue_key to tasks and task_counter to projects.

Adds:
  - tasks.issue_key (VARCHAR(50), nullable, unique)
  - projects.task_counter (INTEGER, not null, default 0)
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_issue_key_task_counter"
down_revision = "0011_velocity_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("issue_key", sa.String(50), nullable=True),
    )
    op.create_unique_constraint("uq_tasks_issue_key", "tasks", ["issue_key"])
    op.create_index("ix_tasks_issue_key", "tasks", ["issue_key"], unique=True)

    op.add_column(
        "projects",
        sa.Column("task_counter", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_issue_key", "tasks")
    op.drop_constraint("uq_tasks_issue_key", "tasks", type_="unique")
    op.drop_column("tasks", "issue_key")
    op.drop_column("projects", "task_counter")
