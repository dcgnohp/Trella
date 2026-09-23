import uuid
from datetime import date, datetime

from app.core.base import CamelModel
from app.schemas.tasks_schema import TaskPublic


class SprintCreate(CamelModel):
    name: str | None = None
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SprintUpdate(CamelModel):
    name: str | None = None
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SprintStart(CamelModel):
    name: str | None = None
    goal: str | None = None
    start_date: date
    end_date: date


class SprintComplete(CamelModel):
    # "backlog" or a sprint UUID string
    move_open_to: str = "backlog"


class SprintPublic(CamelModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    goal: str | None
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime


class SprintWithTasks(CamelModel):
    """Sprint list item — includes tasks + kanban status counts."""

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    goal: str | None
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime
    updated_at: datetime
    tasks: list[TaskPublic] = []
    todo_count: int = 0
    in_progress_count: int = 0
    done_count: int = 0


class SprintInsights(CamelModel):
    commitment: dict
    work_types: dict
