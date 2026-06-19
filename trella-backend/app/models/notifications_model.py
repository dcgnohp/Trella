import uuid
from typing import Any

from sqlalchemy import JSON, Column, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Notification(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "notifications"

    user_id: uuid.UUID = Field(foreign_key="users.id")
    type: str = Field()
    title: str = Field(max_length=255)
    content: str | None = Field(default=None, sa_type=Text)
    # Python attr ``notif_metadata`` avoids SQLModel's reserved ``metadata`` attribute;
    # the physical DB column is named ``metadata``.
    notif_metadata: dict[str, Any] | None = Field(
        default=None,
        sa_column=Column(
            "metadata",
            JSONB().with_variant(JSON(), "sqlite"),
            nullable=True,
        ),
    )
    is_read: bool = Field(default=False)
