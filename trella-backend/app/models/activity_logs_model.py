import uuid
from typing import Any

from sqlalchemy import JSON, Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class ActivityLog(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "activity_logs"

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    project_id: uuid.UUID = Field(foreign_key="projects.id", ondelete="CASCADE")
    task_id: uuid.UUID | None = Field(
        default=None, foreign_key="tasks.id", ondelete="SET NULL"
    )
    actor_id: uuid.UUID = Field(foreign_key="users.id")
    action: str = Field()  # ActivityAction value, e.g. TASK_CREATED | COMMENT_UPDATED
    old_value: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB().with_variant(JSON(), "sqlite"), nullable=True),
    )
    new_value: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(JSONB().with_variant(JSON(), "sqlite"), nullable=True),
    )
