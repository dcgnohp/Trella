"""organizations repository layer.

Repository (DB access) for the ``organizations`` domain.

This is the ONLY place that issues SQLModel queries for the ``Organization``
model. Per the design (``design.md`` → "Repository interface"), every method
receives the ``Session`` from the caller (the service) so the repository
participates in the service-owned transaction. The repository never commits —
the service decides when to ``commit()`` / ``rollback()``.

See requirements 3.2, 3.5.
"""

import uuid
from collections.abc import Sequence

from sqlmodel import Session, select

from app.models.organizations_model import Organization


class OrganizationsRepository:
    """DB access for the ``organizations`` table.

    All methods take an explicit ``session`` and avoid committing so callers can
    compose several operations inside one transaction.
    """

    def create(self, session: Session, org: Organization) -> Organization:
        """Stage a new ``Organization`` for insertion.

        Adds the instance to the session and flushes so the database-generated
        state (e.g. the primary key) is populated, but does NOT commit — the
        service owns the transaction and is responsible for committing.
        """
        session.add(org)
        session.flush()
        return org

    def get(self, session: Session, org_id: uuid.UUID) -> Organization | None:
        """Return the organization with the given id, or ``None`` if absent."""
        return session.get(Organization, org_id)

    def list_by_ids(
        self, session: Session, ids: Sequence[uuid.UUID]
    ) -> list[Organization]:
        """Return all organizations whose id is in ``ids``.

        Returns an empty list when ``ids`` is empty (no query issued), which is
        used by the service to resolve a user's organizations from their
        membership rows.
        """
        if not ids:
            return []
        statement = select(Organization).where(Organization.id.in_(ids))  # type: ignore[attr-defined]
        return list(session.exec(statement).all())
