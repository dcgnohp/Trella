import uuid
from datetime import date

from sqlalchemy import Text
from sqlmodel import Field

from app.core.base import TimestampMixin, UUIDMixin
from app.models.enums import SprintStatus


class Sprint(UUIDMixin, TimestampMixin, table=True):
    __tablename__ = "sprints"  # type: ignore

    project_id: uuid.UUID = Field(foreign_key="projects.id", ondelete="CASCADE")
    name: str = Field(max_length=255)
    goal: str | None = Field(default=None, sa_type=Text, nullable=True)
    status: str = Field(default=SprintStatus.PLANNED, max_length=20)
    start_date: date | None = Field(default=None, nullable=True)
    end_date: date | None = Field(default=None, nullable=True)
