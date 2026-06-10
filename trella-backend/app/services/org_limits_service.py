"""org_limits service layer.

Service (business logic) for the ``org_limits`` domain.

Enforces the free-tier board cap. ``has_available_count`` returns ``True`` when
an Organization may create another Board — either because its current ``count``
is still below ``settings.MAX_FREE_BOARDS`` OR because the org is on a paid
(pro) plan (``OrgSubscriptionService.is_pro``, a Phase 1 stub that always returns
``False``).

The mutation helpers (``increment_available_count`` /
``decrement_available_count``) accept the caller's ``session`` and DO NOT commit
— the calling service (e.g. ``BoardService.create_board``) owns the transaction
so the limit change commits atomically with the board create/delete and its
audit log (design.md sections 7 & 8, requirement 11 / 9.4 / 9.5).

See requirements 9.2, 9.3, 9.4, 9.5, 9.6 and design.md section "8. OrgLimit &
OrgSubscription".
"""

import uuid

from sqlmodel import Session

from app.core.config import settings
from app.models.org_limits_model import OrgLimit
from app.repositories.org_limits_repository import OrgLimitsRepository
from app.services.org_subscriptions_service import OrgSubscriptionService


class OrgLimitService:
    """Business logic for organization free-tier board limits."""

    def __init__(
        self,
        repo: OrgLimitsRepository | None = None,
        subscription_service: OrgSubscriptionService | None = None,
    ) -> None:
        self.repo = repo or OrgLimitsRepository()
        self.subscription_service = subscription_service or OrgSubscriptionService()

    def has_available_count(self, session: Session, org_id: uuid.UUID) -> bool:
        """Return whether the org may create another Board.

        ``True`` when the current ``count`` is below ``MAX_FREE_BOARDS`` OR the
        org is on a paid plan. When no ``OrgLimit`` row exists yet the count is
        treated as 0 (so a fresh org is always allowed).
        """
        limit = self.repo.get_by_org(session, org_id)
        count = limit.count if limit is not None else 0
        if count < settings.MAX_FREE_BOARDS:
            return True
        return self.subscription_service.is_pro(org_id)

    def increment_available_count(self, session: Session, org_id: uuid.UUID) -> None:
        """Increase the org's board count by one.

        Stages the change on the caller's ``session`` WITHOUT committing — the
        caller owns the transaction. If no ``OrgLimit`` row exists yet (an org is
        expected to get one at creation, but be defensive) one is created with
        ``count = 1``.
        """
        limit = self.repo.get_by_org(session, org_id)
        if limit is None:
            self.repo.create(session, OrgLimit(org_id=org_id, count=1))
            return
        limit.count += 1
        self.repo.save(session, limit)

    def decrement_available_count(self, session: Session, org_id: uuid.UUID) -> None:
        """Decrease the org's board count by one (never below zero).

        Stages the change on the caller's ``session`` WITHOUT committing — the
        caller owns the transaction. A missing ``OrgLimit`` row is a no-op since
        the count is already effectively 0.
        """
        limit = self.repo.get_by_org(session, org_id)
        if limit is None:
            return
        limit.count = max(0, limit.count - 1)
        self.repo.save(session, limit)
