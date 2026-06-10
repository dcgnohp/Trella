"""org_subscriptions schema layer.

Pydantic request/response schemas for the ``org_subscriptions`` domain.

- ``OrgSubscriptionPublic``: API response shape. Extends ``CamelModel`` so
  fields serialize to camelCase (``orgId``, ``stripeCustomerId``,
  ``stripeSubscriptionId``, ``stripePriceId``, ``stripeCurrentPeriodEnd``,
  ``createdAt``, ``updatedAt``). Kept minimal — in Phase 1 the Stripe fields are
  always empty (billing not yet integrated).

See requirements 10.1, 10.2 and design.md section "2. Serialization camelCase".
"""

import uuid
from datetime import datetime

from app.core.base import CamelModel


class OrgSubscriptionPublic(CamelModel):
    """API response for an organization subscription.

    Serializes to camelCase: ``orgId``, ``stripeCustomerId``,
    ``stripeSubscriptionId``, ``stripePriceId``, ``stripeCurrentPeriodEnd``,
    ``createdAt``, ``updatedAt``.
    """

    id: uuid.UUID
    org_id: uuid.UUID
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    stripe_price_id: str | None = None
    stripe_current_period_end: datetime | None = None
    created_at: datetime
    updated_at: datetime
