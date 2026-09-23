import uuid
from enum import Enum

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class AuditAction(str, Enum):
    """The kind of mutation an audit row records.

    Mirrors the successful Create/Update/Delete operations on Board/List/Card.
    """

    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class EntityType(str, Enum):
    """The kind of entity an audit row refers to."""

    BOARD = "BOARD"
    LIST = "LIST"
    CARD = "CARD"


class AuditLog(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "audit_logs"

    org_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    action: str = Field()  # AuditAction value: CREATE | UPDATE | DELETE
    entity_type: str = Field()  # EntityType value: BOARD | LIST | CARD
    entity_id: uuid.UUID = Field()
    entity_title: str = Field()
    user_name: str = Field()
    user_image: str | None = None
