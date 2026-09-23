"""Jira-mode features: workspace.mode, sprints table, and task Jira fields.

Adds:
  - workspaces.mode column (TRELLO|JIRA, default TRELLO)
  - sprints table (project_id, name, goal, status, start_date, end_date)
  - tasks.sprint_id FK -> sprints.id SET NULL
  - tasks.epic_id FK -> tasks.id SET NULL (self-referential)
  - tasks.story_point (nullable integer)
  - tasks.type column (default TASK)
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0009_jira_mode_features"
down_revision = "0008_board_members_and_comment_mentions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- workspaces.mode ---------------------------------------------------
    op.add_column(
        "workspaces",
        sa.Column(
            "mode",
            sa.String(length=20),
            nullable=False,
            server_default="TRELLO",
        ),
    )

    # --- sprints table -----------------------------------------------------
    op.create_table(
        "sprints",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("goal", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="PLANNED",
        ),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="sprints_project_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="sprints_pkey"),
    )
    op.create_index("ix_sprints_project_id", "sprints", ["project_id"])
    op.create_index("ix_sprints_status", "sprints", ["status"])

    # --- tasks: sprint_id --------------------------------------------------
    op.add_column("tasks", sa.Column("sprint_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "tasks_sprint_id_fkey",
        "tasks",
        "sprints",
        ["sprint_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- tasks: epic_id (self-referential) ---------------------------------
    op.add_column("tasks", sa.Column("epic_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "tasks_epic_id_fkey",
        "tasks",
        "tasks",
        ["epic_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # --- tasks: story_point -----------------------------------------------
    op.add_column("tasks", sa.Column("story_point", sa.Integer(), nullable=True))

    # --- tasks: type -------------------------------------------------------
    op.add_column(
        "tasks",
        sa.Column(
            "type",
            sa.String(length=20),
            nullable=False,
            server_default="TASK",
        ),
    )


def downgrade() -> None:
    # Remove tasks Jira fields
    op.drop_column("tasks", "type")
    op.drop_column("tasks", "story_point")
    op.drop_constraint("tasks_epic_id_fkey", "tasks", type_="foreignkey")
    op.drop_column("tasks", "epic_id")
    op.drop_constraint("tasks_sprint_id_fkey", "tasks", type_="foreignkey")
    op.drop_column("tasks", "sprint_id")

    # Remove sprints table
    op.drop_index("ix_sprints_status", "sprints")
    op.drop_index("ix_sprints_project_id", "sprints")
    op.drop_table("sprints")

    # Remove workspaces.mode
    op.drop_column("workspaces", "mode")
