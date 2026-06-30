import uuid
from datetime import date, datetime

from app.core.base import CamelModel


class SprintCreate(CamelModel):
    name: str
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SprintUpdate(CamelModel):
    name: str | None = None
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None


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
