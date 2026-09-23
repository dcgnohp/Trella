"""Add parent_id to tasks for subtask support.

Adds:
  - tasks.parent_id FK -> tasks.id SET NULL (self-referential)
"""

import sqlalchemy as sa
from alembic import op

revision = "0010_task_parent_id"
down_revision = "0009_jira_mode_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("parent_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tasks_parent_id",
        "tasks",
        "tasks",
        ["parent_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_tasks_parent_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "parent_id")
