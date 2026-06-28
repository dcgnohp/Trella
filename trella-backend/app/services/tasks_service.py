import logging
import uuid
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.deps import resolve_scope
from app.core.rbac import Action, RBACService
from app.models.enums import ActivityAction, NotificationType, UserAccountStatus
from app.models.tasks_model import Task
from app.models.users_model import User
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.repositories.project_members_repository import ProjectMembersRepository
from app.repositories.tasks_repository import TasksRepository
from app.services.activity_logs_service import ActivityLogsService
from app.services.notifications_service import NotificationService

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = frozenset(
    {"title", "description", "priority", "due_date", "custom_status_id", "column_id"}
)


class TaskUpdateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class TasksService:
    def __init__(
        self,
        repo: TasksRepository | None = None,
        custom_statuses_repo: CustomStatusesRepository | None = None,
        project_members_repo: ProjectMembersRepository | None = None,
        rbac_service: RBACService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
        notification_service: NotificationService | None = None,
    ) -> None:
        self.repo = repo or TasksRepository()
        self.custom_statuses_repo = custom_statuses_repo or CustomStatusesRepository()
        self.project_members_repo = project_members_repo or ProjectMembersRepository()
        self.rbac_service = rbac_service or RBACService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()
        self.notification_service = notification_service or NotificationService()

    # ------------------------------------------------------------------ #
    # Internal helpers                                                   #
    # ------------------------------------------------------------------ #
    def _load(self, session: Session, task_id: uuid.UUID) -> Task:
        """Fetch a Task by id or raise HTTP 404 when absent."""
        task = self.repo.get(session, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return task

    def _resolve_scope(
        self, session: Session, task: Task
    ) -> tuple[uuid.UUID, uuid.UUID]:
        """Resolve (project_id, workspace_id) or raise HTTP 404."""
        scope = resolve_scope(session, task)
        if scope.project_id is None or scope.workspace_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return scope.project_id, scope.workspace_id

    def _status_snapshot(
        self, session: Session, custom_status_id: uuid.UUID | None
    ) -> dict[str, Any]:
        """Build a {custom_status_id, status_name, canonical_status} snapshot for activity logs."""
        if custom_status_id is None:
            return {
                "custom_status_id": None,
                "status_name": None,
                "canonical_status": None,
            }
        custom_status = self.custom_statuses_repo.get(session, custom_status_id)
        return {
            "custom_status_id": str(custom_status_id),
            "status_name": custom_status.name if custom_status else None,
            "canonical_status": (
                custom_status.canonical_status if custom_status else None
            ),
        }

    def _emit_best_effort(
        self,
        session: Session,
        *,
        recipient_id: uuid.UUID,
        notification_type: NotificationType,
        title: str,
        task: Task,
    ) -> None:
        """Emit a notification after commit; swallow all errors so a notification failure never rolls back the task change."""
        try:
            self.notification_service.emit(
                session,
                recipient_id=recipient_id,
                type=notification_type,
                title=title,
                metadata={
                    "task_id": str(task.id),
                    "project_id": str(task.project_id),
                },
            )
            session.commit()
        except Exception:  # noqa: BLE001 — best-effort: never fail the caller.
            session.rollback()
            logger.warning(
                "Best-effort %s notification failed for task %s; the task "
                "change is unaffected.",
                notification_type.value,
                task.id,
                exc_info=True,
            )

    def _is_notifiable_recipient(
        self, session: Session, recipient_id: uuid.UUID | None, actor: User
    ) -> bool:
        """Return True if recipient exists, is not the actor, and is not REMOVED."""
        if recipient_id is None or recipient_id == actor.id:
            return False
        recipient = session.get(User, recipient_id)
        if recipient is None:
            return False
        return recipient.status != UserAccountStatus.REMOVED.value

    @staticmethod
    def _push_task_event(task: Task, event: str) -> None:
        """Broadcast a project-scoped realtime event for ``task``. Best-effort."""
        try:
            from app.core.realtime import ws_manager

            ws_manager.push_to_project(
                task.project_id,
                event,
                {"task_id": str(task.id), "board_id": str(task.board_id)},
            )
        except Exception:  # noqa: BLE001 — never fail the caller on a push.
            logger.warning("realtime push failed for task %s", task.id, exc_info=True)

    # ------------------------------------------------------------------ #
    # update_task                                                        #
    # ------------------------------------------------------------------ #
    def update_task(
        self,
        session: Session,
        task_id: uuid.UUID,
        data: TaskUpdateData,
        user: User,
    ) -> Task:
        """Apply a partial update to a Task. Requires MANAGE_TASK."""
        task = self._load(session, task_id)
        project_id, workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=project_id,
        )

        updates = data.model_dump(exclude_unset=True)

        old_custom_status_id = task.custom_status_id
        old_priority = task.priority
        old_due_date = task.due_date

        for field, value in updates.items():
            if field in _UPDATABLE_FIELDS:
                setattr(task, field, value)

        status_changed = task.custom_status_id != old_custom_status_id
        priority_changed = "priority" in updates and task.priority != old_priority
        due_date_changed = "due_date" in updates and task.due_date != old_due_date

        try:
            task = self.repo.update(session, task)
            if status_changed:
                self.activity_logs_service.record(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    task_id=task.id,
                    actor=user,
                    action=ActivityAction.TASK_STATUS_CHANGED,
                    old_value=self._status_snapshot(session, old_custom_status_id),
                    new_value=self._status_snapshot(session, task.custom_status_id),
                )
            if priority_changed:
                self.activity_logs_service.record(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    task_id=task.id,
                    actor=user,
                    action=ActivityAction.TASK_PRIORITY_CHANGED,
                    old_value={"priority": old_priority},
                    new_value={"priority": task.priority},
                )
            if due_date_changed:
                self.activity_logs_service.record(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    task_id=task.id,
                    actor=user,
                    action=ActivityAction.TASK_DUE_DATE_CHANGED,
                    old_value={
                        "due_date": old_due_date.isoformat() if old_due_date else None
                    },
                    new_value={
                        "due_date": task.due_date.isoformat() if task.due_date else None
                    },
                )
            if "title" in updates or "description" in updates:
                self.activity_logs_service.record(
                    session,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    task_id=task.id,
                    actor=user,
                    action=ActivityAction.TASK_UPDATED,
                    new_value={
                        k: updates[k] for k in ("title", "description") if k in updates
                    },
                )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)

        if (status_changed or priority_changed or due_date_changed) and (
            self._is_notifiable_recipient(session, task.assignee_id, user)
        ):
            assert task.assignee_id is not None  # narrowed by the guard above
            self._emit_best_effort(
                session,
                recipient_id=task.assignee_id,
                notification_type=NotificationType.ASSIGNED_TASK_UPDATED,
                title="A task assigned to you was updated",
                task=task,
            )
        self._push_task_event(task, "task.updated")
        return task

    # ------------------------------------------------------------------ #
    # set_assignee / unset_assignee                                      #
    # ------------------------------------------------------------------ #
    def set_assignee(
        self,
        session: Session,
        task_id: uuid.UUID,
        assignee_id: uuid.UUID,
        user: User,
    ) -> Task:
        """Assign a Task to a user. Requires ASSIGN_TASK. Assignee must be an active project member."""
        task = self._load(session, task_id)
        project_id, workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session,
            Action.ASSIGN_TASK,
            user=user,
            project_id=project_id,
        )

        # Check workspace membership
        from app.repositories.workspace_members_repository import WorkspaceMembersRepository
        workspace_members_repo = WorkspaceMembersRepository()
        ws_member = workspace_members_repo.get_active(session, workspace_id, assignee_id)
        if ws_member is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must be an active member of the workspace/organization",
            )

        # Check project membership; auto-add if not active
        pm_member = self.project_members_repo.get_active(session, project_id, assignee_id)
        if pm_member is None:
            existing_pm = self.project_members_repo.get(session, project_id, assignee_id)
            from app.models.project_members_model import ProjectMember
            from app.models.enums import ProjectRole, MemberStatus
            if existing_pm is not None:
                existing_pm.project_role = ProjectRole.PROJECT_MEMBER.value
                existing_pm.status = MemberStatus.ACTIVE.value
                self.project_members_repo.update(session, existing_pm)
            else:
                self.project_members_repo.create(
                    session,
                    ProjectMember(
                        project_id=project_id,
                        user_id=assignee_id,
                        project_role=ProjectRole.PROJECT_MEMBER.value,
                        status=MemberStatus.ACTIVE.value,
                    )
                )

        # Check board membership; auto-add if not active
        from app.repositories.board_members_repository import BoardMembersRepository
        board_members_repo = BoardMembersRepository()
        bm_member = board_members_repo.get_active(session, task.board_id, assignee_id)
        if bm_member is None:
            existing_bm = board_members_repo.get(session, task.board_id, assignee_id)
            from app.models.board_members_model import BoardMember
            from app.models.enums import BoardRole, MemberStatus
            if existing_bm is not None:
                existing_bm.role = BoardRole.BOARD_MEMBER.value
                existing_bm.status = MemberStatus.ACTIVE.value
                board_members_repo.update(session, existing_bm)
            else:
                board_members_repo.create(
                    session,
                    BoardMember(
                        board_id=task.board_id,
                        user_id=assignee_id,
                        role=BoardRole.BOARD_MEMBER.value,
                        status=MemberStatus.ACTIVE.value,
                        invited_by=user.id,
                    )
                )

        old_assignee_id = task.assignee_id
        if old_assignee_id == assignee_id:
            return task

        task.assignee_id = assignee_id
        try:
            task = self.repo.update(session, task)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                task_id=task.id,
                actor=user,
                action=ActivityAction.TASK_ASSIGNED,
                old_value={
                    "assignee_id": (str(old_assignee_id) if old_assignee_id else None)
                },
                new_value={"assignee_id": str(assignee_id)},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)

        if assignee_id != user.id:
            self._emit_best_effort(
                session,
                recipient_id=assignee_id,
                notification_type=NotificationType.TASK_ASSIGNED,
                title="You have been assigned a task",
                task=task,
            )
        self._push_task_event(task, "task.updated")
        return task

    def unset_assignee(
        self,
        session: Session,
        task_id: uuid.UUID,
        user: User,
    ) -> Task:
        """Clear a Task's assignee. Requires ASSIGN_TASK."""
        task = self._load(session, task_id)
        project_id, workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session,
            Action.ASSIGN_TASK,
            user=user,
            project_id=project_id,
        )

        old_assignee_id = task.assignee_id
        if old_assignee_id is None:
            return task

        task.assignee_id = None
        try:
            task = self.repo.update(session, task)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                task_id=task.id,
                actor=user,
                action=ActivityAction.TASK_UNASSIGNED,
                old_value={"assignee_id": str(old_assignee_id)},
                new_value={"assignee_id": None},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)

        if self._is_notifiable_recipient(session, old_assignee_id, user):
            self._emit_best_effort(
                session,
                recipient_id=old_assignee_id,
                notification_type=NotificationType.TASK_UNASSIGNED,
                title="You have been unassigned from a task",
                task=task,
            )
        self._push_task_event(task, "task.updated")
        return task
