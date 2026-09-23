import uuid

from sqlalchemy import Text, UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Project(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("workspace_id", "key", name="uq_projects_workspace_id_key"),
    )

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    name: str = Field(max_length=255)
    key: str = Field(max_length=20)
    description: str | None = Field(default=None, sa_type=Text)
    created_by: uuid.UUID = Field(foreign_key="users.id")
    task_counter: int = Field(default=0, nullable=False)
    workflow_id: uuid.UUID | None = Field(
        default=None,
        foreign_key="workflows.id",
        ondelete="SET NULL",
        nullable=True,
    )
