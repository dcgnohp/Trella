import uuid

from sqlmodel import Session, select

from app.models.org_limits_model import OrgLimit


class OrgLimitsRepository:
    def create(self, session: Session, limit: OrgLimit) -> OrgLimit:
        session.add(limit)
        session.flush()
        return limit

    def get_by_org(self, session: Session, org_id: uuid.UUID) -> OrgLimit | None:
        """Return the limit row for the given org, or None if absent."""
        statement = select(OrgLimit).where(OrgLimit.org_id == org_id)
        return session.exec(statement).first()

    def save(self, session: Session, limit: OrgLimit) -> OrgLimit:
        session.add(limit)
        return limit
