import uuid

from sqlalchemy import Column, Integer, String
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class List(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "board_columns"  # type: ignore
    __table_args__ = {"extend_existing": True}

    board_id: uuid.UUID = Field(foreign_key="boards.id", ondelete="CASCADE")
    title: str = Field(sa_column=Column("name", String(255), nullable=False))
    order: int = Field(sa_column=Column("position", Integer, nullable=False))
    status_key: str = Field(default="", max_length=100)
