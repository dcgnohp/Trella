import uuid

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class KnowledgeCollection(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "knowledge_collections"

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    name: str = Field(max_length=200)
    description: str | None = Field(default=None, sa_type=Text, nullable=True)
    icon: str | None = Field(default=None, max_length=50, nullable=True)
    color: str | None = Field(default=None, max_length=20, nullable=True)
    created_by: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    position: int = Field(default=0)
