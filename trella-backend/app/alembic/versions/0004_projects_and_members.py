"""Add projects, project_members tables and boards.project_id column.

Revision ID: 0004_projects_and_members
Revises: 0003_workspace_rename_and_status
Create Date: 2024-01-01 00:00:03.000000
"""

import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0004_projects_and_members"
down_revision = "0003_workspace_rename_and_status"
branch_labels = None
depends_on = None


# Lightweight Core table definitions used only by the backfill step.
_projects = sa.table(
    "projects",
    sa.column("id", sa.Uuid()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
    sa.column("workspace_id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("key", sa.String()),
    sa.column("description", sa.Text()),
    sa.column("created_by", sa.Uuid()),
)

_project_members = sa.table(
    "project_members",
    sa.column("id", sa.Uuid()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
    sa.column("project_id", sa.Uuid()),
    sa.column("user_id", sa.Uuid()),
    sa.column("project_role", sa.String()),
    sa.column("status", sa.String()),
)


def upgrade() -> None:
    # --- projects ----------------------------------------------------------
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("key", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="projects_workspace_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="projects_created_by_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="projects_pkey"),
        sa.UniqueConstraint(
            "workspace_id", "key", name="uq_projects_workspace_id_key"
        ),
    )

    # --- project_members ---------------------------------------------------
    op.create_table(
        "project_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_role", sa.String(), nullable=False),
        sa.Column(
            "status", sa.String(), nullable=False, server_default="PENDING"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="project_members_project_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="project_members_user_id_fkey",
        ),
        sa.PrimaryKeyConstraint("id", name="project_members_pkey"),
        sa.UniqueConstraint(
            "project_id", "user_id", name="uq_project_members_project_id_user_id"
        ),
    )

    # --- data migration: Default Project per workspace + admin members -----
    _backfill_default_projects()

    # --- boards.project_id (nullable -> backfill -> NOT NULL + FK) ---------
    op.add_column(
        "boards", sa.Column("project_id", sa.Uuid(), nullable=True)
    )

    bind = op.get_bind()
    # Backfill using boards.org_id which points at workspaces.id after the 0003 rename.
    bind.execute(
        sa.text(
            "UPDATE boards "
            "SET project_id = p.id "
            "FROM projects p "
            "WHERE p.workspace_id = boards.org_id "
            "AND p.key = 'DEFAULT'"
        )
    )

    op.alter_column("boards", "project_id", nullable=False)
    op.create_foreign_key(
        "boards_project_id_fkey",
        "boards",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )


def _backfill_default_projects() -> None:
    """Create one Default Project per workspace and bootstrap OWNER/ADMIN as PROJECT_ADMIN members."""
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    workspace_ids = [
        row[0]
        for row in bind.execute(sa.text("SELECT id FROM workspaces")).fetchall()
    ]
    if not workspace_ids:
        return

    # Fallback: any user in the system (created_by is NOT NULL).
    fallback_user_row = bind.execute(
        sa.text("SELECT id FROM users LIMIT 1")
    ).fetchone()
    fallback_user_id = fallback_user_row[0] if fallback_user_row else None

    for workspace_id in workspace_ids:
        members = bind.execute(
            sa.text(
                "SELECT user_id, role FROM workspace_members "
                "WHERE workspace_id = :wid"
            ),
            {"wid": workspace_id},
        ).fetchall()

        # Resolve created_by: OWNER > ADMIN > any member > fallback user.
        owners = [m[0] for m in members if m[1] == "OWNER"]
        admins = [m[0] for m in members if m[1] == "ADMIN"]
        any_member = [m[0] for m in members]
        created_by = None
        if owners:
            created_by = owners[0]
        elif admins:
            created_by = admins[0]
        elif any_member:
            created_by = any_member[0]
        else:
            created_by = fallback_user_id

        if created_by is None:
            # No users exist; skip — workspace has no boards requiring project_id.
            continue

        project_id = uuid.uuid4()
        bind.execute(
            _projects.insert().values(
                id=project_id,
                created_at=now,
                updated_at=now,
                workspace_id=workspace_id,
                name="Default Project",
                key="DEFAULT",
                description=None,
                created_by=created_by,
            )
        )

        # Add OWNER/ADMIN workspace members as PROJECT_ADMIN to preserve board access.
        admin_member_ids = [m[0] for m in members if m[1] in ("OWNER", "ADMIN")]
        for user_id in admin_member_ids:
            bind.execute(
                _project_members.insert().values(
                    id=uuid.uuid4(),
                    created_at=now,
                    updated_at=now,
                    project_id=project_id,
                    user_id=user_id,
                    project_role="PROJECT_ADMIN",
                    status="ACTIVE",
                )
            )


def downgrade() -> None:
    # --- boards.project_id -------------------------------------------------
    op.drop_constraint("boards_project_id_fkey", "boards", type_="foreignkey")
    op.drop_column("boards", "project_id")

    # --- project_members ---------------------------------------------------
    op.drop_table("project_members")

    # --- projects ----------------------------------------------------------
    op.drop_table("projects")
