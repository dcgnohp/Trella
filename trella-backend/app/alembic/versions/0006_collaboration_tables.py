"""collaboration tables: comments, attachments, custom_statuses, activity_logs, notifications.

Revision ID: 0006_collaboration_tables
Revises: 0005_columns_and_tasks_rename
Create Date: 2024-01-01 00:00:05.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0006_collaboration_tables"
down_revision = "0005_columns_and_tasks_rename"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- comments ----------------------------------------------------------
    op.create_table(
        "comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name="comments_task_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="comments_user_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="comments_pkey"),
    )

    # --- attachments -------------------------------------------------------
    op.create_table(
        "attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("uploader_id", sa.Uuid(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name="attachments_task_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploader_id"],
            ["users.id"],
            name="attachments_uploader_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="attachments_pkey"),
    )

    # --- custom_statuses ---------------------------------------------------
    op.create_table(
        "custom_statuses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("canonical_status", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="custom_statuses_workspace_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="custom_statuses_pkey"),
        sa.UniqueConstraint(
            "workspace_id",
            "name",
            name="uq_custom_statuses_workspace_id_name",
        ),
    )

    # --- activity_logs -----------------------------------------------------
    # task_id is NULLABLE with ON DELETE SET NULL so activity history survives task deletion.
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("old_value", postgresql.JSONB(), nullable=True),
        sa.Column("new_value", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="activity_logs_workspace_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="activity_logs_project_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["tasks.id"],
            name="activity_logs_task_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name="activity_logs_actor_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="activity_logs_pkey"),
    )

    # --- notifications -----------------------------------------------------
    # The JSONB payload column's physical name is ``metadata``; the model uses
    # ``notif_metadata`` to avoid SQLModel's reserved ``metadata`` attribute.
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="notifications_user_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="notifications_pkey"),
    )

    # --- deferred FK: tasks.custom_status_id -> custom_statuses.id ---------
    # Column was added without FK in 0005; wire it now that custom_statuses exists.
    op.create_foreign_key(
        "tasks_custom_status_id_fkey",
        "tasks",
        "custom_statuses",
        ["custom_status_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Drop the tasks FK first so custom_statuses can be dropped.
    op.drop_constraint(
        "tasks_custom_status_id_fkey", "tasks", type_="foreignkey"
    )

    op.drop_table("notifications")
    op.drop_table("activity_logs")
    op.drop_table("custom_statuses")
    op.drop_table("attachments")
    op.drop_table("comments")
