import uuid
from datetime import datetime
from typing import Any

from app.core.base import CamelModel


class ActivityLogPublic(CamelModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    project_id: uuid.UUID
    task_id: uuid.UUID | None = None
    actor_id: uuid.UUID
    action: str
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
