import uuid
from datetime import datetime

from app.core.base import CamelModel


class CustomStatusEmbed(CamelModel):
    id: uuid.UUID
    name: str
    color: str | None = None
    canonical_status: str | None = None


class TaskUpdate(CamelModel):
    """Partial update payload; only explicitly provided fields are applied."""

    title: str | None = None
    description: str | None = None
    priority: str | None = None
    due_date: datetime | None = None
    assignee_id: uuid.UUID | None = None
    custom_status_id: uuid.UUID | None = None
    column_id: uuid.UUID | None = None
    # Jira-mode fields
    type: str | None = None
    story_point: int | None = None
    sprint_id: uuid.UUID | None = None
    epic_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None


class TaskCreate(CamelModel):
    title: str
    type: str | None = None
    parent_id: uuid.UUID | None = None
    due_date: datetime | None = None
    assignee_id: uuid.UUID | None = None
    story_point: int | None = None


class AssigneeUpdate(CamelModel):
    assignee_id: uuid.UUID


class ParentUpdate(CamelModel):
    parent_id: uuid.UUID | None


class StoryPointUpdate(CamelModel):
    story_point: int


class TaskPublic(CamelModel):
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
    custom_status: CustomStatusEmbed | None = None
    position: int
    # Jira-mode fields
    type: str = "TASK"
    story_point: int | None = None
    sprint_id: uuid.UUID | None = None
    epic_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    issue_key: str | None = None
    created_at: datetime
    updated_at: datetime
