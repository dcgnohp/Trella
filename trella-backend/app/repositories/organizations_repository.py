import uuid
from collections.abc import Sequence

from sqlmodel import Session, select

from app.models.organizations_model import Organization


class OrganizationsRepository:
    def create(self, session: Session, org: Organization) -> Organization:
        session.add(org)
        session.flush()
        return org

    def get(self, session: Session, org_id: uuid.UUID) -> Organization | None:
        """Return the organization with the given id, or None if absent."""
        return session.get(Organization, org_id)

    def list_by_ids(
        self, session: Session, ids: Sequence[uuid.UUID]
    ) -> list[Organization]:
        if not ids:
            return []
        statement = select(Organization).where(Organization.id.in_(ids))  # type: ignore[attr-defined]
        return list(session.exec(statement).all())

    def delete(self, session: Session, org: Organization) -> None:
        session.delete(org)
        session.flush()
