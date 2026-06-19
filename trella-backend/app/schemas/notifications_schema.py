import base64
import binascii
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from pydantic import Field

from app.core.base import CamelModel
from app.repositories.notifications_repository import Cursor


class NotificationPublic(CamelModel):
    id: uuid.UUID
    type: str
    title: str
    content: str | None = None
    # Validation alias must be ``notif_metadata`` (not ``metadata``) so
    # from_attributes reads the model column rather than SQLAlchemy's MetaData
    # registry; serialization_alias pins the public JSON key to ``metadata``.
    notif_metadata: dict[str, Any] | None = Field(
        default=None,
        validation_alias="notif_metadata",
        serialization_alias="metadata",
    )
    is_read: bool
    created_at: datetime


class UnreadCountPublic(CamelModel):
    unread_count: int


def encode_cursor(notification: NotificationPublic) -> str:
    """Encode a notification's (created_at, id) into an opaque URL-safe base64 cursor token."""
    raw = f"{notification.created_at.isoformat()}|{notification.id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str | None) -> Cursor | None:
    """Decode a cursor token back to (created_at, id). Returns None for first page. Raises HTTP 400 on invalid token."""
    if cursor is None:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        created_at_str, id_str = raw.split("|", 1)
        return datetime.fromisoformat(created_at_str), uuid.UUID(id_str)
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
        )
