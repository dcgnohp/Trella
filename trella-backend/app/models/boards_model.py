"""boards model layer.

SQLModel table model for the ``boards`` domain.

A ``Board`` is a Kanban workspace owned by an ``Organization``. Every board is
isolated by its ``org_id`` (org-scoping, requirement 4.x) and carries optional
Unsplash-style cover image metadata.

The physical table is named ``boards`` EXPLICITLY via ``__tablename__`` to match
the design (Alembic ``0002_domain_tables.py``) and the foreign keys that
reference ``boards.id`` (lists.board_id).

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model.

The foreign key cascades on delete so removing an ``Organization`` removes its
boards (and, transitively, their lists and cards) — design.md ER diagram
``Organization -> Board -> List -> Card``:

- ``org_id`` -> ``organizations.id`` (ON DELETE CASCADE)

See requirements 5.1, 5.7, 4.3 and design.md section "Data Models".
"""

import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Board(UUIDMixin, TimestampMixin, table=True):
    """``boards`` table: a Kanban board owned by an organization.

    Columns map to snake_case (``org_id``, ``image_thumb_url``, ...). The
    response schema (``BoardPublic``) serializes these to camelCase. The
    ``image_*`` fields are optional cover-image metadata and may all be ``None``.
    """

    __tablename__ = "boards"

    org_id: uuid.UUID = Field(foreign_key="organizations.id", ondelete="CASCADE")
    title: str = Field(max_length=255)
    image_id: str | None = Field(default=None)
    image_thumb_url: str | None = Field(default=None)
    image_full_url: str | None = Field(default=None)
    image_user_name: str | None = Field(default=None)
    image_link_html: str | None = Field(default=None)
