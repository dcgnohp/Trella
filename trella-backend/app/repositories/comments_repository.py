import uuid
from datetime import datetime

from sqlalchemy import and_, or_
from sqlmodel import Session, col, select

from app.core.pagination import clamp_limit
from app.models.comments_model import Comment

DEFAULT_LIMIT = 20
MAX_LIMIT = 100

# A cursor is the ``(created_at, id)`` of the last row of the previous page.
Cursor = tuple[datetime, uuid.UUID]


class CommentsRepository:
    """DB access for the comments table. Never commits — callers own the transaction."""

    def create(self, session: Session, comment: Comment) -> Comment:
        session.add(comment)
        session.flush()
        return comment

    def get(self, session: Session, comment_id: uuid.UUID) -> Comment | None:
        return session.get(Comment, comment_id)

    def list_by_task(
        self,
        session: Session,
        task_id: uuid.UUID,
        *,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[Comment]:
        """Return a task's comments oldest-first with keyset pagination."""
        statement = select(Comment).where(Comment.task_id == task_id)
        statement = self._apply_keyset(statement, cursor)
        statement = statement.order_by(
            col(Comment.created_at).asc(),
            col(Comment.id).asc(),
        ).limit(clamp_limit(limit, MAX_LIMIT))
        return list(session.exec(statement).all())

    def update(self, session: Session, comment: Comment) -> Comment:
        session.add(comment)
        session.flush()
        return comment

    def delete(self, session: Session, comment: Comment) -> None:
        session.delete(comment)
        session.flush()

    @staticmethod
    def _apply_keyset(statement, cursor: Cursor | None):  # type: ignore[no-untyped-def]
        """Apply (created_at, id) ASC keyset predicate; returns statement unchanged when cursor is None."""
        if cursor is None:
            return statement
        cursor_created_at, cursor_id = cursor
        return statement.where(
            or_(
                col(Comment.created_at) > cursor_created_at,
                and_(
                    col(Comment.created_at) == cursor_created_at,
                    col(Comment.id) > cursor_id,
                ),
            )
        )
