import uuid
from datetime import datetime

from app.core.base import CamelModel
from app.schemas.tasks_schema import TaskPublic


class EpicCreate(CamelModel):
    title: str
    description: str | None = None
    priority: str | None = None
    due_date: datetime | None = None
    story_point: int | None = None


class EpicUpdate(CamelModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    due_date: datetime | None = None
    story_point: int | None = None


class EpicPublic(CamelModel):
    id: uuid.UUID
    project_id: uuid.UUID
    board_id: uuid.UUID
    column_id: uuid.UUID
    title: str
    description: str | None
    priority: str
    due_date: datetime | None
    assignee_id: uuid.UUID | None
    custom_status_id: uuid.UUID | None
    position: int
    type: str
    story_point: int | None
    sprint_id: uuid.UUID | None
    epic_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class EpicWithTasksPublic(EpicPublic):
    child_tasks: list[TaskPublic] = []


class EpicProgressPublic(CamelModel):
    epic_id: uuid.UUID
    total_tasks: int
    completed_tasks: int
    story_points_total: int
    story_points_completed: int
    completion_percentage: float
