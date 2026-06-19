import uuid
from datetime import datetime

from sqlalchemy import and_, or_
from sqlmodel import Session, col, select

from app.models.activity_logs_model import ActivityLog

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

# A cursor is the ``(created_at, id)`` of the last row of the previous page.
Cursor = tuple[datetime, uuid.UUID]


def _clamp_limit(limit: int) -> int:
    """Clamp a requested page size into the allowed [1, MAX_LIMIT] range."""
    if limit < 1:
        return 1
    if limit > MAX_LIMIT:
        return MAX_LIMIT
    return limit


class ActivityLogsRepository:
    """DB access for the append-only activity_logs table. No update/delete methods."""

    def create(self, session: Session, log: ActivityLog) -> ActivityLog:
        """Stage a new ActivityLog for insertion without committing."""
        session.add(log)
        session.flush()
        return log

    def list_for_task(
        self,
        session: Session,
        task_id: uuid.UUID,
        *,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[ActivityLog]:
        """Return a single Task's activity timeline, newest first."""
        statement = select(ActivityLog).where(ActivityLog.task_id == task_id)
        statement = self._apply_keyset(statement, cursor)
        statement = statement.order_by(
            ActivityLog.created_at.desc(),  # type: ignore[attr-defined]
            ActivityLog.id.desc(),  # type: ignore[attr-defined]
        ).limit(_clamp_limit(limit))
        return list(session.exec(statement).all())

    def list_for_project(
        self,
        session: Session,
        project_id: uuid.UUID,
        *,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[ActivityLog]:
        """Return a whole Project's activity timeline, newest first."""
        statement = select(ActivityLog).where(ActivityLog.project_id == project_id)
        statement = self._apply_keyset(statement, cursor)
        statement = statement.order_by(
            ActivityLog.created_at.desc(),  # type: ignore[attr-defined]
            ActivityLog.id.desc(),  # type: ignore[attr-defined]
        ).limit(_clamp_limit(limit))
        return list(session.exec(statement).all())

    @staticmethod
    def _apply_keyset(statement, cursor: Cursor | None):  # type: ignore[no-untyped-def]
        """Apply (created_at, id) DESC keyset predicate; returns statement unchanged when cursor is None."""
        if cursor is None:
            return statement
        cursor_created_at, cursor_id = cursor
        return statement.where(
            or_(
                col(ActivityLog.created_at) < cursor_created_at,
                and_(
                    col(ActivityLog.created_at) == cursor_created_at,
                    col(ActivityLog.id) < cursor_id,
                ),
            )
        )
