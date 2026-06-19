import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class BoardColumn(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "board_columns"  # type: ignore
    __table_args__ = {"extend_existing": True}

    board_id: uuid.UUID = Field(foreign_key="boards.id", ondelete="CASCADE")
    name: str = Field(max_length=255)
    status_key: str = Field(max_length=100)
    position: int = Field()
