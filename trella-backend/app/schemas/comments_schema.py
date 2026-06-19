import uuid
from datetime import datetime

from app.core.base import CamelModel
from app.schemas.shared import AuthorPublic

__all__ = [
    "CommentCreate",
    "CommentUpdate",
    "AuthorPublic",
    "CommentPublic",
]


class CommentCreate(CamelModel):
    content: str


class CommentUpdate(CamelModel):
    content: str


class CommentPublic(CamelModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    content: str
    created_at: datetime
    updated_at: datetime
    author: AuthorPublic
