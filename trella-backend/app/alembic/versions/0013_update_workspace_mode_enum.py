"""Rename workspace mode values TRELLO→KANBAN and JIRA→SCRUM.

Updates existing rows in the workspaces table so that any legacy
TRELLO values become KANBAN and any legacy JIRA values become SCRUM.
"""

import sqlalchemy as sa
from alembic import op

revision = "0013_update_workspace_mode_enum"
down_revision = "0012_issue_key_task_counter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE workspaces SET mode = 'KANBAN' WHERE mode = 'TRELLO'")
    op.execute("UPDATE workspaces SET mode = 'SCRUM' WHERE mode = 'JIRA'")


def downgrade() -> None:
    op.execute("UPDATE workspaces SET mode = 'TRELLO' WHERE mode = 'KANBAN'")
    op.execute("UPDATE workspaces SET mode = 'JIRA' WHERE mode = 'SCRUM'")
