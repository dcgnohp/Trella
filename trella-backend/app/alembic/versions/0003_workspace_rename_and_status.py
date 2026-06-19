import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0003_workspace_rename_and_status"
down_revision = "0002_domain_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("organizations", "workspaces")

    op.rename_table("organization_members", "workspace_members")

    op.alter_column(
        "workspace_members", "org_id", new_column_name="workspace_id"
    )

    op.add_column(
        "workspace_members",
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="ACTIVE",
        ),
    )

    op.add_column(
        "workspace_members",
        sa.Column("invited_by", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "workspace_members_invited_by_fkey",
        "workspace_members",
        "users",
        ["invited_by"],
        ["id"],
    )

    op.create_unique_constraint(
        "uq_workspace_members_workspace_id_user_id",
        "workspace_members",
        ["workspace_id", "user_id"],
    )

    op.add_column(
        "users",
        sa.Column(
            "status",
            sa.String(length=50),
            nullable=False,
            server_default="ACTIVE",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "status")

    op.drop_constraint(
        "uq_workspace_members_workspace_id_user_id",
        "workspace_members",
        type_="unique",
    )
    op.drop_constraint(
        "workspace_members_invited_by_fkey",
        "workspace_members",
        type_="foreignkey",
    )
    op.drop_column("workspace_members", "invited_by")
    op.drop_column("workspace_members", "status")

    op.alter_column(
        "workspace_members", "workspace_id", new_column_name="org_id"
    )

    op.rename_table("workspace_members", "organization_members")
    op.rename_table("workspaces", "organizations")
