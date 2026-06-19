import uuid
from datetime import datetime

from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin


class OrgSubscription(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "org_subscriptions"

    org_id: uuid.UUID = Field(foreign_key="workspaces.id", ondelete="CASCADE")
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    stripe_price_id: str | None = None
    stripe_current_period_end: datetime | None = None
