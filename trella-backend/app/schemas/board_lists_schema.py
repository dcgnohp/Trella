import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class ListCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    board_id: uuid.UUID


class ListUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    order: int | None = None


class ListPublic(CamelModel):
    id: uuid.UUID
    title: str
    order: int
    board_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ListReorderItem(CamelModel):
    id: uuid.UUID
    order: int


class ListReorder(CamelModel):
    board_id: uuid.UUID
    items: list[ListReorderItem]
