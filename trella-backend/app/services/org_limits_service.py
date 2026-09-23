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
        """Return True if the org may create another Board."""
        limit = self.repo.get_by_org(session, org_id)
        count = limit.count if limit is not None else 0
        if count < settings.MAX_FREE_BOARDS:
            return True
        return self.subscription_service.is_pro(org_id)

    def increment_available_count(self, session: Session, org_id: uuid.UUID) -> None:
        """Increase the org's board count by one; does not commit."""
        limit = self.repo.get_by_org(session, org_id)
        if limit is None:
            self.repo.create(session, OrgLimit(org_id=org_id, count=1))
            return
        limit.count += 1
        self.repo.save(session, limit)

    def decrement_available_count(self, session: Session, org_id: uuid.UUID) -> None:
        """Decrease the org's board count by one (never below zero); does not commit."""
        limit = self.repo.get_by_org(session, org_id)
        if limit is None:
            return
        limit.count = max(0, limit.count - 1)
        self.repo.save(session, limit)
