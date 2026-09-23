import uuid

from sqlmodel import Session, col, desc, select

from app.models.ai_action_audit_model import AiActionAudit


class AiActionAuditRepository:
    def create(self, session: Session, audit: AiActionAudit) -> AiActionAudit:
        session.add(audit)
        session.flush()
        return audit

    def list_by_workspace(
        self, session: Session, workspace_id: uuid.UUID, limit: int = 100
    ) -> list[AiActionAudit]:
        statement = (
            select(AiActionAudit)
            .where(AiActionAudit.workspace_id == workspace_id)
            .order_by(desc(col(AiActionAudit.created_at)))
            .limit(limit)
        )
        return list(session.exec(statement).all())
