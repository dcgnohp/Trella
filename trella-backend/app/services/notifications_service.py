import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.notification_delivery import InAppDelivery
from app.models.enums import NotificationType
from app.models.notifications_model import Notification
from app.repositories.notifications_repository import (
    DEFAULT_LIMIT,
    Cursor,
    NotificationsRepository,
)


class NotificationService:
    def __init__(
        self,
        delivery: InAppDelivery | None = None,
        repo: NotificationsRepository | None = None,
    ) -> None:
        self.delivery = delivery or InAppDelivery()
        self.repo = repo or NotificationsRepository()

    def emit(
        self,
        session: Session,
        *,
        recipient_id: uuid.UUID,
        type: NotificationType,
        title: str,
        content: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Notification:
        notification = Notification(
            user_id=recipient_id,
            type=type.value,
            title=title,
            content=content,
            notif_metadata=metadata,
        )
        notification = self.repo.create(session, notification)
        self.delivery.deliver(notification)
        return notification

    def list(
        self,
        session: Session,
        user_id: uuid.UUID,
        *,
        unread: bool = False,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[Notification]:
        return self.repo.list_for_user(
            session, user_id, unread=unread, limit=limit, cursor=cursor
        )

    def unread_count(self, session: Session, user_id: uuid.UUID) -> int:
        return self.repo.unread_count(session, user_id)

    def mark_read(
        self,
        session: Session,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> Notification:
        """Raise HTTP 404 if notification does not exist or belongs to a different user."""
        notification = self.repo.get(session, notification_id)
        if notification is None or notification.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notification not found",
            )
        notification = self.repo.mark_read(session, notification)
        session.commit()
        session.refresh(notification)
        return notification

    def mark_all_read(self, session: Session, user_id: uuid.UUID) -> None:
        self.repo.mark_all_read(session, user_id)
        session.commit()
