"""Drop legacy boards.org_id column, now replaced by boards.project_id."""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0007_drop_legacy_org_id"
down_revision = "0006_collaboration_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("boards_org_id_fkey", "boards", type_="foreignkey")
    op.drop_column("boards", "org_id")


def downgrade() -> None:
    op.add_column("boards", sa.Column("org_id", sa.Uuid(), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE boards "
            "SET org_id = p.workspace_id "
            "FROM projects p "
            "WHERE p.id = boards.project_id"
        )
    )

    op.create_foreign_key(
        "boards_org_id_fkey",
        "boards",
        "workspaces",
        ["org_id"],
        ["id"],
        ondelete="CASCADE",
    )
