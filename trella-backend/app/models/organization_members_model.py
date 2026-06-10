"""organization_members model layer.

SQLModel table model for the ``organization_members`` domain.

Maps a ``User`` to an ``Organization`` with a role, forming the membership join
table used for org-scoping (requirement 4.x) and ownership bootstrapping when an
Organization is created (requirement 3.2). The physical table is named
``organization_members`` EXPLICITLY via ``__tablename__``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model.

Foreign keys cascade on delete so removing a ``User`` or an ``Organization``
removes the membership rows (design.md ER diagram + Alembic
``0001_foundational_tables.py``):

- ``user_id`` -> ``users.id`` (ON DELETE CASCADE)
- ``org_id`` -> ``organizations.id`` (ON DELETE CASCADE)

See requirements 3.2, 4.1, 4.2, 4.4 and design.md section "Data Models".
"""

import uuid

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class OrganizationMember(UUIDMixin, TimestampMixin, table=True):
    """``organization_members`` table: a user's membership in an organization.

    ``role`` is one of ``OWNER`` | ``ADMIN`` | ``MEMBER`` and defaults to
    ``MEMBER``. The org creator is added as ``OWNER`` (see
    ``OrganizationMemberService.add_owner``).
    """

    __tablename__ = "organization_members"

    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    org_id: uuid.UUID = Field(foreign_key="organizations.id", ondelete="CASCADE")
    role: str = Field(default="MEMBER")  # OWNER | ADMIN | MEMBER
