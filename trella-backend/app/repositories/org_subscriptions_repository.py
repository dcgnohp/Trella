import uuid

from sqlmodel import Session, select

from app.models.org_subscriptions_model import OrgSubscription


class OrgSubscriptionsRepository:
    def create(self, session: Session, sub: OrgSubscription) -> OrgSubscription:
        session.add(sub)
        session.flush()
        return sub

    def get(self, session: Session, sub_id: uuid.UUID) -> OrgSubscription | None:
        """Return the subscription with the given id, or ``None`` if absent."""
        return session.get(OrgSubscription, sub_id)

    def get_by_org(self, session: Session, org_id: uuid.UUID) -> OrgSubscription | None:
        """Return the subscription for the given org, or ``None`` if absent."""
        statement = select(OrgSubscription).where(OrgSubscription.org_id == org_id)
        return session.exec(statement).first()
