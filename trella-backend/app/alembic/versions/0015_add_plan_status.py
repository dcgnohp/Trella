"""Add status column to plans table.

Adds:
  - plans.status (varchar(50) default 'PLANNING')
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0015_add_plan_status"
down_revision = "0014_add_plans_and_task_start_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column("status", sa.String(length=50), nullable=False, server_default="PLANNING")
    )


def downgrade() -> None:
    op.drop_column("plans", "status")
