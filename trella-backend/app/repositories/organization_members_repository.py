"""organization_members repository layer.

Repository (DB access) for the ``organization_members`` domain.

This is the ONLY place that issues SQLModel queries for the
``OrganizationMember`` model. Per the design (``design.md`` → "Repository
interface"), every method receives the ``Session`` from the caller (the
service) so the repository participates in the service-owned transaction. The
repository never commits — the service decides when to ``commit()`` /
``rollback()``.

See requirements 3.2, 4.1, 4.2, 4.4.
"""

import uuid

from sqlmodel import Session, select

from app.models.organization_members_model import OrganizationMember


class OrganizationMembersRepository:
    """DB access for the ``organization_members`` table.

    All methods take an explicit ``session`` and avoid committing so callers can
    compose several operations inside one transaction.
    """

    def create(
        self, session: Session, member: OrganizationMember
    ) -> OrganizationMember:
        """Stage a new ``OrganizationMember`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing.
        """
        session.add(member)
        session.flush()
        return member

    def list_by_user(
        self, session: Session, user_id: uuid.UUID
    ) -> list[OrganizationMember]:
        """Return all memberships belonging to the given user."""
        statement = select(OrganizationMember).where(
            OrganizationMember.user_id == user_id
        )
        return list(session.exec(statement).all())

    def get_by_user_and_org(
        self, session: Session, user_id: uuid.UUID, org_id: uuid.UUID
    ) -> OrganizationMember | None:
        """Return the membership for ``(user_id, org_id)`` or ``None``."""
        statement = select(OrganizationMember).where(
            OrganizationMember.user_id == user_id,
            OrganizationMember.org_id == org_id,
        )
        return session.exec(statement).first()
