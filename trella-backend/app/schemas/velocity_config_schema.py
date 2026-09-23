import uuid

from app.core.base import CamelModel


class VelocityConfigPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    hours_per_point: float


class VelocityConfigUpdate(CamelModel):
    hours_per_point: float
