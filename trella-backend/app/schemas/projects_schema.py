import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel


class ProjectCreate(CamelModel):
    name: str = Field(min_length=1, max_length=255)
    key: str = Field(min_length=1, max_length=20)
    description: str | None = None


class ProjectPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    key: str
    description: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
