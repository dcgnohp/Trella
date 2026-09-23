import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0005_columns_and_tasks_rename"
down_revision = "0004_projects_and_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- board_columns (from lists) ----------------------------------------
    op.rename_table("lists", "board_columns")
    op.alter_column("board_columns", "title", new_column_name="name")
    op.alter_column("board_columns", "order", new_column_name="position")
    op.add_column(
        "board_columns",
        sa.Column(
            "status_key",
            sa.String(length=100),
            nullable=False,
            server_default="",
        ),
    )

    # --- tasks (from cards) ------------------------------------------------
    op.rename_table("cards", "tasks")
    op.alter_column("tasks", "list_id", new_column_name="column_id")
    op.alter_column("tasks", "order", new_column_name="position")

    # Added NULLABLE first so existing rows survive, backfilled below, then tightened to NOT NULL + FK.
    op.add_column("tasks", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.add_column("tasks", sa.Column("board_id", sa.Uuid(), nullable=True))

    op.add_column("tasks", sa.Column("assignee_id", sa.Uuid(), nullable=True))
    # custom_status_id has no FK here; FK to custom_statuses.id is added in 0006.
    op.add_column(
        "tasks", sa.Column("custom_status_id", sa.Uuid(), nullable=True)
    )
    op.add_column(
        "tasks",
        sa.Column(
            "priority",
            sa.String(length=20),
            nullable=False,
            server_default="MEDIUM",
        ),
    )
    op.add_column(
        "tasks",
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
    )

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE tasks "
            "SET board_id = bc.board_id "
            "FROM board_columns bc "
            "WHERE bc.id = tasks.column_id"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE tasks "
            "SET project_id = b.project_id "
            "FROM boards b "
            "WHERE b.id = tasks.board_id"
        )
    )

    op.alter_column("tasks", "board_id", nullable=False)
    op.alter_column("tasks", "project_id", nullable=False)

    op.create_foreign_key(
        "tasks_project_id_fkey",
        "tasks",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "tasks_board_id_fkey",
        "tasks",
        "boards",
        ["board_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "tasks_assignee_id_fkey",
        "tasks",
        "users",
        ["assignee_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # --- tasks (back to cards) ---------------------------------------------
    op.drop_constraint("tasks_assignee_id_fkey", "tasks", type_="foreignkey")
    op.drop_constraint("tasks_board_id_fkey", "tasks", type_="foreignkey")
    op.drop_constraint("tasks_project_id_fkey", "tasks", type_="foreignkey")

    op.drop_column("tasks", "due_date")
    op.drop_column("tasks", "priority")
    op.drop_column("tasks", "custom_status_id")
    op.drop_column("tasks", "assignee_id")
    op.drop_column("tasks", "board_id")
    op.drop_column("tasks", "project_id")

    op.alter_column("tasks", "position", new_column_name="order")
    op.alter_column("tasks", "column_id", new_column_name="list_id")
    op.rename_table("tasks", "cards")

    # --- board_columns (back to lists) -------------------------------------
    op.drop_column("board_columns", "status_key")
    op.alter_column("board_columns", "position", new_column_name="order")
    op.alter_column("board_columns", "name", new_column_name="title")
    op.rename_table("board_columns", "lists")
