import uuid
from datetime import datetime

from app.core.base import CamelModel


class AuditLogPublic(CamelModel):
    id: uuid.UUID
    org_id: uuid.UUID
    action: str
    entity_id: uuid.UUID
    entity_type: str
    entity_title: str
    user_id: uuid.UUID
    user_image: str | None = None
    user_name: str
    created_at: datetime
    updated_at: datetime
