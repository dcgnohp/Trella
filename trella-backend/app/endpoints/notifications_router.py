import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, SessionDep
from app.repositories.notifications_repository import DEFAULT_LIMIT, MAX_LIMIT
from app.schemas.notifications_schema import (
    NotificationPublic,
    UnreadCountPublic,
    decode_cursor,
)
from app.services.notifications_service import NotificationService

router = APIRouter(prefix="/me/notifications", tags=["notifications"])

_service = NotificationService()


@router.get("", response_model=list[NotificationPublic])
def list_notifications(
    session: SessionDep,
    current_user: CurrentUser,
    unread: bool = Query(default=False),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(default=None),
) -> list[NotificationPublic]:
    """List the current user's notifications, newest first."""
    notifications = _service.list(
        session,
        current_user.id,
        unread=unread,
        limit=limit,
        cursor=decode_cursor(cursor),
    )
    return [
        NotificationPublic.model_validate(notification)
        for notification in notifications
    ]


@router.get("/unread-count", response_model=UnreadCountPublic)
def get_unread_count(
    session: SessionDep,
    current_user: CurrentUser,
) -> UnreadCountPublic:
    """Return the current user's unread notification count."""
    count = _service.unread_count(session, current_user.id)
    return UnreadCountPublic(unread_count=count)


@router.patch("/{notification_id}/read", response_model=NotificationPublic)
def mark_notification_read(
    session: SessionDep,
    notification_id: uuid.UUID,
    current_user: CurrentUser,
) -> NotificationPublic:
    """Mark a single notification as read. Raises HTTP 404 if not found or owned by another user."""
    notification = _service.mark_read(session, notification_id, current_user.id)
    return NotificationPublic.model_validate(notification)


@router.post("/read-all", status_code=status.HTTP_200_OK)
def mark_all_notifications_read(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, bool]:
    """Mark every unread notification of the current user as read."""
    _service.mark_all_read(session, current_user.id)
    return {"success": True}
