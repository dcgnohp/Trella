"""task_cards model layer.

SQLModel table model for the ``task_cards`` domain.

A ``Card`` is a task card belonging to a ``List`` (a Kanban column). Each card
carries an integer ``order`` used to sort cards top-to-bottom within its list,
and an optional free-text ``description`` (requirement 7.x).

CRITICAL NAMING: the Python domain/file is ``task_cards`` (to avoid clashing
with a generic ``card`` concept and to read clearly), but the PHYSICAL table is
named ``cards`` EXPLICITLY via ``__tablename__`` to match the design (Alembic
``0002_domain_tables.py``), the foreign keys that reference ``cards.id``, and
the public HTTP contract (``/api/v1/cards``). The frontend-facing domain type is
still ``Card``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model.

The foreign key cascades on delete so removing a ``List`` removes its cards —
design.md ER diagram ``Organization -> Board -> List -> Card``:

- ``list_id`` -> ``lists.id`` (ON DELETE CASCADE)

Note: the ``List`` model lives in ``app/models/board_lists_model.py`` with an
explicit ``__tablename__ = "lists"``, so the FK target string is ``lists.id``.

See requirements 7.1, 7.7 and design.md section "Data Models".
"""

import uuid

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Card(UUIDMixin, TimestampMixin, table=True):
    """``cards`` table: a task card belonging to a list.

    Columns map to snake_case (``list_id``, ``order``). The response schema
    (``CardPublic``) serializes these to camelCase (``listId``). ``order`` is an
    integer sort key managed by the service (new cards get ``max_order + 1``).
    ``description`` is an optional longer free-text field stored as ``TEXT``.
    """

    __tablename__ = "cards"

    list_id: uuid.UUID = Field(foreign_key="lists.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, sa_type=Text)
    order: int = Field()
