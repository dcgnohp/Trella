import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class ColumnCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    status_key: str = Field(min_length=1, max_length=100)
    position: int | None = None


class ColumnUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status_key: str | None = Field(default=None, min_length=1, max_length=100)
    position: int | None = None


class ColumnPublic(CamelModel):
    id: uuid.UUID
    board_id: uuid.UUID
    name: str
    status_key: str
    position: int
    created_at: datetime
    updated_at: datetime


class ColumnReorderItem(CamelModel):
    id: uuid.UUID
    position: int


class ColumnReorder(CamelModel):
    items: list[ColumnReorderItem]
