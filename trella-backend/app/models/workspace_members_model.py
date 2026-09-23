import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class WorkspaceMember(UUIDMixin, TimestampMixin, table=True):
    """Membership join table linking a User to a Workspace with a role and status."""

    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "user_id",
            name="uq_workspace_members_workspace_id_user_id",
        ),
    )

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    role: str = Field(default="MEMBER")
    status: str = Field(default="PENDING")
    invited_by: uuid.UUID | None = Field(default=None, foreign_key="users.id")
