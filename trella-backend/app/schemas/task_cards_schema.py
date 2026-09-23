import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class CardCreate(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    list_id: uuid.UUID


class CardUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class CardPublic(CamelModel):
    id: uuid.UUID
    title: str
    order: int
    description: str | None
    list_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CardReorderItem(CamelModel):
    """A card reorder entry carries the target listId because a card can move across lists."""

    id: uuid.UUID
    order: int
    list_id: uuid.UUID


class CardReorder(CamelModel):
    items: list[CardReorderItem]
