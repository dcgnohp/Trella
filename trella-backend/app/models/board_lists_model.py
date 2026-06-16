"""board_lists model layer.

SQLModel table model for the ``board_lists`` domain.

A ``List`` is a Kanban column belonging to a ``Board``. Each list carries an
integer ``order`` used to sort columns left-to-right within its board
(requirement 6.x). Cards belong to a list and are ordered independently.

CRITICAL NAMING: the Python domain/file is ``board_lists`` (to avoid clashing
with the built-in ``list`` / ``typing.List`` concept and to read clearly), but
the PHYSICAL table is named ``lists`` EXPLICITLY via ``__tablename__`` to match
the design (Alembic ``0002_domain_tables.py``), the foreign keys that reference
``lists.id`` (cards.list_id), and the public HTTP contract (``/api/v1/lists``).
The frontend-facing domain type is still ``List``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model.

The foreign key cascades on delete so removing a ``Board`` removes its lists
(and, transitively, their cards) — design.md ER diagram
``Organization -> Board -> List -> Card``:

- ``board_id`` -> ``boards.id`` (ON DELETE CASCADE)

See requirements 6.1, 6.7 and design.md section "Data Models".
"""

import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class List(UUIDMixin, TimestampMixin, table=True):
    """``lists`` table: a Kanban column belonging to a board.

    Columns map to snake_case (``board_id``, ``order``). The response schema
    (``ListPublic``) serializes these to camelCase (``boardId``). ``order`` is an
    integer sort key managed by the service (new lists get ``max_order + 1``).

    The class is named ``List`` (the frontend domain type), so this module
    deliberately avoids importing ``typing.List``; use built-in ``list[...]``
    generics elsewhere instead.
    """

    __tablename__ = "lists"

    board_id: uuid.UUID = Field(foreign_key="boards.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    order: int = Field()
