import uuid

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class AiActionAudit(UUIDMixin, TimestampMixin, table=True):
    """Audit trail for AI tool executions.

    Records only ids, names and short summaries -- never sensitive content.
    """

    __tablename__ = "ai_action_audit"

    # Nullable FKs (SET NULL) so audit rows survive user/workspace deletion.
    user_id: uuid.UUID | None = Field(
        default=None, foreign_key="users.id", ondelete="SET NULL", nullable=True
    )
    workspace_id: uuid.UUID | None = Field(
        default=None, foreign_key="workspaces.id", ondelete="SET NULL", nullable=True
    )
    tool_name: str = Field(max_length=100)
    args_json: str | None = Field(default=None, sa_type=Text, nullable=True)
    preview: str | None = Field(default=None, sa_type=Text, nullable=True)
    status: str = Field(max_length=20)  # executed | failed | denied
    result_summary: str | None = Field(default=None, sa_type=Text, nullable=True)
