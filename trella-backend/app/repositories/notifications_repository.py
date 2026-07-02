import uuid
from datetime import datetime

from sqlalchemy import and_, or_, update
from sqlmodel import Session, col, func, select

from app.core.pagination import clamp_limit
from app.models.notifications_model import Notification

DEFAULT_LIMIT = 20
MAX_LIMIT = 100

# A cursor is the ``(created_at, id)`` of the last row of the previous page.
Cursor = tuple[datetime, uuid.UUID]


class NotificationsRepository:
    """DB access for the notifications table. Never commits — callers own the transaction."""

    def create(self, session: Session, notification: Notification) -> Notification:
        session.add(notification)
        session.flush()
        return notification

    def get(self, session: Session, notification_id: uuid.UUID) -> Notification | None:
        return session.get(Notification, notification_id)

    def list_for_user(
        self,
        session: Session,
        user_id: uuid.UUID,
        *,
        unread: bool = False,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[Notification]:
        """Return a recipient's notifications, newest first."""
        statement = select(Notification).where(Notification.user_id == user_id)
        if unread:
            statement = statement.where(col(Notification.is_read).is_(False))
        statement = self._apply_keyset(statement, cursor)
        statement = statement.order_by(
            Notification.created_at.desc(),  # type: ignore[attr-defined]
            Notification.id.desc(),  # type: ignore[attr-defined]
        ).limit(clamp_limit(limit, MAX_LIMIT))
        return list(session.exec(statement).all())

    def unread_count(self, session: Session, user_id: uuid.UUID) -> int:
        """Return the number of unread notifications for user_id."""
        statement = (
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id)
            .where(col(Notification.is_read).is_(False))
        )
        return session.exec(statement).one()

    def mark_read(self, session: Session, notification: Notification) -> Notification:
        """Mark a single notification as read. Idempotent — is_read only moves False -> True."""
        notification.is_read = True
        session.add(notification)
        session.flush()
        return notification

    def mark_all_read(self, session: Session, user_id: uuid.UUID) -> None:
        """Bulk-set is_read=True for all unread notifications of user_id."""
        statement = (
            update(Notification)
            .where(col(Notification.user_id) == user_id)
            .where(col(Notification.is_read).is_(False))
            .values(is_read=True)
            .execution_options(synchronize_session="fetch")
        )
        session.execute(statement)
        session.flush()

    @staticmethod
    def _apply_keyset(statement, cursor: Cursor | None):  # type: ignore[no-untyped-def]
        """Apply (created_at, id) DESC keyset predicate. Returns statement unchanged for first page."""
        if cursor is None:
            return statement
        cursor_created_at, cursor_id = cursor
        return statement.where(
            or_(
                col(Notification.created_at) < cursor_created_at,
                and_(
                    col(Notification.created_at) == cursor_created_at,
                    col(Notification.id) < cursor_id,
                ),
            )
        )
