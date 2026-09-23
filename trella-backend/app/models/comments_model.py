import uuid

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Comment(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "comments"

    task_id: uuid.UUID = Field(foreign_key="tasks.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    content: str = Field(sa_type=Text)
