import uuid
from datetime import datetime

from pydantic import Field

from app.core.base import CamelModel
from app.models.enums import CanonicalStatus


class CustomStatusCreate(CamelModel):
    name: str
    color: str | None = None
    canonical_status: CanonicalStatus | None = None


class CustomStatusUpdate(CamelModel):
    name: str | None = None
    color: str | None = None
    canonical_status: CanonicalStatus | None = None


class MappingUpdate(CamelModel):
    canonical_status: CanonicalStatus | None = None


class CustomStatusPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    name: str
    color: str | None
    canonical_status: str | None
    created_at: datetime
    updated_at: datetime


class MappingSummary(CamelModel):
    total: int
    mapped: int
    unmapped: int
    by_canonical: dict[str, int] = Field(default_factory=dict)
