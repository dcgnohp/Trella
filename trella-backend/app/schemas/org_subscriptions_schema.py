import uuid
from datetime import datetime

from app.core.base import CamelModel


class OrgSubscriptionPublic(CamelModel):
    id: uuid.UUID
    org_id: uuid.UUID
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    stripe_price_id: str | None = None
    stripe_current_period_end: datetime | None = None
    created_at: datetime
    updated_at: datetime
