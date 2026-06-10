"""organizations model layer.

SQLModel table model for the ``organizations`` domain.

The table is named ``organizations`` EXPLICITLY via ``__tablename__`` to match
the design (Alembic ``0001_foundational_tables.py``) and the foreign keys that
reference ``organizations.id`` (organization_members, boards, org_limits,
org_subscriptions, audit_logs).

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model.

See requirements 3.2, 3.5 and design.md section "Data Models".
"""

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class Organization(UUIDMixin, TimestampMixin, table=True):
    """``organizations`` table: a tenant that owns boards and members.

    Columns map to snake_case. Every org-scoped resource (Board, List, Card,
    Audit Log) ultimately references this table's ``id`` for isolation.
    """

    __tablename__ = "organizations"

    name: str = Field(max_length=255)
