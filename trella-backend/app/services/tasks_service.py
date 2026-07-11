import logging
import uuid
from datetime import timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session

from app.core.deps import resolve_scope
from app.core.rbac import Action, RBACService
from app.models.enums import ActivityAction, NotificationType, UserAccountStatus
from app.models.tasks_model import Task
from app.models.users_model import User
from app.repositories.board_columns_repository import BoardColumnsRepository
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.repositories.project_members_repository import ProjectMembersRepository
from app.repositories.tasks_repository import TasksRepository
from app.repositories.velocity_config_repository import VelocityConfigRepository
from app.schemas.tasks_schema import TaskUpdate
from app.services.activity_logs_service import ActivityLogsService
from app.services.notifications_service import NotificationService

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = frozenset(
    {
        "title",
        "description",
        "priority",
        "due_date",
        "custom_status_id",
        "column_id",
        # Jira-mode fields
        "type",
        "story_point",
        "sprint_id",
        "epic_id",
        # assignee_id and parent_id are intentionally EXCLUDED:
        # assignee_id must go through set_assignee (membership + ASSIGN_TASK checks).
        # parent_id must go through set_parent (scope + cycle checks).
    }
)


class TasksService:
    def __init__(
        self,
        repo: TasksRepository | None = None,
        custom_statuses_repo: CustomStatusesRepository | None = None,
        project_members_repo: ProjectMembersRepository | None = None,
        rbac_service: RBACService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
        notification_service: NotificationService | None = None,
        velocity_config_repo: VelocityConfigRepository | None = None,
    ) -> None:
        self.repo = repo or TasksRepository()
        self.custom_statuses_repo = custom_statuses_repo or CustomStatusesRepository()
        self.project_members_repo = project_members_repo or ProjectMembersRepository()
        self.rbac_service = rbac_service or RBACService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()
        self.notification_service = notification_service or NotificationService()
        self.velocity_config_repo = velocity_config_repo or VelocityConfigRepository()
        self.board_columns_repo = BoardColumnsRepository()

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

    def _compute_due_date_from_story_point(
        self,
        session: Session,
        workspace_id: uuid.UUID,
        task: Task,
        story_point: int,
        *,
        base_override=None,
    ) -> None:
        """Set task.due_date based on story_point * hours_per_point / 8 days from base.

        base_override: explicit datetime to use as the start anchor (pass utcnow() on
        the update path so existing tasks don't get a due_date in the past).
        Defaults to task.created_at for new tasks (create path).
        """
        config = self.velocity_config_repo.get_by_workspace(session, workspace_id)
        hours_per_point = config.hours_per_point if config is not None else 4.0
        days = story_point * hours_per_point / 8.0
        from app.core.base import utcnow

        if base_override is not None:
            base = base_override
        else:
            base = task.created_at if task.created_at else utcnow()
        task.due_date = base + timedelta(days=days)

    # ------------------------------------------------------------------ #
    # update_task                                                        #
    # ------------------------------------------------------------------ #
    def update_task(
        self,
        session: Session,
        task_id: uuid.UUID,
        data: TaskUpdate,
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

        # Dispatch special fields to their guarded methods.
        # These are excluded from _UPDATABLE_FIELDS to prevent bypassing checks.
        if "assignee_id" in updates:
            assignee_id_value = updates.pop("assignee_id")
            if assignee_id_value is None:
                self.unset_assignee(session, task_id, user)
            else:
                self.set_assignee(session, task_id, assignee_id_value, user)
            # Re-load task after delegation so later code sees the updated state
            task = self._load(session, task_id)

        if "parent_id" in updates:
            parent_id_value = updates.pop("parent_id")
            self.set_parent(session, task_id, parent_id_value, user)
            task = self._load(session, task_id)

        if not updates:
            return task

        transition_comment = updates.pop("transition_comment", None)

        old_custom_status_id = task.custom_status_id
        old_priority = task.priority
        old_due_date = task.due_date

        # If custom_status_id changes, validate workflow transition rules first
        if (
            "custom_status_id" in updates
            and updates["custom_status_id"] != old_custom_status_id
        ):
            from app.services.workflows_service import WorkflowsService

            wf_service = WorkflowsService()
            wf_service.validate_and_process_transition(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                task=task,
                from_status_id=old_custom_status_id,
                to_status_id=updates["custom_status_id"],
                user=user,
                comment=transition_comment,
            )

        # When custom_status_id changes, find the matching board column and resolve column_id first.
        if (
            "custom_status_id" in updates
            and updates["custom_status_id"] is not None
            and "column_id" not in updates
        ):
            new_status = self.custom_statuses_repo.get(
                session, updates["custom_status_id"]
            )
            if new_status and task.board_id:
                columns = self.board_columns_repo.list_by_board(session, task.board_id)
                # 1. Match by name (case-insensitive)
                match = next(
                    (c for c in columns if c.name.lower() == new_status.name.lower()),
                    None,
                )
                if not match and new_status.canonical_status:
                    # 2. Fall back to matching by canonical_status
                    canonical = new_status.canonical_status.upper()
                    match = next(
                        (c for c in columns if c.status_key.upper() == canonical), None
                    )
                if match and task.column_id != match.id:
                    updates["column_id"] = match.id

        for field, value in updates.items():
            if field in _UPDATABLE_FIELDS:
                setattr(task, field, value)

        # Auto-calculate due_date when story_point is set and due_date not explicitly provided.
        if (
            "story_point" in updates
            and updates["story_point"] is not None
            and "due_date" not in updates
        ):
            from app.core.base import utcnow as _utcnow

            self._compute_due_date_from_story_point(
                session,
                workspace_id,
                task,
                updates["story_point"],
                base_override=_utcnow(),
            )

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
        from app.repositories.workspace_members_repository import (
            WorkspaceMembersRepository,
        )

        workspace_members_repo = WorkspaceMembersRepository()
        ws_member = workspace_members_repo.get_active(
            session, workspace_id, assignee_id
        )
        if ws_member is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee must be an active member of the workspace/organization",
            )

        # Check project membership; auto-add if not active
        pm_member = self.project_members_repo.get_active(
            session, project_id, assignee_id
        )
        if pm_member is None:
            existing_pm = self.project_members_repo.get(
                session, project_id, assignee_id
            )
            from app.models.enums import MemberStatus, ProjectRole
            from app.models.project_members_model import ProjectMember

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
                    ),
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
                    ),
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
        """Unassign a Task (set assignee_id to None). Requires ASSIGN_TASK."""
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

    def update_story_point(
        self,
        session: Session,
        task_id: uuid.UUID,
        story_point: int,
        user: User,
    ) -> Task:
        """Set story_point on a task and auto-calculate due_date. Requires MANAGE_TASK."""
        task = self._load(session, task_id)
        project_id, workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session, Action.MANAGE_TASK, user=user, project_id=project_id
        )
        task.story_point = story_point
        from app.core.base import utcnow as _utcnow

        self._compute_due_date_from_story_point(
            session, workspace_id, task, story_point, base_override=_utcnow()
        )
        try:
            task = self.repo.update(session, task)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)
        return task

    def list_backlog(
        self, session: Session, project_id: uuid.UUID, user: User
    ) -> list[Task]:
        """Return tasks with sprint_id IS NULL for a project. Requires VIEW_PROJECT_RESOURCE."""
        self.rbac_service.check(
            session, Action.VIEW_PROJECT_RESOURCE, user=user, project_id=project_id
        )
        return self.repo.list_backlog(session, project_id)

    def list_subtasks(
        self, session: Session, task_id: uuid.UUID, user: User
    ) -> list[Task]:
        """Return direct subtasks of a task. Requires VIEW_PROJECT_RESOURCE."""
        task = self._load(session, task_id)
        project_id, _workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session, Action.VIEW_PROJECT_RESOURCE, user=user, project_id=project_id
        )
        return self.repo.list_subtasks(session, task_id)

    def get_task(
        self,
        session: Session,
        task_id: uuid.UUID,
        user: User,
    ) -> Task:
        """Fetch a Task by id. Requires VIEW_PROJECT_RESOURCE."""
        task = self._load(session, task_id)
        project_id, _workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session, Action.VIEW_PROJECT_RESOURCE, user=user, project_id=project_id
        )
        return task

    def set_parent(
        self,
        session: Session,
        task_id: uuid.UUID,
        parent_id: uuid.UUID | None,
        user: User,
    ) -> Task:
        """Set or clear a task's parent. Requires MANAGE_TASK.
        Validates: same project, not self, no ancestor cycle."""
        task = self._load(session, task_id)
        project_id, workspace_id = self._resolve_scope(session, task)
        self.rbac_service.check(
            session, Action.MANAGE_TASK, user=user, project_id=project_id
        )
        if parent_id is not None:
            if parent_id == task_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A task cannot be its own parent",
                )
            parent = self.repo.get(session, parent_id)
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent task not found",
                )
            if parent.project_id != project_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Parent task must belong to the same project",
                )
            # Cycle check: walk up the parent chain — task_id must not appear
            cursor_id: uuid.UUID | None = parent.parent_id
            while cursor_id is not None:
                if cursor_id == task_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Setting this parent would create a cycle",
                    )
                cursor = self.repo.get(session, cursor_id)
                cursor_id = cursor.parent_id if cursor else None

        task.parent_id = parent_id
        try:
            task = self.repo.update(session, task)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)
        self._push_task_event(task, "task.updated")
        return task
