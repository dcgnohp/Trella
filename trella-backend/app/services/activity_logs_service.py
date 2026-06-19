import logging
import uuid
from typing import Any

from sqlmodel import Session

from app.core.rbac import Action, RBACService
from app.models.activity_logs_model import ActivityLog
from app.models.enums import ActivityAction
from app.models.users_model import User
from app.repositories.activity_logs_repository import (
    DEFAULT_LIMIT,
    ActivityLogsRepository,
    Cursor,
)

logger = logging.getLogger(__name__)


class ActivityLogsService:
    def __init__(
        self,
        repo: ActivityLogsRepository | None = None,
        rbac_service: RBACService | None = None,
    ) -> None:
        self.repo = repo or ActivityLogsRepository()
        self.rbac_service = rbac_service or RBACService()

    def record(
        self,
        session: Session,
        *,
        workspace_id: uuid.UUID,
        project_id: uuid.UUID,
        task_id: uuid.UUID | None = None,
        actor: User,
        action: ActivityAction | str,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
    ) -> ActivityLog:
        """Stage an ActivityLog in the caller's transaction without committing."""
        action_value = action.value if isinstance(action, ActivityAction) else action
        activity_log = ActivityLog(
            workspace_id=workspace_id,
            project_id=project_id,
            task_id=task_id,
            actor_id=actor.id,
            action=action_value,
            old_value=old_value,
            new_value=new_value,
        )
        return self.repo.create(session, activity_log)

    def record_best_effort(
        self,
        session: Session,
        *,
        workspace_id: uuid.UUID,
        project_id: uuid.UUID,
        task_id: uuid.UUID | None = None,
        actor: User,
        action: ActivityAction | str,
        old_value: dict[str, Any] | None = None,
        new_value: dict[str, Any] | None = None,
    ) -> ActivityLog | None:
        """Stage and commit an ActivityLog; swallow all failures so the caller is never affected."""
        action_value = action.value if isinstance(action, ActivityAction) else action
        try:
            activity_log = ActivityLog(
                workspace_id=workspace_id,
                project_id=project_id,
                task_id=task_id,
                actor_id=actor.id,
                action=action_value,
                old_value=old_value,
                new_value=new_value,
            )
            self.repo.create(session, activity_log)
            session.commit()
            session.refresh(activity_log)
            return activity_log
        except Exception:  # noqa: BLE001 — best-effort: swallow every failure.
            session.rollback()
            logger.warning(
                "Best-effort activity log failed (action=%s, project_id=%s, "
                "task_id=%s); the originating operation is unaffected.",
                action_value,
                project_id,
                task_id,
                exc_info=True,
            )
            return None

    def list_for_task(
        self,
        session: Session,
        task_id: uuid.UUID,
        current_user: User,
        *,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
        project_id: uuid.UUID | None = None,
    ) -> list[ActivityLog]:
        """Return a task's activity timeline newest-first; raise HTTP 403 if RBAC fails."""
        if project_id is not None:
            self.rbac_service.check(
                session,
                Action.VIEW_PROJECT_RESOURCE,
                user=current_user,
                project_id=project_id,
            )
        return self.repo.list_for_task(session, task_id, limit=limit, cursor=cursor)

    def list_for_project(
        self,
        session: Session,
        project_id: uuid.UUID,
        current_user: User,
        *,
        limit: int = DEFAULT_LIMIT,
        cursor: Cursor | None = None,
    ) -> list[ActivityLog]:
        """Return a project's activity timeline newest-first; raise HTTP 403 if RBAC fails."""
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=current_user,
            project_id=project_id,
        )
        return self.repo.list_for_project(
            session, project_id, limit=limit, cursor=cursor
        )
