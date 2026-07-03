import logging
import uuid
from typing import Any, Protocol

from fastapi import HTTPException, status
from sqlmodel import Session, col, select

from app.core.rbac import Action, RBACService
from app.models.enums import CanonicalStatus, TaskType
from app.models.tasks_model import Task
from app.models.users_model import User
from app.repositories.custom_statuses_repository import CustomStatusesRepository
from app.repositories.tasks_repository import TasksRepository
from app.services.activity_logs_service import ActivityLogsService

logger = logging.getLogger(__name__)

_EPIC_UPDATABLE_FIELDS = frozenset(
    {"title", "description", "priority", "due_date", "story_point"}
)


class EpicCreateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class EpicUpdateData(Protocol):
    def model_dump(self, *, exclude_unset: bool = ...) -> dict[str, Any]: ...


class EpicsService:
    def __init__(
        self,
        tasks_repo: TasksRepository | None = None,
        custom_statuses_repo: CustomStatusesRepository | None = None,
        rbac_service: RBACService | None = None,
        activity_logs_service: ActivityLogsService | None = None,
    ) -> None:
        self.tasks_repo = tasks_repo or TasksRepository()
        self.custom_statuses_repo = custom_statuses_repo or CustomStatusesRepository()
        self.rbac_service = rbac_service or RBACService()
        self.activity_logs_service = activity_logs_service or ActivityLogsService()

    # ------------------------------------------------------------------ #
    # Helpers                                                            #
    # ------------------------------------------------------------------ #
    def _load_epic(self, session: Session, epic_id: uuid.UUID) -> Task:
        task = self.tasks_repo.get(session, epic_id)
        if task is None or task.type != TaskType.EPIC.value:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Epic not found",
            )
        return task

    def _resolve_workspace_id(
        self, session: Session, project_id: uuid.UUID
    ) -> uuid.UUID:
        from app.models.projects_model import Project

        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project.workspace_id

    def _get_default_column(
        self, session: Session, project_id: uuid.UUID
    ) -> tuple[uuid.UUID, uuid.UUID]:
        """Return (board_id, column_id) for the first board/column of the project."""
        from app.models.board_columns_model import BoardColumn
        from app.models.boards_model import Board

        board = session.exec(
            select(Board)
            .where(Board.project_id == project_id)
            .order_by(col(Board.created_at))
        ).first()
        if board is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project has no board. Create a board before creating epics.",
            )
        column = session.exec(
            select(BoardColumn)
            .where(BoardColumn.board_id == board.id)
            .order_by(col(BoardColumn.position))
        ).first()
        if column is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Board has no columns. Create a column before creating epics.",
            )
        return board.id, column.id

    # ------------------------------------------------------------------ #
    # CRUD                                                               #
    # ------------------------------------------------------------------ #
    def create_epic(
        self,
        session: Session,
        project_id: uuid.UUID,
        data: EpicCreateData,
        user: User,
    ) -> Task:
        """Create a Task with type=EPIC. Requires MANAGE_TASK."""
        workspace_id = self._resolve_workspace_id(session, project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=project_id,
        )
        fields = data.model_dump(exclude_unset=False)
        board_id, column_id = self._get_default_column(session, project_id)
        max_pos = self.tasks_repo.max_position(session, column_id)

        from app.models.tasks_model import DEFAULT_TASK_PRIORITY

        task = Task(
            project_id=project_id,
            column_id=column_id,
            board_id=board_id,
            title=fields.get("title", ""),
            description=fields.get("description"),
            priority=fields.get("priority") or DEFAULT_TASK_PRIORITY,
            due_date=fields.get("due_date"),
            story_point=fields.get("story_point"),
            type=TaskType.EPIC.value,
            position=max_pos + 1,
        )
        try:
            task = self.tasks_repo.create(session, task)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=project_id,
                task_id=task.id,
                actor=user,
                action="EPIC_CREATED",
                new_value={"epic_id": str(task.id), "title": task.title},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)
        return task

    def get_epic(self, session: Session, epic_id: uuid.UUID, user: User) -> Task:
        epic = self._load_epic(session, epic_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=epic.project_id,
        )
        return epic

    def list_epics(
        self, session: Session, project_id: uuid.UUID, user: User
    ) -> list[Task]:
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=project_id,
        )
        statement = (
            select(Task)
            .where(
                Task.project_id == project_id,
                Task.type == TaskType.EPIC.value,
            )
            .order_by(col(Task.created_at))
        )
        return list(session.exec(statement).all())

    def update_epic(
        self,
        session: Session,
        epic_id: uuid.UUID,
        data: EpicUpdateData,
        user: User,
    ) -> Task:
        epic = self._load_epic(session, epic_id)
        workspace_id = self._resolve_workspace_id(session, epic.project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=epic.project_id,
        )
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field in _EPIC_UPDATABLE_FIELDS:
                setattr(epic, field, value)
        try:
            epic = self.tasks_repo.update(session, epic)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=epic.project_id,
                task_id=epic.id,
                actor=user,
                action="EPIC_UPDATED",
                new_value=updates,
            )
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(epic)
        return epic

    def delete_epic(self, session: Session, epic_id: uuid.UUID, user: User) -> None:
        epic = self._load_epic(session, epic_id)
        workspace_id = self._resolve_workspace_id(session, epic.project_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=epic.project_id,
        )
        # Detach child tasks from this epic
        statement = select(Task).where(Task.epic_id == epic_id)
        children = list(session.exec(statement).all())
        for child in children:
            child.epic_id = None
            session.add(child)
        try:
            session.flush()
            self.tasks_repo.delete(session, epic)
            self.activity_logs_service.record(
                session,
                workspace_id=workspace_id,
                project_id=epic.project_id,
                actor=user,
                action="EPIC_DELETED",
                old_value={"epic_id": str(epic_id), "title": epic.title},
            )
            session.commit()
        except Exception:
            session.rollback()
            raise

    # ------------------------------------------------------------------ #
    # Epic + child tasks                                                 #
    # ------------------------------------------------------------------ #
    def get_epic_with_tasks(
        self, session: Session, epic_id: uuid.UUID, user: User
    ) -> tuple[Task, list[Task]]:
        epic = self._load_epic(session, epic_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=epic.project_id,
        )
        statement = (
            select(Task).where(Task.epic_id == epic_id).order_by(col(Task.position))
        )
        children = list(session.exec(statement).all())
        return epic, children

    def get_epic_progress(
        self, session: Session, epic_id: uuid.UUID, user: User
    ) -> dict:
        epic = self._load_epic(session, epic_id)
        self.rbac_service.check(
            session,
            Action.VIEW_PROJECT_RESOURCE,
            user=user,
            project_id=epic.project_id,
        )
        statement = select(Task).where(Task.epic_id == epic_id)
        children = list(session.exec(statement).all())

        total = len(children)
        completed = 0
        sp_total = 0
        sp_completed = 0

        from app.models.custom_statuses_model import CustomStatus

        for child in children:
            sp = child.story_point or 0
            sp_total += sp
            is_done = False
            if child.custom_status_id is not None:
                cs = session.get(CustomStatus, child.custom_status_id)
                if cs and cs.canonical_status == CanonicalStatus.DONE.value:
                    is_done = True
            if is_done:
                completed += 1
                sp_completed += sp

        pct = (completed / total * 100.0) if total > 0 else 0.0
        return {
            "epic_id": epic_id,
            "total_tasks": total,
            "completed_tasks": completed,
            "story_points_total": sp_total,
            "story_points_completed": sp_completed,
            "completion_percentage": round(pct, 2),
        }

    # ------------------------------------------------------------------ #
    # Task ↔ Epic association                                           #
    # ------------------------------------------------------------------ #
    def add_task_to_epic(
        self,
        session: Session,
        epic_id: uuid.UUID,
        task_id: uuid.UUID,
        user: User,
    ) -> Task:
        epic = self._load_epic(session, epic_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=epic.project_id,
        )
        task = self.tasks_repo.get(session, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        if task.project_id != epic.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task does not belong to the same project as the epic",
            )
        if task.type == TaskType.EPIC.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An epic cannot be a child of another epic",
            )
        task.epic_id = epic_id
        try:
            task = self.tasks_repo.update(session, task)
            session.commit()
        except Exception:
            session.rollback()
            raise
        session.refresh(task)
        return task

    def remove_task_from_epic(
        self,
        session: Session,
        epic_id: uuid.UUID,
        task_id: uuid.UUID,
        user: User,
    ) -> None:
        epic = self._load_epic(session, epic_id)
        self.rbac_service.check(
            session,
            Action.MANAGE_TASK,
            user=user,
            project_id=epic.project_id,
        )
        task = self.tasks_repo.get(session, task_id)
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        if task.epic_id != epic_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Task is not assigned to this epic",
            )
        task.epic_id = None
        try:
            task = self.tasks_repo.update(session, task)
            session.commit()
        except Exception:
            session.rollback()
            raise
