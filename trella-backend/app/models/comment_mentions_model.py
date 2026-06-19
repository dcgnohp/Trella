import uuid

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class CommentMention(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "comment_mentions"
    __table_args__ = (
        UniqueConstraint(
            "comment_id",
            "mentioned_user_id",
            name="uq_comment_mentions_comment_id_user_id",
        ),
    )

    comment_id: uuid.UUID = Field(foreign_key="comments.id", ondelete="CASCADE")
    mentioned_user_id: uuid.UUID = Field(foreign_key="users.id")
