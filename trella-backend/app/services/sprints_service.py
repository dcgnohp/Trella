import logging
import uuid
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlmodel import Session, select as sq_select

from app.core.rbac import Action, RBACService
from app.models.enums import SprintStatus
from app.models.sprints_model import Sprint
from app.models.tasks_model import Task
from app.models.users_model import User
from app.repositories.sprints_repository import SprintsRepository
from app.repositories.tasks_repository import TasksRepository
from app.services.activity_logs_service import ActivityLogsService

logger = logging.getLogger(__name__)


class SprintCreateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class SprintUpdateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class SprintsService:
    def __init__(
        self,
        repo: SprintsRepository | None = None,
        tasks_repo: TasksRepository | None = None,
        rbac_service: RBACService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
    ) -> None:
        self.repo = repo or SprintsRepository()
        self.tasks_repo = tasks_repo or TasksRepository()
        self.rbac_service = rbac_service or RBACService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()

    # ------------------------------------------------------------------ #
    # Internal helpers                                                   #
    # ------------------------------------------------------------------ #
    def _load(self, session: Session, sprint_id: uuid.UUID) -> Sprint:
        sprint = self.repo.get_by_id(session, sprint_id)
        if sprint is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sprint not found",
            )
        return sprint

    def _resolve_workspace_id(self, session: Session, project_id: uuid.UUID) -> uuid.UUID:
        from app.models.projects_model import Project

        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project.workspace_id

    @staticmethod
    def _push_sprint_event(sprint: Sprint, event: str) -> None:
        """Broadcast a project-scoped realtime event for ``sprint``. Best-effort."""
        try:
            from app.core.realtime import ws_manager

            ws_manager.push_to_project(
                sprint.project_id,
                event,
                {"sprint_id": str(sprint.id), "project_id": str(sprint.project_id)},
            )
        except Exception:  # noqa: BLE001
            logger.warning("realtime push failed for sprint %s", sprint.id, exc_info=True)

    # ------------------------------------------------------------------ #
    # CRUD                                                               #
    # ------------------------------------------------------------------ #
    def create_sprint(
        self,
        session: Session,
        project_id: uuid.UUID,
        data: SprintCreateData,
        user: User,
    ) -> Sprint:
        """Create a sprint for a project. Requires MANAGE_BOARD_COLUMN (PROJECT_ADMIN)."""
        workspace_id = self._resolve_workspace_id(session, project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=project_id,
        )
        fields = data.model_dump(exclude_unset=False)
        sprint = Sprint(
            project_id=project_id,
            name=fields.get("name", ""),
            goal=fields.get("goal"),
            status=SprintStatus.PLANNED.value,
            start_date=fields.get("start_date"),
            end_date=fields.get("end_date"),
        )
        try:
            sprint = self.repo.create(session, sprint)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                actor=user,
                action="SPRINT_CREATED",
                new_value={"sprint_id": str(sprint.id), "name": sprint.name},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(sprint)
        self._push_sprint_event(sprint, "sprint.created")
        return sprint

    def get_sprint(self, session: Session, sprint_id: uuid.UUID, user: User) -> Sprint:
        sprint = self._load(session, sprint_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=sprint.project_id,
        )
        return sprint

    def list_sprints(
        self, session: Session, project_id: uuid.UUID, user: User
    ) -> list[Sprint]:
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        return self.repo.get_by_project(session, project_id)

    def update_sprint(
        self,
        session: Session,
        sprint_id: uuid.UUID,
        data: SprintUpdateData,
        user: User,
    ) -> Sprint:
        sprint = self._load(session, sprint_id)
        workspace_id = self._resolve_workspace_id(session, sprint.project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=sprint.project_id,
        )
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(sprint, field, value)
        try:
            sprint = self.repo.update(session, sprint)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(sprint)
        return sprint

    def delete_sprint(
        self, session: Session, sprint_id: uuid.UUID, user: User
    ) -> None:
        sprint = self._load(session, sprint_id)
        workspace_id = self._resolve_workspace_id(session, sprint.project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=sprint.project_id,
        )
        # Detach tasks from sprint before deleting
        tasks = list(
            session.exec(sq_select(Task).where(Task.sprint_id == sprint_id)).all()
        )
        for task in tasks:
            task.sprint_id = None
            session.add(task)
        try:
            session.flush()
            self.repo.delete(session, sprint)
            session.commit()
        except Exception:
            session.rollback()
            raise

    # ------------------------------------------------------------------ #
    # Lifecycle                                                          #
    # ------------------------------------------------------------------ #
    def start_sprint(
        self, session: Session, sprint_id: uuid.UUID, user: User
    ) -> Sprint:
        """Set sprint status=ACTIVE. Validates only one active sprint per project."""
        sprint = self._load(session, sprint_id)
        workspace_id = self._resolve_workspace_id(session, sprint.project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=sprint.project_id,
        )
        if sprint.status == SprintStatus.ACTIVE.value:
            return sprint
        if sprint.status == SprintStatus.COMPLETED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a completed sprint",
            )
        existing_active = self.repo.get_active_sprint(session, sprint.project_id)
        if existing_active is not None and existing_active.id != sprint_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A sprint is already active for this project",
            )
        sprint.status = SprintStatus.ACTIVE.value
        try:
            sprint = self.repo.update(session, sprint)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=sprint.project_id,
                actor=user,
                action="SPRINT_STARTED",
                new_value={"sprint_id": str(sprint.id), "name": sprint.name},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(sprint)
        self._push_sprint_event(sprint, "sprint.started")
        return sprint

    def complete_sprint(
        self, session: Session, sprint_id: uuid.UUID, user: User
    ) -> Sprint:
        """Set sprint status=COMPLETED; move incomplete tasks to backlog (sprint_id=NULL)."""
        sprint = self._load(session, sprint_id)
        workspace_id = self._resolve_workspace_id(session, sprint.project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=sprint.project_id,
        )
        if sprint.status == SprintStatus.COMPLETED.value:
            return sprint
        if sprint.status == SprintStatus.PLANNED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot complete a sprint that has not been started",
            )
        # Move incomplete tasks (not DONE status) to backlog
        from app.models.custom_statuses_model import CustomStatus
        from app.models.enums import CanonicalStatus

        incomplete_tasks = list(
            session.exec(sq_select(Task).where(Task.sprint_id == sprint_id)).all()
        )
        for task in incomplete_tasks:
            # Check if task is done via custom_status canonical_status
            is_done = False
            if task.custom_status_id is not None:
                cs = session.get(CustomStatus, task.custom_status_id)
                if cs and cs.canonical_status == CanonicalStatus.DONE.value:
                    is_done = True
            if not is_done:
                task.sprint_id = None
                session.add(task)

        sprint.status = SprintStatus.COMPLETED.value
        try:
            session.flush()
            sprint = self.repo.update(session, sprint)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=sprint.project_id,
                actor=user,
                action="SPRINT_COMPLETED",
                new_value={"sprint_id": str(sprint.id), "name": sprint.name},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(sprint)
        self._push_sprint_event(sprint, "sprint.completed")
        return sprint

    # ------------------------------------------------------------------ #
    # Task assignment                                                    #
    # ------------------------------------------------------------------ #
    def add_task_to_sprint(
        self,
        session: Session,
        sprint_id: uuid.UUID,
        task_id: uuid.UUID,
        user: User,
    ) -> Task:
        sprint = self._load(session, sprint_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=sprint.project_id,
        )
        task = self.tasks_repo.get(session, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        if task.project_id != sprint.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task does not belong to the same project as the sprint",
            )
        task.sprint_id = sprint_id
        try:
            task = self.tasks_repo.update(session, task)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)
        return task

    def remove_task_from_sprint(
        self,
        session: Session,
        sprint_id: uuid.UUID,
        task_id: uuid.UUID,
        user: User,
    ) -> None:
        sprint = self._load(session, sprint_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=sprint.project_id,
        )
        task = self.tasks_repo.get(session, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        if task.sprint_id != sprint_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task is not assigned to this sprint",
            )
        task.sprint_id = None
        try:
            task = self.tasks_repo.update(session, task)
            session.commit()
        except Exception:
            session.rollback()
            raise
