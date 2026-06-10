"""org_limits repository layer.

Repository (DB access) for the ``org_limits`` domain.

This is the ONLY place that issues SQLModel queries for the ``OrgLimit`` model.
Per the design (``design.md`` -> "Repository interface"), every method receives
the ``Session`` from the caller (the service) so the repository participates in
the service-owned transaction. The repository never commits — the service
decides when to ``commit()`` / ``rollback()``.

See requirements 9.2, 9.3, 9.4, 9.5, 9.6 and design.md section "8. OrgLimit &
OrgSubscription".
"""

import uuid

from sqlmodel import Session, select

from app.models.org_limits_model import OrgLimit


class OrgLimitsRepository:
    """DB access for the ``org_limits`` table.

    All methods take an explicit ``session`` and avoid committing so callers can
    compose several operations inside one transaction.
    """

    def create(self, session: Session, limit: OrgLimit) -> OrgLimit:
        """Stage a new ``OrgLimit`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing.
        """
        session.add(limit)
        session.flush()
        return limit

    def get_by_org(self, session: Session, org_id: uuid.UUID) -> OrgLimit | None:
        """Return the limit row for the given org, or ``None`` if absent."""
        statement = select(OrgLimit).where(OrgLimit.org_id == org_id)
        return session.exec(statement).first()

    def save(self, session: Session, limit: OrgLimit) -> OrgLimit:
        """Stage an updated ``OrgLimit`` (e.g. after changing ``count``).

        Adds the instance back to the session so the change is persisted on the
        next flush/commit. Does NOT commit — the caller owns the transaction.
        """
        session.add(limit)
        return limit
