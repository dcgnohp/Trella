import uuid

from sqlmodel import Session, col, select

from app.models.attachments_model import Attachment


class AttachmentsRepository:
    def create(self, session: Session, attachment: Attachment) -> Attachment:
        session.add(attachment)
        session.flush()
        return attachment

    def get(self, session: Session, attachment_id: uuid.UUID) -> Attachment | None:
        return session.get(Attachment, attachment_id)

    def list_by_task(self, session: Session, task_id: uuid.UUID) -> list[Attachment]:
        """Return a Task's attachments, newest first."""
        statement = (
            select(Attachment)
            .where(Attachment.task_id == task_id)
            .order_by(col(Attachment.created_at).desc(), col(Attachment.id).desc())
        )
        return list(session.exec(statement).all())

    def delete(self, session: Session, attachment: Attachment) -> None:
        session.delete(attachment)
        session.flush()
