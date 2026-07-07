import uuid

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Plan(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "plans"

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, sa_type=Text)
    created_by: uuid.UUID = Field(foreign_key="users.id")
