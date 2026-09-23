import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel

from app.core.base import CamelModel


class OrganizationCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)


class OrganizationPublic(CamelModel):
    id: uuid.UUID
    name: str
    mode: str = "KANBAN"
    created_at: datetime
    updated_at: datetime
