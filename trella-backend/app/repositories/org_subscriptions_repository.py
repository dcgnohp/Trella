"""org_subscriptions repository layer.

Repository (DB access) for the ``org_subscriptions`` domain.

This is the ONLY place that issues SQLModel queries for the ``OrgSubscription``
model. Per the design (``design.md`` -> "Repository interface"), every method
receives the ``Session`` from the caller (the service) so the repository
participates in the service-owned transaction. The repository never commits —
the service decides when to ``commit()`` / ``rollback()``.

See requirements 10.1, 10.4 and design.md section "8. OrgLimit &
OrgSubscription".
"""

import uuid

from sqlmodel import Session, select

from app.models.org_subscriptions_model import OrgSubscription


class OrgSubscriptionsRepository:
    """DB access for the ``org_subscriptions`` table.

    All methods take an explicit ``session`` and avoid committing so callers can
    compose several operations inside one transaction.
    """

    def create(self, session: Session, sub: OrgSubscription) -> OrgSubscription:
        """Stage a new ``OrgSubscription`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing.
        """
        session.add(sub)
        session.flush()
        return sub

    def get(self, session: Session, sub_id: uuid.UUID) -> OrgSubscription | None:
        """Return the subscription with the given id, or ``None`` if absent."""
        return session.get(OrgSubscription, sub_id)

    def get_by_org(
        self, session: Session, org_id: uuid.UUID
    ) -> OrgSubscription | None:
        """Return the subscription for the given org, or ``None`` if absent."""
        statement = select(OrgSubscription).where(OrgSubscription.org_id == org_id)
        return session.exec(statement).first()
