import uuid

from sqlmodel import Session, col, func, select

from app.models.tasks_model import Task

# Sentinel returned by max_position when a column has no tasks yet.
# The first task in an empty column receives position 0 (sentinel + 1).
EMPTY_COLUMN_POSITION_SENTINEL = -1


class TasksRepository:
    def create(self, session: Session, task: Task) -> Task:
        session.add(task)
        session.flush()
        return task

    def get(self, session: Session, task_id: uuid.UUID) -> Task | None:
        return session.get(Task, task_id)

    def list_by_column(self, session: Session, column_id: uuid.UUID) -> list[Task]:
        statement = (
            select(Task).where(Task.column_id == column_id).order_by(col(Task.position))
        )
        return list(session.exec(statement).all())

    def list_by_board(self, session: Session, board_id: uuid.UUID) -> list[Task]:
        statement = (
            select(Task)
            .where(Task.board_id == board_id)
            .order_by(col(Task.column_id), col(Task.position))
        )
        return list(session.exec(statement).all())

    def get_by_ids(self, session: Session, task_ids: list[uuid.UUID]) -> list[Task]:
        if not task_ids:
            return []
        statement = select(Task).where(col(Task.id).in_(task_ids))
        return list(session.exec(statement).all())

    def update(self, session: Session, task: Task) -> Task:
        session.add(task)
        session.flush()
        return task

    def delete(self, session: Session, task: Task) -> None:
        session.delete(task)
        session.flush()

    def max_position(self, session: Session, column_id: uuid.UUID) -> int:
        """Return max position in column, or EMPTY_COLUMN_POSITION_SENTINEL if empty."""
        statement = select(func.max(Task.position)).where(Task.column_id == column_id)
        result = session.exec(statement).one()
        return EMPTY_COLUMN_POSITION_SENTINEL if result is None else result

    def update_position_and_column(
        self,
        session: Session,
        task_id: uuid.UUID,
        position: int,
        column_id: uuid.UUID,
    ) -> None:
        task = session.get(Task, task_id)
        if task is None:
            return
        task.position = position
        task.column_id = column_id
        session.add(task)
        session.flush()

    def count_by_custom_status(
        self, session: Session, custom_status_id: uuid.UUID
    ) -> int:
        """Return how many tasks reference the given custom_status_id."""
        statement = select(func.count()).where(
            Task.custom_status_id == custom_status_id
        )
        return session.exec(statement).one()

    def list_backlog(self, session: Session, project_id: uuid.UUID) -> list[Task]:
        """Return all tasks for a project where sprint_id IS NULL, ordered by position."""
        statement = (
            select(Task)
            .where(Task.project_id == project_id, Task.sprint_id.is_(None))  # type: ignore[union-attr]
            .order_by(col(Task.column_id), col(Task.position))
        )
        return list(session.exec(statement).all())

    def list_subtasks(self, session: Session, parent_id: uuid.UUID) -> list[Task]:
        """Return all direct children (subtasks) of a task, ordered by position."""
        statement = (
            select(Task).where(Task.parent_id == parent_id).order_by(col(Task.position))
        )
        return list(session.exec(statement).all())
