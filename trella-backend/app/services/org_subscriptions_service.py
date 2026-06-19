import uuid


class OrgSubscriptionService:
    """Business logic for organization subscriptions (Phase 1 stub)."""

    def is_pro(self, org_id: uuid.UUID) -> bool:
        """Always returns False; Stripe integration is deferred to a later phase."""
        return False
