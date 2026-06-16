"""audit_logs repository layer.

Repository (DB access) for the ``audit_logs`` domain.

This is the ONLY place that issues SQLModel queries for the ``AuditLog`` model.
Per the design (``design.md`` -> "7. Audit Log do Service tạo"), every method
receives the ``Session`` from the caller (the service) so the repository
participates in the service-owned transaction. The repository never commits —
the service decides when to ``commit()`` / ``rollback()`` (requirement 8.2 /
11), which guarantees an audit row is only persisted alongside its originating
operation.

Read methods cover the three query scopes from requirement 8.3/8.4/8.5:
- ``list_by_org``: an Organization's log, paginated, newest first.
- ``list_by_entities``: logs for a set of entity ids (a Board plus its Lists and
  Cards), newest first.
- ``list_by_card``: logs for a single Card, newest first.

See requirements 8.1, 8.6.
"""

import uuid
from collections.abc import Sequence

from sqlmodel import Session, select

from app.models.audit_logs_model import AuditLog


class AuditLogsRepository:
    """DB access for the ``audit_logs`` table.

    All methods take an explicit ``session`` and avoid committing so callers can
    compose several operations inside one transaction.
    """

    def create(self, session: Session, audit_log: AuditLog) -> AuditLog:
        """Stage a new ``AuditLog`` for insertion.

        Adds the instance to the session and flushes so database-generated state
        (e.g. the primary key) is populated, but does NOT commit — the service
        owns the transaction and is responsible for committing. This is what
        keeps the audit row inside the originating operation's transaction
        (requirement 8.2): if the service rolls back, the audit row is discarded.
        """
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
        """Return an organization's audit log, newest first, paginated.

        Ordered by ``created_at`` descending (requirement 8.3). ``skip`` /
        ``limit`` provide offset pagination.
        """
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
        """Return audit logs for any of ``entity_ids``, newest first.

        Used to fetch the logs for a Board plus its Lists and Cards
        (requirement 8.4). Returns an empty list when ``entity_ids`` is empty (no
        query issued).
        """
        if not entity_ids:
            return []
        statement = (
            select(AuditLog)
            .where(AuditLog.entity_id.in_(entity_ids))  # type: ignore[attr-defined]
            .order_by(AuditLog.created_at.desc())  # type: ignore[attr-defined]
        )
        return list(session.exec(statement).all())

    def list_by_card(
        self, session: Session, card_id: uuid.UUID
    ) -> list[AuditLog]:
        """Return audit logs for a single Card, newest first (requirement 8.5)."""
        statement = (
            select(AuditLog)
            .where(AuditLog.entity_id == card_id)
            .order_by(AuditLog.created_at.desc())  # type: ignore[attr-defined]
        )
        return list(session.exec(statement).all())
