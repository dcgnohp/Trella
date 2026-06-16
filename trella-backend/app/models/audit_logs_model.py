"""audit_logs model layer.

SQLModel table model (and enums) for the ``audit_logs`` domain.

An ``AuditLog`` records every successful Create/Update/Delete performed on a
Board, List, or Card within an Organization (requirement 8.1). Rows are written
by the relevant Board/List/Card service inside the SAME session/transaction as
the originating operation, so an audit row is only persisted if the originating
operation commits (requirement 8.2 / 11). The repository is the only place that
issues queries for this model.

The physical table is named ``audit_logs`` EXPLICITLY via ``__tablename__`` to
match the design (Alembic ``0002_domain_tables.py``) and the foreign keys that
reference ``organizations.id`` and ``users.id``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model. The ``org_id`` foreign key cascades on delete so
removing an ``Organization`` removes its audit rows.

See requirements 8.1, 8.6 and design.md section "7. Audit Log do Service tạo" +
the ER diagram (``AUDIT_LOGS``).
"""

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
    """``audit_logs`` table: an immutable record of a C/U/D on a domain entity.

    ``action`` / ``entity_type`` are stored as plain strings (the
    ``AuditAction`` / ``EntityType`` enum values) so the column stays a simple
    ``VARCHAR`` while callers pass the enums. ``entity_id`` / ``entity_title``
    capture which entity changed; ``user_id`` / ``user_name`` / ``user_image``
    capture who made the change (``user_image`` is nullable).
    """

    __tablename__ = "audit_logs"

    org_id: uuid.UUID = Field(foreign_key="organizations.id", ondelete="CASCADE")
    user_id: uuid.UUID = Field(foreign_key="users.id")
    action: str = Field()  # AuditAction value: CREATE | UPDATE | DELETE
    entity_type: str = Field()  # EntityType value: BOARD | LIST | CARD
    entity_id: uuid.UUID = Field()
    entity_title: str = Field()
    user_name: str = Field()
    user_image: str | None = None
