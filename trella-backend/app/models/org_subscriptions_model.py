"""org_subscriptions model layer.

SQLModel table model for the ``org_subscriptions`` domain.

Stores the Stripe billing state for an Organization. In Phase 1 the Stripe
integration is NOT wired up yet, so every Stripe column is nullable and remains
empty — an ``OrgSubscription`` row is still created (empty) when an Organization
is created (requirement 10.4). Actual Stripe synchronization is a later phase.

The physical table is named ``org_subscriptions`` EXPLICITLY via
``__tablename__`` to match the design (Alembic ``0001_foundational_tables.py``)
and the foreign key that references ``organizations.id``.

Reuses ``UUIDMixin`` (uuid4 primary key) and ``TimestampMixin`` (timezone-aware
``created_at`` / ``updated_at``) from ``app/core/base.py`` to stay consistent
with every other domain model. The ``org_id`` foreign key cascades on delete so
removing an ``Organization`` removes its subscription row.

See requirements 10.1, 10.2, 10.4 and design.md section "8. OrgLimit &
OrgSubscription" + the ER diagram.
"""

import uuid
from datetime import datetime

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class OrgSubscription(UUIDMixin, TimestampMixin, table=True):
    """``org_subscriptions`` table: Stripe billing state for an Organization.

    All ``stripe_*`` columns are nullable; in Phase 1 they stay empty because
    billing is not yet integrated. ``OrgSubscriptionService.is_pro`` always
    returns ``False`` without reading this row (Phase 1 stub).
    """

    __tablename__ = "org_subscriptions"

    org_id: uuid.UUID = Field(foreign_key="organizations.id", ondelete="CASCADE")
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    stripe_price_id: str | None = None
    stripe_current_period_end: datetime | None = None
