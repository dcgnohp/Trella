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

    def _resolve_project(self, session: Session, project_id: uuid.UUID):
        from app.models.projects_model import Project

        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project

    def _resolve_workspace_id(self, session: Session, project_id: uuid.UUID) -> uuid.UUID:
        return self._resolve_project(session, project_id).workspace_id

    @staticmethod
    def _push_sprint_event(sprint: Sprint, event: str) -> None:
        try:
            from app.core.realtime import ws_manager

            ws_manager.push_to_project(
                sprint.project_id,
                event,
                {"sprint_id": str(sprint.id), "project_id": str(sprint.project_id)},
            )
        except Exception:  # noqa: BLE001
            logger.warning("realtime push failed for sprint %s", sprint.id, exc_info=True)

    def _is_task_done(self, session: Session, task: Task) -> bool:
        """Return True if the task's custom_status maps to DONE canonical status."""
        if task.custom_status_id is not None:
            from app.models.custom_statuses_model import CustomStatus
            from app.models.enums import CanonicalStatus

            cs = session.get(CustomStatus, task.custom_status_id)
            if cs and cs.canonical_status == CanonicalStatus.DONE.value:
                return True
        return False

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
        """Create a sprint for a project. Requires MANAGE_BOARD_COLUMN (PROJECT_ADMIN).
        Auto-names sprint as 'PROJECT_KEY Sprint N' when name is not provided."""
        project = self._resolve_project(session, project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=project_id,
        )
        fields = data.model_dump(exclude_unset=False)

        # Auto-name if name not provided
        sprint_name = fields.get("name")
        if not sprint_name:
            existing = self.repo.get_by_project(session, project_id)
            sprint_num = len(existing) + 1
            sprint_name = f"{project.key} Sprint {sprint_num}"

        sprint = Sprint(
            project_id=project_id,
            name=sprint_name,
            goal=fields.get("goal"),
            status=SprintStatus.PLANNED.value,
            start_date=fields.get("start_date"),
            end_date=fields.get("end_date"),
        )
        try:
            sprint = self.repo.create(session, sprint)
            self.activity_logs_service.record(
                session,
                workspace_id=project.workspace_id,
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

    def list_sprints_with_tasks(
        self, session: Session, project_id: uuid.UUID, user: User
    ) -> list[dict]:
        """Return sprints with their tasks and TODO/IN_PROGRESS/DONE counts."""
        from app.models.custom_statuses_model import CustomStatus
        from app.models.enums import CanonicalStatus
        from app.repositories.custom_statuses_repository import CustomStatusesRepository
        from app.repositories.projects_repository import ProjectsRepository

        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )

        project = self._resolve_project(session, project_id)
        sprints = self.repo.get_by_project(session, project_id)

        # Preload all custom statuses for this workspace to avoid N+1
        cs_repo = CustomStatusesRepository()
        all_cs = cs_repo.list_by_workspace(session, project.workspace_id)
        cs_map = {cs.id: cs for cs in all_cs}

        def _canonical(task: Task) -> str | None:
            if task.custom_status_id and task.custom_status_id in cs_map:
                return cs_map[task.custom_status_id].canonical_status
            return None

        result = []
        for sprint in sprints:
            tasks = list(
                session.exec(
                    sq_select(Task).where(Task.sprint_id == sprint.id)
                ).all()
            )
            todo_count = 0
            in_progress_count = 0
            done_count = 0
            for t in tasks:
                c = _canonical(t)
                if c == CanonicalStatus.DONE.value:
                    done_count += 1
                elif c == CanonicalStatus.IN_PROGRESS.value:
                    in_progress_count += 1
                else:
                    todo_count += 1

            result.append({
                "sprint": sprint,
                "tasks": tasks,
                "todo_count": todo_count,
                "in_progress_count": in_progress_count,
                "done_count": done_count,
            })
        return result

    def update_sprint(
        self,
        session: Session,
        sprint_id: uuid.UUID,
        data: SprintUpdateData,
        user: User,
    ) -> Sprint:
        sprint = self._load(session, sprint_id)
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
        self.rbac_service.check(
            session,
            Action.MANAGE_BOARD_COLUMN,
            user=user,
            project_id=sprint.project_id,
        )
        # Only PLANNED sprints with no tasks can be deleted
        if sprint.status != SprintStatus.PLANNED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PLANNED sprints can be deleted",
            )
        tasks = list(
            session.exec(sq_select(Task).where(Task.sprint_id == sprint_id)).all()
        )
        if tasks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete a sprint that still has tasks — move tasks to backlog first",
            )
        try:
            self.repo.delete(session, sprint)
            session.commit()
        except Exception:
            session.rollback()
            raise

    # ------------------------------------------------------------------ #
    # Lifecycle                                                          #
    # ------------------------------------------------------------------ #
    def start_sprint(
        self,
        session: Session,
        sprint_id: uuid.UUID,
        data: Any,
        user: User,
    ) -> Sprint:
        """Set sprint status=ACTIVE. Validates only one active sprint per project.
        Accepts optional name, goal, start_date, end_date overrides."""
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
        # Apply override fields from body
        fields = data.model_dump(exclude_unset=True) if data is not None else {}
        for field in ("name", "goal", "start_date", "end_date"):
            if field in fields:
                setattr(sprint, field, fields[field])

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
        self,
        session: Session,
        sprint_id: uuid.UUID,
        data: Any,
        user: User,
    ) -> Sprint:
        """Set sprint status=COMPLETED.
        move_open_to='backlog' → sprint_id=NULL on open tasks.
        move_open_to=<uuid_str> → sprint_id=that sprint for open tasks."""
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

        move_open_to: str = "backlog"
        if data is not None:
            fields = data.model_dump(exclude_unset=True) if hasattr(data, "model_dump") else {}
            move_open_to = fields.get("move_open_to", "backlog")

        target_sprint_id: uuid.UUID | None = None
        if move_open_to != "backlog":
            try:
                target_sprint_id = uuid.UUID(move_open_to)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="move_open_to must be 'backlog' or a valid sprint UUID",
                )
            # Validate target sprint exists in same project
            target_sprint = self.repo.get_by_id(session, target_sprint_id)
            if target_sprint is None or target_sprint.project_id != sprint.project_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target sprint not found in this project",
                )

        all_tasks = list(
            session.exec(sq_select(Task).where(Task.sprint_id == sprint_id)).all()
        )
        for task in all_tasks:
            if not self._is_task_done(session, task):
                task.sprint_id = target_sprint_id
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

    # ------------------------------------------------------------------ #
    # Insights                                                           #
    # ------------------------------------------------------------------ #
    def get_sprint_insights(
        self,
        session: Session,
        project_id: uuid.UUID,
        sprint_id: uuid.UUID,
        user: User,
    ) -> dict:
        """Return commitment and work_type breakdown for a sprint."""
        from app.models.enums import CanonicalStatus
        from app.repositories.custom_statuses_repository import CustomStatusesRepository
        from app.repositories.projects_repository import ProjectsRepository

        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        sprint = self._load(session, sprint_id)
        if sprint.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sprint not found in this project",
            )

        project = self._resolve_project(session, project_id)
        cs_repo = CustomStatusesRepository()
        all_cs = cs_repo.list_by_workspace(session, project.workspace_id)
        cs_map = {cs.id: cs for cs in all_cs}

        tasks = list(
            session.exec(sq_select(Task).where(Task.sprint_id == sprint_id)).all()
        )

        total_points = 0
        completed_points = 0
        work_types: dict[str, int] = {}

        for task in tasks:
            sp = task.story_point or 0
            total_points += sp

            # Check if done
            is_done = False
            if task.custom_status_id and task.custom_status_id in cs_map:
                cs = cs_map[task.custom_status_id]
                if cs.canonical_status == CanonicalStatus.DONE.value:
                    is_done = True
            if is_done:
                completed_points += sp

            # Work type counts
            t_type = (task.type or "TASK").upper()
            work_types[t_type] = work_types.get(t_type, 0) + 1

        return {
            "commitment": {
                "total_points": total_points,
                "completed_points": completed_points,
            },
            "work_types": work_types,
        }
