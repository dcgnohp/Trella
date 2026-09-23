import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class PlanCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: str | None = "PLANNING"
    board_ids: list[uuid.UUID] = Field(default_factory=list)


class PlanUpdate(CamelModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None


class PlanPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    description: str | None
    status: str = "PLANNING"
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PlanWithBoardsPublic(PlanPublic):
    board_ids: list[uuid.UUID] = []
