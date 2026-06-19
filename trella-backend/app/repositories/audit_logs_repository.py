import uuid
from collections.abc import Sequence

from sqlmodel import Session, select

from app.models.audit_logs_model import AuditLog


class AuditLogsRepository:
    def create(self, session: Session, audit_log: AuditLog) -> AuditLog:
        session.add(audit_log)
        session.flush()
        return audit_log

    def list_by_org(
        self,
        session: Session,
        org_id: uuid.UUID,
        *,
        skip: int = 0,
        limit: int = 100,
    ) -> list[AuditLog]:
        """Return an organization's audit log, newest first, paginated."""
        statement = (
            select(AuditLog)
            .where(AuditLog.org_id == org_id)
            .order_by(AuditLog.created_at.desc())  # type: ignore[attr-defined]
            .offset(skip)
            .limit(limit)
        )
        return list(session.exec(statement).all())

    def list_by_entities(
        self, session: Session, entity_ids: Sequence[uuid.UUID]
    ) -> list[AuditLog]:
        """Return audit logs for any of ``entity_ids``, newest first. Returns empty list when ``entity_ids`` is empty."""
        if not entity_ids:
            return []
        statement = (
            select(AuditLog)
            .where(AuditLog.entity_id.in_(entity_ids))  # type: ignore[attr-defined]
            .order_by(AuditLog.created_at.desc())  # type: ignore[attr-defined]
        )
        return list(session.exec(statement).all())

    def list_by_card(self, session: Session, card_id: uuid.UUID) -> list[AuditLog]:
        """Return audit logs for a single Card, newest first."""
        statement = (
            select(AuditLog)
            .where(AuditLog.entity_id == card_id)
            .order_by(AuditLog.created_at.desc())  # type: ignore[attr-defined]
        )
        return list(session.exec(statement).all())
