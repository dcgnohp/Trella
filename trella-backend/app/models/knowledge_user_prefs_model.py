import uuid
from datetime import datetime

from sqlmodel import Field, UniqueConstraint

from app.core.base import TimestampMixin, UUIDMixin


class KnowledgeUserPref(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "knowledge_user_prefs"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", "doc_id"),)

    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    doc_id: uuid.UUID = Field(foreign_key="docs.id", ondelete="CASCADE")
    is_pinned: bool = Field(default=False)
    is_favorite: bool = Field(default=False)
    last_viewed_at: datetime | None = Field(default=None, nullable=True)
