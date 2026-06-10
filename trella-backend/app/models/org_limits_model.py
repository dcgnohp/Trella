"""org_limits model layer.

SQLModel table model for the ``org_limits`` domain.

Stores the free-tier board usage count for an Organization. The ``count`` column
tracks how many Boards an Organization currently owns; ``OrgLimitService``
compares it against ``settings.MAX_FREE_BOARDS`` (and ``is_pro``) to decide
whether another Board may be created (design.md section "8. OrgLimit &
OrgSubscription", requirements 9.2-9.6).

An ``OrgLimit`` row is created (with ``count = 0``) when an Organization is
created (requirement 3.6 / 9.2). The physical table is named ``org_limits``
EXPLICITLY via ``__tablename__`` to match the Alembic
``0001_foundational_tables.py`` migration and the foreign key referencing
``organizations.id``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py``. The ``org_id``
foreign key cascades on delete so removing an ``Organization`` removes its limit
row.

See requirements 9.2, 9.3, 9.4, 9.5, 9.6 and design.md section "8. OrgLimit &
OrgSubscription" + the ER diagram.
"""

import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class OrgLimit(UUIDMixin, TimestampMixin, table=True):
    """``org_limits`` table: free-tier board usage count for an Organization.

    ``count`` defaults to 0 and is incremented when a Board is created and
    decremented when a Board is deleted, always inside the caller's transaction.
    """

    __tablename__ = "org_limits"

    org_id: uuid.UUID = Field(foreign_key="organizations.id", ondelete="CASCADE")
    count: int = Field(default=0)
