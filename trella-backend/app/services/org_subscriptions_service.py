"""org_subscriptions service layer.

Service (business logic) for the ``org_subscriptions`` domain.

Phase 1 stub: Stripe billing is NOT integrated yet, so ``is_pro`` always returns
``False`` without touching the database. ``OrgLimitService`` consults
``is_pro`` when deciding ``has_available_count`` (design.md section 8); returning
``False`` here means every organization is treated as free tier in Phase 1.

Real Stripe synchronization (reading ``OrgSubscription`` to detect an active
paid plan / valid ``stripe_current_period_end``) is a later phase.

See requirements 10.1, 10.2, 10.4 and design.md section "8. OrgLimit &
OrgSubscription".
"""

import uuid


class OrgSubscriptionService:
    """Business logic for organization subscriptions (Phase 1 stub)."""

    def is_pro(self, org_id: uuid.UUID) -> bool:
        """Return whether the organization is on a paid (pro) plan.

        Phase 1 stub: ALWAYS returns ``False`` and does NOT read the database.
        Stripe integration — which would inspect the ``OrgSubscription`` row to
        determine an active paid plan — is deferred to a later phase.
        """
        return False
